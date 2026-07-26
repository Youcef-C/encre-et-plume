import { Injectable, Logger } from '@nestjs/common';
import {
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { EDITOR_WS_EVENTS } from '@encre-et-plume/shared';
import type { CaseCommentDto, WsEditorJoin, WsEditorUpdate, WsEditorAwareness, WsEditorStateResponse } from '@encre-et-plume/shared';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifySessionToken } from '../auth/session-token';
import { isMemberOf } from './projects.service';
import { hasGroupPermission } from './members.service';

/** Parse a single cookie value from a raw Cookie header (mirrors MessagingGateway — no dep). */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

function webOrigins(): string[] {
  return (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

const pageRoom = (pageId: string) => `editor:page:${pageId}`;
const assetRoom = (assetId: string) => `editor:asset:${assetId}`;

/**
 * CS-4 collaborative editor gateway. A SEPARATE namespace ('/editor') on the SAME socket.io server as
 * MessagingGateway — same HTTP port, same Redis adapter (wired in main.ts) so editor events fan out
 * across N stateless instances. Same `ep_session` cookie handshake + fail-closed auth.
 *
 * The server holds NO Yjs document: Postgres is the shared memory. CRDT/awareness payloads are opaque
 * base64 relayed verbatim (never decoded). A joiner reads persisted `ydocState` + pending `ScenarioUpdate`
 * rows AFTER joining (so nothing is missed) and also broadcasts a state-request to any live peer.
 */
@Injectable()
@WebSocketGateway({ namespace: 'editor', cors: { origin: webOrigins(), credentials: true } })
export class EditorGateway implements OnGatewayInit {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(EditorGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  // Regression fix (2026-07-15): auth used to run in `handleConnection` (an `OnGatewayConnection`
  // lifecycle hook), which Socket.IO does NOT await before dispatching that SAME socket's first
  // message — the client emits `editor:join` immediately on 'connect' (editor-collab.ts), which could
  // reach `handleJoin` before this async check finished setting `socket.data.accountId`, silently
  // dropping the join forever (no client-side retry/timeout) — reproduced live as a two-context test
  // stuck at "1 en ligne" for 60s+ straight. Socket.IO connection MIDDLEWARE (`server.use`) IS awaited
  // before 'connection'/any message fires for that socket, closing the race at its source.
  afterInit(server: Server): void {
    server.use((socket, next) => void this.authenticate(socket as Socket, next));
  }

  async authenticate(socket: Socket, next: (err?: Error) => void): Promise<void> {
    const token = readCookie(socket.handshake.headers.cookie, 'ep_session');
    if (!token) return next(new Error('unauthorized'));
    let verified;
    try {
      verified = await verifySessionToken(this.jwt, this.redis, token);
    } catch {
      return next(new Error('unauthorized')); // Redis outage → fail closed
    }
    if (!verified) return next(new Error('unauthorized'));
    socket.data['accountId'] = verified.accountId;
    next();
  }

  @SubscribeMessage(EDITOR_WS_EVENTS.join)
  async handleJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: WsEditorJoin): Promise<void> {
    const accountId = socket.data['accountId'] as string | undefined;
    if (!accountId || !body?.pageId) return;

    const page = await this.prisma.page.findUnique({
      where: { id: body.pageId },
      select: {
        id: true,
        projectId: true,
        project: {
          select: {
            ownerId: true,
            work: { select: { creators: { select: { accountId: true, groupRole: true, permissions: true } } } },
          },
        },
      },
    });
    // Membership gate — a non-member never joins the room (silent, no existence probe).
    if (!page || !isMemberOf(page.project as never, accountId)) return;
    // CS-10 write gate — a member without « Écriture » joins read-only (presence still works).
    const canWrite = hasGroupPermission(page.project as never, accountId, 'ecriture');
    socket.data['canWrite'] = canWrite;

    // D9 — explicit assetId opens a CHOSEN scenario/texte asset room. Invalid (foreign project / wrong
    // type) → silently drop the join (same no-leak rule as the REST resolver).
    let asset: { id: string } | null;
    if (body.assetId) {
      asset = await this.prisma.asset.findFirst({
        where: { id: body.assetId, projectId: page.projectId, type: { in: ['scenario', 'texte'] } },
        select: { id: true },
      });
      if (!asset) return;
    } else {
      asset = await this.findLinkedScenarioAsset(body.pageId);
    }
    const room = asset ? assetRoom(asset.id) : pageRoom(body.pageId);
    socket.data['editorRoom'] = room;
    await socket.join(room);

    // Read persisted state AFTER joining so no concurrent live update is missed.
    let ydocState: string | null = null;
    let updates: string[] = [];
    if (asset) {
      const doc = await this.prisma.scenarioDocument.findUnique({
        where: { assetId: asset.id },
        select: { id: true, ydocState: true, updates: { select: { update: true }, orderBy: { createdAt: 'asc' } } },
      });
      if (doc) {
        ydocState = Buffer.from(doc.ydocState).toString('base64');
        updates = doc.updates.map((u) => Buffer.from(u.update).toString('base64'));
      }
    }
    const peers = (await this.server.in(room).fetchSockets()).length;
    socket.emit(EDITOR_WS_EVENTS.sync, { ydocState, updates, initialHtml: null, peers, canWrite });
    // Ask any live peer for its full encoded state (covers the DB-read → live-edit window).
    socket.to(room).emit(EDITOR_WS_EVENTS.stateRequest, {});
  }

  @SubscribeMessage(EDITOR_WS_EVENTS.update)
  async handleUpdate(@ConnectedSocket() socket: Socket, @MessageBody() body: WsEditorUpdate): Promise<void> {
    const room = socket.data['editorRoom'] as string | undefined;
    if (!room || !body?.u) return;
    // CS-10: a read-only member's edits are dropped server-side (never trust the client's editable flag).
    if (socket.data['canWrite'] === false) return;
    socket.to(room).emit(EDITOR_WS_EVENTS.update, { u: body.u }); // relay to peers (not sender)
    // Append to the pending log when materialized (room is editor:asset:<id>). Fire-and-forget: a lost
    // row is recovered by peer sync / the next autosave.
    if (room.startsWith('editor:asset:')) {
      const assetId = room.slice('editor:asset:'.length);
      this.appendUpdate(assetId, body.u).catch((e) => this.logger.debug(`update append skipped: ${(e as Error).message}`));
    }
  }

  @SubscribeMessage(EDITOR_WS_EVENTS.awareness)
  handleAwareness(@ConnectedSocket() socket: Socket, @MessageBody() body: WsEditorAwareness): void {
    const room = socket.data['editorRoom'] as string | undefined;
    if (!room || !body?.a) return;
    socket.to(room).emit(EDITOR_WS_EVENTS.awareness, { a: body.a }); // presence/cursors/selections/typing all ride awareness
  }

  @SubscribeMessage(EDITOR_WS_EVENTS.stateResponse)
  handleStateResponse(@ConnectedSocket() socket: Socket, @MessageBody() body: WsEditorStateResponse): void {
    const room = socket.data['editorRoom'] as string | undefined;
    if (!room || !body?.s) return;
    socket.to(room).emit(EDITOR_WS_EVENTS.stateResponse, { s: body.s }); // peer seeding/freshness
  }

  /** Called by the service after first save: tell pre-materialization clients to rejoin the asset room. */
  emitMaterialized(pageId: string, assetId: string): void {
    if (!this.server) return; // worker context — best-effort
    this.server.to(pageRoom(pageId)).emit(EDITOR_WS_EVENTS.materialized, { assetId });
  }

  /** Called by the service after a comment commits: broadcast it to the document room. */
  emitComment(assetId: string, comment: CaseCommentDto): void {
    if (!this.server) return;
    this.server.to(assetRoom(assetId)).emit(EDITOR_WS_EVENTS.comment, { comment });
  }

  /** CS-15 — called by the service after a comment delete commits: peers drop it live. */
  emitCommentDeleted(assetId: string, id: string): void {
    if (!this.server) return;
    this.server.to(assetRoom(assetId)).emit(EDITOR_WS_EVENTS.commentDeleted, { id });
  }

  private async appendUpdate(assetId: string, u: string): Promise<void> {
    const doc = await this.prisma.scenarioDocument.findUnique({ where: { assetId }, select: { id: true } });
    if (!doc) return;
    await this.prisma.scenarioUpdate.create({ data: { documentId: doc.id, update: Buffer.from(u, 'base64') } });
  }

  /** First scenario link (createdAt asc); falls back to a texte link — mirrors the modal's Scénario section. */
  private async findLinkedScenarioAsset(pageId: string): Promise<{ id: string } | null> {
    for (const type of ['scenario', 'texte'] as const) {
      const link = await this.prisma.assetPageLink.findFirst({
        where: { pageId, asset: { type } },
        orderBy: { createdAt: 'asc' },
        select: { asset: { select: { id: true } } },
      });
      if (link) return link.asset;
    }
    return null;
  }
}
