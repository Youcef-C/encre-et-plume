import { Injectable, Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WS_EVENTS } from '@encre-et-plume/shared';
import type { WsMessageNew, WsConversationRead, WsTypingClient } from '@encre-et-plume/shared';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStore } from '../security/session-store.service';
import type { RealtimeNotifier } from '../notifications/notifications.service';
import { verifySessionToken } from '../auth/session-token';

const PRESENCE_TOUCH_INTERVAL_MS = 2 * 60 * 1000; // keep idle-but-connected widget users "en ligne" (MC-8)

/** Parse a single cookie value from a raw Cookie header (avoids a dep — 3-line manual parse). */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/** WEB_ORIGIN parsing mirrors main.ts so the socket CORS matches the REST CORS exactly. */
function webOrigins(): string[] {
  return (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * MC-9 realtime gateway. Runs on the same HTTP server/port as REST, on the default namespace, with the
 * Redis adapter (wired in main.ts) so emits fan out across N stateless instances. Per-USER rooms only
 * (`user:<accountId>`) — the server resolves participants from the DB at send time and targets their
 * rooms, so membership is authorized per emit and nothing leaks to non-participants.
 *
 * Handshake auth is the SAME `ep_session` cookie verification as SessionGuard (shared verifySessionToken):
 * a socket cannot outlive a logout/reset. Unauthenticated handshakes are disconnected (fail closed).
 */
@Injectable()
@WebSocketGateway({ cors: { origin: webOrigins(), credentials: true } })
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect, RealtimeNotifier {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(MessagingGateway.name);
  // socket.id → presence-touch interval; cleared on disconnect (no other in-process socket state).
  private readonly presenceTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly sessionStore: SessionStore,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = readCookie(socket.handshake.headers.cookie, 'ep_session');
    if (!token) return void socket.disconnect(true);

    let verified;
    try {
      verified = await verifySessionToken(this.jwt, this.redis, token);
    } catch {
      // Redis outage during the security checks → fail closed (never authenticate an unverifiable socket).
      return void socket.disconnect(true);
    }
    if (!verified) return void socket.disconnect(true);

    const accountId = verified.accountId;
    socket.data['accountId'] = accountId;
    socket.data['jti'] = verified.jti;
    await socket.join(`user:${accountId}`);

    // Presence ("also backs MC-8"): touch the F-18 session index now + on an interval while connected.
    const ua = (socket.handshake.headers['user-agent'] as string | undefined) ?? null;
    const ip = socket.handshake.address ?? null;
    if (verified.jti) {
      const touch = () => this.sessionStore.touch(accountId, verified.jti!, ua, ip).catch(() => {});
      await touch();
      const timer = setInterval(() => void touch(), PRESENCE_TOUCH_INTERVAL_MS);
      timer.unref?.(); // never hold the event loop open (clean test/process shutdown)
      this.presenceTimers.set(socket.id, timer);
    }
  }

  handleDisconnect(socket: Socket): void {
    const timer = this.presenceTimers.get(socket.id);
    if (timer) {
      clearInterval(timer);
      this.presenceTimers.delete(socket.id);
    }
  }

  @SubscribeMessage(WS_EVENTS.typing)
  async handleTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: WsTypingClient,
  ): Promise<void> {
    const accountId = socket.data['accountId'] as string | undefined;
    if (!accountId || !body?.conversationId) return;

    // Participant gate: single membership query. Non-participant → drop silently (no error channel that
    // could probe whether the conversation exists).
    const membership = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_accountId: { conversationId: body.conversationId, accountId } },
      select: { accountId: true },
    });
    if (!membership) return;

    const others = await this.otherParticipantRooms(body.conversationId, accountId);
    if (others.length === 0) return;
    this.server.to(others).emit(WS_EVENTS.typing, {
      conversationId: body.conversationId,
      userId: accountId,
      isTyping: !!body.isTyping,
    });
  }

  /** Emit a new message to every participant's user room (called by MessagesService after commit). */
  emitMessageNew(recipientIds: string[], payload: WsMessageNew): void {
    if (recipientIds.length === 0) return;
    this.server.to(recipientIds.map((id) => `user:${id}`)).emit(WS_EVENTS.messageNew, payload);
  }

  /** Emit a read receipt to the OTHER participants' user rooms. */
  emitConversationRead(recipientIds: string[], payload: WsConversationRead): void {
    if (recipientIds.length === 0) return;
    this.server.to(recipientIds.map((id) => `user:${id}`)).emit(WS_EVENTS.conversationRead, payload);
  }

  /**
   * BE-RT1 (RealtimeNotifier): push a payload-less "refetch unread counts" nudge to the recipient's OWN
   * user room whenever any F-5 notification is created. The Redis adapter fans this to whatever instance
   * holds the socket. No-op when there's no socket server (worker context) — best-effort, never throws.
   */
  notifyUnreadChanged(recipientId: string): void {
    if (!this.server) return;
    this.server.to(`user:${recipientId}`).emit(WS_EVENTS.unreadChanged);
  }

  private async otherParticipantRooms(conversationId: string, exceptId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, accountId: { not: exceptId } },
      select: { accountId: true },
    });
    // Defensive self-filter (the query already excludes exceptId): never echo typing back to the sender.
    return rows.filter((r) => r.accountId !== exceptId).map((r) => `user:${r.accountId}`);
  }
}
