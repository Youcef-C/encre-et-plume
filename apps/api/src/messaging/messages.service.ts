import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ConversationItem,
  ConversationsResponse,
  CreateConversationRequest,
  MarkReadResponse,
  MessageAttachment,
  MessageDto,
  MessagesPage,
  SendMessageRequest,
  WsMessageNew,
} from '@encre-et-plume/shared';
import {
  CONVERSATIONS_PAGE_MAX,
  CONVERSATIONS_PAGE_SIZE,
  GROUP_NAME_MAX_LENGTH,
  MESSAGE_MAX_ATTACHMENTS,
  MESSAGE_MAX_LENGTH,
  MESSAGES_PAGE_MAX,
  MESSAGES_PAGE_SIZE,
  SEND_RATE_LIMIT,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QueueService } from '../queue/queue.service';
import { PresenceService } from '../connections/presence.service';
import { MessagingGateway } from './messaging.gateway';
import { BlocksService } from '../blocks/blocks.service';

// No-existence-leak: unknown conversation AND non-participant both return this 404 (MC-7/MC-8 pattern).
const NOT_FOUND = 'Conversation introuvable.';

interface PageOpts {
  cursor?: string;
  limit?: number;
}

// Shape of a participant row with its account, as loaded via the include below.
interface PartRow {
  accountId: string;
  lastReadAt: Date;
  account: { id: string; displayName: string; profileSlug: string; avatar: string | null };
}
interface MsgRow {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachments: unknown;
  attachmentIds?: string[];
  createdAt: Date;
  sender?: { displayName: string };
}
interface ConvRow {
  id: string;
  type: 'dm' | 'group';
  name: string | null;
  projectId: string | null;
  lastMessageAt: Date;
  participants: PartRow[];
  messages: MsgRow[];
}

const ACCOUNT_SELECT = { id: true, displayName: true, profileSlug: true, avatar: true } as const;
const CONV_INCLUDE = {
  participants: { include: { account: { select: ACCOUNT_SELECT } } },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { sender: { select: { displayName: true } } },
  },
} as const;

/**
 * MC-9 messaging. Strict participants-only (session accountId, never a client field); every read/post
 * is gated by membership and a non-member gets a data-derived 404 (no existence leak). readBy[] is
 * derived from per-participant lastReadAt. Realtime fan-out + read receipts go through MessagingGateway;
 * offline recipients get an F-5 notification via the notifications-fanout queue (deduped per conversation).
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly presence: PresenceService,
    private readonly gateway: MessagingGateway,
    private readonly blocks: BlocksService,
  ) {}

  // ── GET /conversations ──────────────────────────────────────────────────────
  async listConversations(accountId: string, opts: PageOpts): Promise<ConversationsResponse> {
    const limit = clampLimit(opts.limit, CONVERSATIONS_PAGE_SIZE, CONVERSATIONS_PAGE_MAX);

    const convs = (await this.prisma.conversation.findMany({
      // MC-11 drift guard: the global salon room is its own dock widget, never a list row here.
      where: { type: { not: 'salon' }, participants: { some: { accountId } } },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: CONV_INCLUDE,
    })) as unknown as ConvRow[];

    // Unread per conversation for ALL my conversations in ONE query (not N+1): join messages to my
    // participant row, count those created after my lastReadAt and not sent by me.
    const unreadRows = (await this.prisma.$queryRaw`
      SELECT m."conversationId" AS "conversationId", COUNT(*) AS unread
      FROM "Message" m
      JOIN "ConversationParticipant" p
        ON p."conversationId" = m."conversationId" AND p."accountId" = ${accountId}
      JOIN "Conversation" c
        ON c."id" = m."conversationId" AND c."type" <> 'salon'
      WHERE m."senderId" <> ${accountId} AND m."createdAt" > p."lastReadAt"
      GROUP BY m."conversationId"
    `) as { conversationId: string; unread: bigint | number }[];

    const unreadBy = new Map<string, number>();
    let totalUnread = 0;
    for (const r of unreadRows) {
      const n = Number(r.unread);
      unreadBy.set(r.conversationId, n);
      totalUnread += n;
    }

    const items = convs.map((c) => this.toItem(c, accountId, unreadBy.get(c.id) ?? 0));
    const nextCursor = items.length === limit ? (items[items.length - 1]?.id ?? null) : null;
    return { items, nextCursor, totalUnread };
  }

  // ── GET /conversations/:id/messages ─────────────────────────────────────────
  async getMessages(accountId: string, conversationId: string, opts: PageOpts): Promise<MessagesPage> {
    const conv = await this.loadForMember(conversationId, accountId);
    const limit = clampLimit(opts.limit, MESSAGES_PAGE_SIZE, MESSAGES_PAGE_MAX);

    const rows = (await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    })) as unknown as MsgRow[];

    const items = rows.map((m) => this.toMessageDto(m, conv.participants));
    const nextCursor = items.length === limit ? (items[items.length - 1]?.id ?? null) : null;
    return { items, nextCursor };
  }

  // ── POST /conversations/:id/messages ────────────────────────────────────────
  async sendMessage(accountId: string, conversationId: string, dto: SendMessageRequest): Promise<MessageDto> {
    const conv = await this.loadForMember(conversationId, accountId);

    const body = (dto.body ?? '').trim();
    if (body.length > MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(`Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.`);
    }
    const attachmentRefs = dto.attachments ?? [];
    if (body.length === 0 && attachmentRefs.length === 0) {
      throw new BadRequestException('Écrivez un message ou joignez un fichier.');
    }
    if (attachmentRefs.length > MESSAGE_MAX_ATTACHMENTS) {
      throw new BadRequestException(`Pas plus de ${MESSAGE_MAX_ATTACHMENTS} pièces jointes.`);
    }

    await this.enforceSendRateLimit(accountId);
    await this.assertCanSend(accountId, conv);

    const attachments = await this.resolveAttachments(accountId, attachmentRefs);

    // ACID: persist the message + bump the conversation ordering key together.
    const [created] = (await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId: accountId,
          body,
          attachments: attachments as unknown as object,
          attachmentIds: attachments.map((a) => a.mediaId),
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ])) as unknown as [MsgRow, unknown];

    const message = this.toMessageDto({ ...created, attachments }, conv.participants);

    // Side effects after commit: realtime emit (sync, first) + offline notification fan-out. Awaited so
    // a notification is never dropped and callers can rely on it (the emit itself is synchronous).
    await this.afterSend(conv, accountId, message);

    return message;
  }

  // ── POST /conversations ─────────────────────────────────────────────────────
  async createConversation(accountId: string, dto: CreateConversationRequest): Promise<ConversationItem> {
    if ('participantId' in dto && dto.participantId !== undefined) {
      return this.getOrCreateDm(accountId, dto.participantId);
    }
    if ('name' in dto) {
      return this.createGroup(accountId, dto.name, dto.participantIds ?? []);
    }
    throw new BadRequestException('Requête invalide.');
  }

  // ── POST /conversations/:id/read ────────────────────────────────────────────
  async markRead(accountId: string, conversationId: string): Promise<MarkReadResponse> {
    const conv = await this.loadForMember(conversationId, accountId);
    const now = new Date();

    await this.prisma.conversationParticipant.update({
      where: { conversationId_accountId: { conversationId, accountId } },
      data: { lastReadAt: now },
    });

    // Keep the F-5 header Messages badge honest: clear my message notifications for this conversation.
    await this.prisma.notification.updateMany({
      where: { recipientId: accountId, type: 'message', refId: conversationId, readAt: null },
      data: { readAt: now },
    });

    const others = conv.participants.filter((p) => p.accountId !== accountId).map((p) => p.accountId);
    this.gateway.emitConversationRead(others, {
      conversationId,
      userId: accountId,
      lastReadAt: now.toISOString(),
    });

    return { unreadCount: 0 };
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /** Load the conversation with participants+accounts; 404 if it doesn't exist OR the caller isn't a member. */
  private async loadForMember(conversationId: string, accountId: string): Promise<ConvRow> {
    const conv = (await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow | null;
    if (!conv || !conv.participants.some((p) => p.accountId === accountId)) {
      throw new NotFoundException(NOT_FOUND);
    }
    return conv;
  }

  private async enforceSendRateLimit(accountId: string): Promise<void> {
    // M4: NEVER honor the escape hatch in production.
    if (process.env['DISABLE_RATE_LIMIT'] === 'true' && process.env['NODE_ENV'] !== 'production') return;
    const key = `rl:msg:${accountId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, SEND_RATE_LIMIT.windowSec);
    if (count > SEND_RATE_LIMIT.max) {
      throw new HttpException('Vous envoyez des messages trop vite. Réessayez dans un instant.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // AD-6 seam: ban flag lands with AD-6 (still a no-op for that half). MC-10: a blocked pair cannot
  // exchange NEW DMs in EITHER direction — history stays readable, only new sends are refused, with the
  // story's neutral copy (no block disclosure). Group conversations are out of story scope (D7).
  private async assertCanSend(accountId: string, conv: ConvRow): Promise<void> {
    if (conv.type !== 'dm') return;
    const other = conv.participants.find((p) => p.accountId !== accountId);
    if (other && (await this.blocks.isBlockedPair(accountId, other.accountId))) {
      throw new BadRequestException("Impossible d'envoyer le message.");
    }
  }

  private async resolveAttachments(
    accountId: string,
    refs: { mediaId: string }[],
  ): Promise<MessageAttachment[]> {
    if (refs.length === 0) return [];
    const ids = [...new Set(refs.map((r) => r.mediaId))];
    const media = (await this.prisma.media.findMany({ where: { id: { in: ids } } })) as unknown as {
      id: string;
      ownerId: string;
      kind: string;
      status: string;
      bucketKey: string;
      contentType: string;
    }[];
    const byId = new Map(media.map((m) => [m.id, m]));

    return refs.map((ref) => {
      const m = byId.get(ref.mediaId);
      if (!m || m.ownerId !== accountId || m.kind !== 'attachment' || m.status !== 'ready') {
        throw new BadRequestException('Pièce jointe invalide.');
      }
      const name = m.bucketKey.split('/').pop() ?? 'fichier';
      const kind: 'image' | 'document' = m.contentType.startsWith('image/') ? 'image' : 'document';
      return { mediaId: m.id, name, kind };
    });
  }

  /** After-commit fan-out: realtime to everyone, F-5 notification to OFFLINE recipients (deduped). */
  private async afterSend(conv: ConvRow, senderId: string, message: MessageDto): Promise<void> {
    const senderName = conv.participants.find((p) => p.accountId === senderId)?.account.displayName ?? '';
    const conversationName = this.displayName(conv, senderId);
    const allIds = conv.participants.map((p) => p.accountId);

    const payload: WsMessageNew = { conversationId: conv.id, message, conversationName, senderName };
    this.gateway.emitMessageNew(allIds, payload);

    const recipientIds = allIds.filter((id) => id !== senderId);
    if (recipientIds.length === 0) return;
    const presence = await this.presence.get(recipientIds);
    for (const recipientId of recipientIds) {
      if (presence[recipientId]?.online) continue; // online → the socket already delivered it
      // Dedupe: one unread message notification per conversation until the recipient reads it.
      const existing = await this.prisma.notification.findFirst({
        where: { recipientId, type: 'message', refId: conv.id, readAt: null },
        select: { id: true },
      });
      if (existing) continue;
      await this.queue.enqueue(
        'notifications-fanout',
        'message',
        { recipientId, type: 'message', refId: conv.id, sourceUserId: senderId },
        { idempotencyKey: `msg-notif-${conv.id}-${recipientId}-${message.id}` },
      );
    }
  }

  private async getOrCreateDm(accountId: string, otherId: string): Promise<ConversationItem> {
    if (otherId === accountId) throw new BadRequestException('Vous ne pouvez pas discuter avec vous-même.');
    const other = await this.prisma.account.findFirst({ where: { id: otherId, deletedAt: null }, select: { id: true } });
    if (!other) throw new NotFoundException('Ce membre est introuvable.');
    // MC-10: a blocked user must not open a fresh DM around the wall — same neutral copy as send.
    if (await this.blocks.isBlockedPair(accountId, otherId)) {
      throw new BadRequestException("Impossible d'envoyer le message.");
    }

    const dmKey = [accountId, otherId].sort().join(':');
    const existing = (await this.prisma.conversation.findUnique({
      where: { dmKey },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow | null;
    if (existing) return this.toItem(existing, accountId, 0);

    const created = (await this.prisma.conversation.create({
      data: {
        type: 'dm',
        dmKey,
        participants: { create: [{ accountId }, { accountId: otherId }] },
      },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow;
    return this.toItem(created, accountId, 0);
  }

  private async createGroup(accountId: string, name: string, participantIds: string[]): Promise<ConversationItem> {
    const trimmed = (name ?? '').trim();
    if (trimmed.length === 0) throw new BadRequestException('Le nom du groupe est requis.');
    if (trimmed.length > GROUP_NAME_MAX_LENGTH) {
      throw new BadRequestException(`Le nom ne peut pas dépasser ${GROUP_NAME_MAX_LENGTH} caractères.`);
    }

    const distinctOthers = [...new Set(participantIds.filter((id) => id && id !== accountId))];
    const existing = distinctOthers.length
      ? ((await this.prisma.account.findMany({
          where: { id: { in: distinctOthers }, deletedAt: null },
          select: { id: true },
        })) as { id: string }[])
      : [];
    const validOthers = existing.map((a) => a.id);
    if (validOthers.length < 1) {
      // creator + ≥1 other = the ≥2-participant minimum (a 2-member group is drawn in the prototype).
      throw new BadRequestException('Ajoutez au moins un·e participant·e.');
    }

    const created = (await this.prisma.conversation.create({
      data: {
        type: 'group',
        name: trimmed,
        participants: { create: [accountId, ...validOthers].map((id) => ({ accountId: id })) },
      },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow;
    return this.toItem(created, accountId, 0);
  }

  // DM title is the OTHER party's display name; group title is the stored name.
  private displayName(conv: ConvRow, viewerId: string): string {
    if (conv.type === 'group') return conv.name ?? '';
    const other = conv.participants.find((p) => p.accountId !== viewerId);
    return other?.account.displayName ?? '';
  }

  private toItem(conv: ConvRow, viewerId: string, unreadCount: number): ConversationItem {
    const last = conv.messages?.[0];
    return {
      id: conv.id,
      type: conv.type,
      name: this.displayName(conv, viewerId),
      projectId: conv.projectId,
      participants: conv.participants.map((p) => ({
        userId: p.account.id,
        slug: p.account.profileSlug,
        name: p.account.displayName,
        avatarUrl: p.account.avatar,
      })),
      unreadCount,
      lastMessage: last
        ? {
            body: last.body || attachmentPreview(last.attachments),
            senderName: last.sender?.displayName ?? '',
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      lastMessageAt: conv.lastMessageAt.toISOString(),
    };
  }

  private toMessageDto(m: MsgRow, participants: PartRow[]): MessageDto {
    const attachments = normalizeAttachments(m.attachments);
    const readBy = participants
      .filter((p) => p.accountId !== m.senderId && p.lastReadAt >= m.createdAt)
      .map((p) => p.accountId);
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      attachments,
      createdAt: m.createdAt.toISOString(),
      readBy,
    };
  }
}

function clampLimit(raw: number | undefined, def: number, max: number): number {
  if (!raw || raw < 1) return def;
  return Math.min(Math.floor(raw), max);
}

function normalizeAttachments(raw: unknown): MessageAttachment[] {
  if (Array.isArray(raw)) return raw as MessageAttachment[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as MessageAttachment[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function attachmentPreview(raw: unknown): string {
  const list = normalizeAttachments(raw);
  return list[0]?.name ?? '';
}
