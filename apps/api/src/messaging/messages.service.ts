import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddParticipantRequest,
  ConversationItem,
  EditMessageRequest,
  MessageReplyRef,
  ConversationRequestAction,
  ConversationsResponse,
  CreateConversationRequest,
  MarkReadResponse,
  MessageAttachment,
  MessageDto,
  MessageLikesPage,
  MessagesPage,
  SendMessageRequest,
  WsMessageNew,
} from '@encre-et-plume/shared';
import {
  CONVERSATIONS_PAGE_MAX,
  CONVERSATIONS_PAGE_SIZE,
  DM_POLICIES,
  DM_POLICY_DEFAULT,
  GROUP_NAME_MAX_LENGTH,
  MESSAGE_LIKES_PAGE_MAX,
  MESSAGE_LIKES_PAGE_SIZE,
  MESSAGE_MAX_ATTACHMENTS,
  MESSAGE_MAX_LENGTH,
  MESSAGES_PAGE_MAX,
  MESSAGES_PAGE_SIZE,
  SEND_RATE_LIMIT,
} from '@encre-et-plume/shared';
import type { DmPolicy } from '@encre-et-plume/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QueueService } from '../queue/queue.service';
import { PresenceService } from '../connections/presence.service';
import { MessagingGateway, type MessageAudience } from './messaging.gateway';
import { loadMessageExtras, toReplyRef, type MessageExtras } from './message-extras';
import { BlocksService } from '../blocks/blocks.service';
import { ConnectionsService } from '../connections/connections.service';

// No-existence-leak: unknown conversation AND non-participant both return this 404 (MC-7/MC-8 pattern).
const NOT_FOUND = 'Conversation introuvable.';
// R2-4: DELETE /messages/:id answers this for an unknown id AND for a message the caller cannot see.
const MESSAGE_NOT_FOUND = 'Message introuvable.';

interface PageOpts {
  cursor?: string;
  limit?: number;
  filter?: 'requests';
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
  // MC-15
  editedAt?: Date | null;
  replyToId?: string | null;
  replyToDeleted?: boolean | null;
}
/** MC-15 R2-B: a like row joined to its account, as loaded by `listLikes`. */
interface LikeRow {
  accountId: string;
  createdAt: Date;
  account: { id: string; displayName: string; avatar: string | null };
}
interface ConvRow {
  id: string;
  // MC-15: the salon reuses this table, and its rows are refused edit/delete — so the type matters here.
  type: 'dm' | 'group' | 'salon';
  name: string | null;
  projectId: string | null;
  status: 'open' | 'requested' | 'declined';
  requestedBy: string | null;
  createdBy: string | null; // MC-12: group owner; null for dm/salon
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
    private readonly connections: ConnectionsService,
  ) {}

  // ── GET /conversations ──────────────────────────────────────────────────────
  async listConversations(accountId: string, opts: PageOpts): Promise<ConversationsResponse> {
    const limit = clampLimit(opts.limit, CONVERSATIONS_PAGE_SIZE, CONVERSATIONS_PAGE_MAX);

    // MC-9 delta: filter=requests → the recipient's incoming pending DM requests (backs the Demandes
    // tab). The main list shows open threads + the caller's OWN outgoing requests ("Demande envoyée");
    // incoming requests and every 'declined' row stay out. MC-11 drift guard: salon is never a list row.
    const requestsWhere: Prisma.ConversationWhereInput = {
      type: 'dm',
      status: 'requested',
      requestedBy: { not: accountId },
    };
    const where: Prisma.ConversationWhereInput =
      opts.filter === 'requests'
        ? { ...requestsWhere, participants: { some: { accountId } } }
        : {
            type: { not: 'salon' },
            participants: { some: { accountId } },
            OR: [{ status: 'open' }, { status: 'requested', requestedBy: accountId }],
          };

    const convs = (await this.prisma.conversation.findMany({
      where,
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
        ON p."conversationId" = m."conversationId" AND p."accountId" = ${accountId}::uuid
      JOIN "Conversation" c
        ON c."id" = m."conversationId" AND c."type" <> 'salon' AND c."status" = 'open'
      WHERE m."senderId" <> ${accountId}::uuid AND m."createdAt" > p."lastReadAt"
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
    // Always compute the incoming-requests count (backs the Demandes tab badge on every response).
    const requestsCount = await this.prisma.conversation.count({
      where: { ...requestsWhere, participants: { some: { accountId } } },
    });
    return { items, nextCursor, totalUnread, requestsCount };
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

    // MC-15: likes + resolved quotes for the WHOLE page in a fixed number of queries (never per row).
    const extras = await loadMessageExtras(this.prisma, rows, accountId);
    const items = rows.map((m) => this.toMessageDto(m, conv.participants, extras.get(m.id)));
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

    // MC-15: a quote must point INSIDE this conversation (400 otherwise) — checked before any write.
    const replyTo = await this.assertReplyTarget(dto.replyToId, conversationId);
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
          ...(replyTo ? { replyToId: replyTo.id } : {}),
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ])) as unknown as [MsgRow, unknown];

    // A brand-new message has no likes, and its quote is the row we just validated — no extra query.
    const message = this.toMessageDto({ ...created, attachments }, conv.participants, {
      likeCount: 0,
      likedByMe: false,
      replyTo,
    });

    // Side effects after commit: realtime emit (sync, first) + offline notification fan-out. Awaited so
    // a notification is never dropped and callers can rely on it (the emit itself is synchronous).
    await this.afterSend(conv, accountId, message);

    return message;
  }

  // ── DELETE /messages/:id ────────────────────────────────────────────────────
  /**
   * CS-8 D-3: the author destroys their own message. MC-9 shipped no delete at all; the project
   * Discussion panel creates messages, so the lifecycle needs its destroy — and the widget can adopt
   * the same route later.
   *
   * Order is authz-relevant: membership is checked BEFORE authorship, so a stranger gets the same
   * no-existence-leak 404 as an unknown id instead of a 403 that confirms the message exists.
   * R2-4: and the same 404 TEXT — the two paths used to differ («Message introuvable.» vs
   * «Conversation introuvable.»), which told a prober the id exists.
   * Moderation deletion (someone else's message) belongs to AD-5, not here.
   */
  async deleteMessage(accountId: string, messageId: string): Promise<void> {
    const { message, conv } = await this.loadMessageForMember(messageId, accountId);

    assertNotSalon(conv, 'supprimé');
    if (message.senderId !== accountId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres messages.');
    }

    await this.prisma.$transaction([
      // D-3: the FK nulls the children's `replyToId`, which would erase the fact that they quoted
      // anything. Record it first so their quote keeps rendering as « Message supprimé ».
      this.prisma.message.updateMany({
        where: { replyToId: messageId },
        data: { replyToDeleted: true },
      }),
      this.prisma.message.delete({ where: { id: messageId } }),
    ]);

    const audience = this.audience(conv);
    // MC-15: open threads drop the bubble live…
    this.gateway.emitMessageDeleted(audience, {
      conversationId: message.conversationId,
      messageId,
    });
    // …and the conversation LIST refetches so its preview stops quoting the deleted message.
    this.gateway.emitConversationUpdated(
      conv.participants.map((p) => p.accountId),
      { conversationId: message.conversationId },
    );
  }

  // ── PATCH /messages/:id (MC-15) ─────────────────────────────────────────────
  /**
   * The author fixes a typo. Author-only ON TOP of membership (never instead of it), same
   * "non-empty body or attachment" rule as a send, and `createdAt` is untouched so the edit never
   * reorders the thread (D-4). An edit does NOT re-notify (F-5) — the recipient was already told.
   */
  async editMessage(accountId: string, messageId: string, dto: EditMessageRequest): Promise<MessageDto> {
    const { message, conv } = await this.loadMessageForMember(messageId, accountId);

    assertNotSalon(conv, 'modifié');
    if (message.senderId !== accountId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres messages.');
    }

    const body = (dto.text ?? '').trim();
    if (body.length > MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(`Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.`);
    }
    if (body.length === 0 && normalizeAttachments(message.attachments).length === 0) {
      throw new BadRequestException('Écrivez un message ou joignez un fichier.');
    }

    const updated = (await this.prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
    })) as unknown as MsgRow;

    const extras = await loadMessageExtras(this.prisma, [updated], accountId);
    const dtoOut = this.toMessageDto(updated, conv.participants, extras.get(updated.id));
    this.gateway.emitMessageEdited(this.audience(conv), {
      conversationId: conv.id,
      messageId,
      body: dtoOut.body,
      editedAt: dtoOut.editedAt ?? new Date().toISOString(),
    });
    return dtoOut;
  }

  // ── POST/DELETE /messages/:id/like (MC-15) ──────────────────────────────────
  /**
   * Toggle the caller's like. Idempotent BOTH ways by construction: the composite PK makes a second
   * like the same row, and unliking what was never liked deletes zero rows and still answers 204.
   * Anyone in the conversation may like anyone's message (it is not author-scoped); a like never
   * notifies (noise).
   */
  async setLike(accountId: string, messageId: string, on: boolean): Promise<void> {
    const { conv } = await this.loadMessageForMember(messageId, accountId);

    if (on) {
      await this.prisma.messageLike.upsert({
        where: { messageId_accountId: { messageId, accountId } },
        create: { messageId, accountId },
        update: {},
      });
    } else {
      await this.prisma.messageLike.deleteMany({ where: { messageId, accountId } });
    }

    const likeCount = await this.prisma.messageLike.count({ where: { messageId } });
    this.gateway.emitMessageLiked(this.audience(conv), {
      conversationId: conv.id,
      messageId,
      userId: accountId,
      liked: on,
      likeCount,
    });
  }

  // ── GET /messages/:id/likes (MC-15 R2-B) ────────────────────────────────────
  /**
   * Who liked this message. Fetched ON DEMAND, when the reader opens the list — deliberately NOT a
   * field on the message DTO: every page of every thread would then carry likers almost nobody
   * opens, and the read path would lose its 2-queries-per-page property (proven by call count in the
   * spec). Same gate as every other message action: `loadMessageForMember`, so a stranger gets the
   * uniform 404 and there is NO new gate. MC-10: a blocked pair never appears in a list the caller
   * sees — filtered in the WHERE clause, so a page never silently shrinks under the caller.
   */
  async listLikes(accountId: string, messageId: string, opts: PageOpts): Promise<MessageLikesPage> {
    await this.loadMessageForMember(messageId, accountId);
    const limit = clampLimit(opts.limit, MESSAGE_LIKES_PAGE_SIZE, MESSAGE_LIKES_PAGE_MAX);
    const blocked = await this.blocks.blockedPairIds(accountId);

    const rows = (await this.prisma.messageLike.findMany({
      where: { messageId, ...(blocked.size > 0 ? { accountId: { notIn: [...blocked] } } : {}) },
      // (createdAt, accountId) is a total order, so the cursor can never skip or repeat a row.
      orderBy: [{ createdAt: 'desc' }, { accountId: 'desc' }],
      take: limit,
      ...(opts.cursor
        ? { cursor: { messageId_accountId: { messageId, accountId: opts.cursor } }, skip: 1 }
        : {}),
      include: { account: { select: { id: true, displayName: true, avatar: true } } },
    })) as unknown as LikeRow[];

    const items = rows.map((r) => ({
      accountId: r.accountId,
      displayName: r.account.displayName,
      avatar: r.account.avatar,
      createdAt: r.createdAt.toISOString(),
    }));
    return {
      items,
      nextCursor: items.length === limit ? (items[items.length - 1]?.accountId ?? null) : null,
    };
  }

  // ── POST /conversations ─────────────────────────────────────────────────────
  async createConversation(accountId: string, dto: CreateConversationRequest): Promise<ConversationItem> {
    if ('participantId' in dto && dto.participantId !== undefined) {
      return this.getOrCreateDm(accountId, dto.participantId);
    }
    // Group branch keyed on participantIds, not on `name`: since the follow-up made the name optional
    // ('name' in dto is false for an unnamed group), the participant list is what defines a group.
    if ('participantIds' in dto) {
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

  /**
   * MC-15 — the one gate every message-scoped action shares (delete, edit, like).
   *
   * Order is authz-relevant: membership is checked BEFORE authorship or any surface rule, so a
   * stranger gets the same no-existence-leak 404 as an unknown id — and the SAME 404 TEXT (R2-4), or
   * a prober learns the id exists. No new gate: `loadForMember` stays the seam.
   */
  private async loadMessageForMember(
    messageId: string,
    accountId: string,
  ): Promise<{ message: MsgRow; conv: ConvRow }> {
    const message = (await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        conversationId: true,
        body: true,
        attachments: true,
        createdAt: true,
        editedAt: true,
        replyToId: true,
        replyToDeleted: true,
      },
    })) as unknown as MsgRow | null;
    if (!message) throw new NotFoundException(MESSAGE_NOT_FOUND);

    const conv = await this.loadForMember(message.conversationId, accountId).catch((e) => {
      if (e instanceof NotFoundException) throw new NotFoundException(MESSAGE_NOT_FOUND);
      throw e;
    });
    return { message, conv };
  }

  /**
   * MC-15 — a reply is a quote, so its target must live in the SAME conversation; anything else is a
   * 400, never a cross-conversation leak. Returns the resolved quote so the send path can echo it
   * back without a second read. Public: the salon and the project thread call it through their own
   * send paths, so the rule has ONE definition.
   */
  async assertReplyTarget(replyToId: string | undefined, conversationId: string): Promise<MessageReplyRef | null> {
    if (!replyToId) return null;
    const parent = (await this.prisma.message.findUnique({
      where: { id: replyToId },
      select: {
        id: true,
        senderId: true,
        conversationId: true,
        body: true,
        attachments: true,
        sender: { select: { displayName: true } },
      },
    })) as
      | { id: string; senderId: string; conversationId: string; body: string; attachments: unknown; sender?: { displayName: string } }
      | null;
    if (!parent || parent.conversationId !== conversationId) {
      throw new BadRequestException("Ce message n'appartient pas à cette conversation.");
    }
    return toReplyRef(parent);
  }

  /** MC-15: who hears a message action — the public salon room, or this thread's participants. */
  private audience(conv: ConvRow): MessageAudience {
    return { salon: conv.type === 'salon', participantIds: conv.participants.map((p) => p.accountId) };
  }

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
    // MC-9 delta send-gating: a declined DM refuses BOTH parties with the neutral copy (decline vs block
    // is not disclosed, D2). A requested DM lets only the REQUESTER send opening message(s); the recipient
    // must accept first (the UI hides their composer — this is the server backstop, BE-6).
    if (conv.status === 'declined') {
      throw new BadRequestException("Impossible d'envoyer le message.");
    }
    if (conv.status === 'requested' && accountId !== conv.requestedBy) {
      throw new BadRequestException('Acceptez la demande pour répondre.');
    }
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

  // MC-9 delta: a DM to a non-contact is routed by the RECIPIENT's dmPolicy (F-19). Order is
  // authz-relevant — block check runs BEFORE any policy read so a blocked caller never learns the
  // target's dmPolicy (D3). Already-connected pairs always open a normal thread (policy governs
  // non-contacts only, D5). 'declined' rows re-request (D1). Existing open/requested rows are returned
  // as-is (policy never retro-closes a thread).
  private async getOrCreateDm(accountId: string, otherId: string): Promise<ConversationItem> {
    if (otherId === accountId) throw new BadRequestException('Vous ne pouvez pas discuter avec vous-même.');
    const other = await this.prisma.account.findFirst({
      where: { id: otherId, deletedAt: null },
      select: { id: true, preferences: true },
    });
    if (!other) throw new NotFoundException('Ce membre est introuvable.');
    // MC-10: a blocked user must not open a fresh DM around the wall — same neutral copy as send.
    if (await this.blocks.isBlockedPair(accountId, otherId)) {
      throw new BadRequestException("Impossible d'envoyer le message.");
    }

    const dmKey = [accountId, otherId].sort().join(':');
    const existing = (await this.prisma.conversation.findUnique({
      where: { dmKey },
      include: CONV_INCLUDE,
    })) as unknown as (ConvRow | null);
    if (existing) {
      if (existing.status === 'declined') {
        // Re-request: flip the row back to a pending request from the current caller (D1).
        const revived = (await this.prisma.conversation.update({
          where: { id: existing.id },
          data: { status: 'requested', requestedBy: accountId },
          include: CONV_INCLUDE,
        })) as unknown as ConvRow;
        return this.toItem(revived, accountId, 0);
      }
      return this.toItem(existing, accountId, 0); // 'open' or 'requested' — return current state
    }

    const status = await this.routeNewDm(accountId, otherId, other.preferences);
    if (status === 'refused') {
      throw new BadRequestException("Ce membre n'accepte que les messages de ses contacts.");
    }
    const created = (await this.prisma.conversation.create({
      data: {
        type: 'dm',
        dmKey,
        status,
        requestedBy: status === 'requested' ? accountId : null,
        participants: { create: [{ accountId }, { accountId: otherId }] },
      },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow;
    return this.toItem(created, accountId, 0);
  }

  /** Decide the initial status of a brand-new DM from the recipient's dmPolicy (F-19). */
  private async routeNewDm(
    callerId: string,
    otherId: string,
    rawPreferences: unknown,
  ): Promise<'open' | 'requested' | 'refused'> {
    if ((await this.connections.stateBetween(callerId, otherId)) === 'connected') return 'open';
    const dmPolicy = readDmPolicy(rawPreferences);
    if (dmPolicy === 'anyone') return 'open';
    if (dmPolicy === 'contacts') return 'refused';
    return 'requested'; // 'requests' (default)
  }

  /** BE-4: recipient responds to a DM request. Recipient-only; every other caller/state gets one 404. */
  async respondToRequest(
    accountId: string,
    conversationId: string,
    action: ConversationRequestAction,
  ): Promise<ConversationItem> {
    const conv = await this.loadForMember(conversationId, accountId); // 404 if unknown or non-participant
    // Recipient-only: the requester, a stranger, and a non-requested conversation all collapse to the
    // same 404 — no state disclosure (D2/D3).
    if (conv.type !== 'dm' || conv.status !== 'requested' || accountId === conv.requestedBy) {
      throw new NotFoundException(NOT_FOUND);
    }
    const updated = (await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: action === 'accept' ? 'open' : 'declined' },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow;

    // Both participants refetch their lists (requester's "Demande envoyée" clears on accept; the row
    // disappears on decline). Decline is otherwise silent — no notification (mirrors MC-8 decline).
    const ids = conv.participants.map((p) => p.accountId);
    this.gateway.emitConversationUpdated(ids, { conversationId });
    return this.toItem(updated, accountId, 0);
  }

  // ── MC-12: group management (add / kick / leave) ────────────────────────────

  /**
   * loadForMember (existing 404 no-leak) + group-only gate + standalone-only gate. dm/salon → 400.
   * MC-12 manages STANDALONE groups only; a project-linked group (projectId != null) has its membership
   * governed by CS-8/MC-3/CS-10 → 409.
   */
  private async loadGroupForMember(conversationId: string, accountId: string): Promise<ConvRow> {
    const conv = await this.loadForMember(conversationId, accountId); // 404: unknown OR non-member
    if (conv.type !== 'group') throw new BadRequestException('Réservé aux conversations de groupe.');
    if (conv.projectId !== null) throw new ConflictException('Ce groupe est géré par son projet.');
    return conv;
  }

  /**
   * POST /conversations/:id/participants — creator adds a member. Creator resolved from the DB row
   * (never a client claim); non-creator → 403. Idempotent: an already-member target is a no-op.
   */
  async addParticipant(
    accountId: string,
    conversationId: string,
    dto: AddParticipantRequest,
  ): Promise<ConversationItem> {
    const conv = await this.loadGroupForMember(conversationId, accountId);
    if (conv.createdBy !== accountId) {
      throw new ForbiddenException('Seul·e le·la créateur·rice du groupe peut ajouter des membres.');
    }
    const target = await this.prisma.account.findFirst({
      where: { id: dto.accountId, deletedAt: null },
      select: { id: true, preferences: true },
    });
    if (!target) throw new NotFoundException('Ce membre est introuvable.');

    // Same gate as createGroup: adding someone to an existing group must not become a way around
    // MC-10 blocks or F-19 dmPolicy. Checked against the CREATOR (the caller), who is the only role
    // allowed to add — so this mirrors "may this person message that person" exactly.
    if (await this.blocks.isBlockedPair(accountId, target.id)) {
      throw new BadRequestException("Impossible d'envoyer le message.");
    }
    if ((await this.routeNewDm(accountId, target.id, target.preferences)) === 'refused') {
      throw new BadRequestException("Impossible d'envoyer le message.");
    }

    // Idempotent: already a member → no-op, return the current item (no create, no emit).
    if (conv.participants.some((p) => p.accountId === dto.accountId)) {
      return this.toItem(conv, accountId, 0);
    }

    await this.prisma.conversationParticipant.create({
      data: { conversationId, accountId: dto.accountId },
    });
    const reloaded = await this.loadForMember(conversationId, accountId);
    const added = reloaded.participants.find((p) => p.accountId === dto.accountId);
    const allIds = reloaded.participants.map((p) => p.accountId);
    if (added) {
      this.gateway.emitParticipantAdded(allIds, {
        conversationId,
        participant: {
          userId: added.account.id,
          slug: added.account.profileSlug,
          name: added.account.displayName,
          avatarUrl: added.account.avatar,
        },
      });
    }
    return this.toItem(reloaded, accountId, 0);
  }

  /**
   * DELETE /conversations/:id/participants/:accountId — creator kicks another member. Cannot target
   * the owner (they use leave). Emits participant:removed + a persistent group_removed notification.
   */
  async removeParticipant(
    accountId: string,
    conversationId: string,
    targetId: string,
  ): Promise<ConversationItem> {
    const conv = await this.loadGroupForMember(conversationId, accountId);
    if (conv.createdBy !== accountId) {
      throw new ForbiddenException('Seul·e le·la créateur·rice du groupe peut retirer des membres.');
    }
    // Covers the creator self-targeting too (createdBy === accountId).
    if (targetId === conv.createdBy) {
      throw new BadRequestException('Le·la créateur·rice utilise « Quitter le groupe ».');
    }
    if (!conv.participants.some((p) => p.accountId === targetId)) {
      throw new NotFoundException('Ce membre ne fait pas partie du groupe.');
    }

    await this.prisma.conversationParticipant.delete({
      where: { conversationId_accountId: { conversationId, accountId: targetId } },
    });

    const allIds = conv.participants.map((p) => p.accountId); // incl. the removed member
    this.gateway.emitParticipantRemoved(allIds, {
      conversationId,
      userId: targetId,
      createdBy: conv.createdBy,
    });

    // Being kicked deserves a persistent notification regardless of presence (F-5 queue seam).
    await this.queue.enqueue(
      'notifications-fanout',
      'group_removed',
      { recipientId: targetId, type: 'group_removed', refId: conversationId, sourceUserId: accountId },
      { idempotencyKey: `group-removed-${conversationId}-${targetId}-${Date.now()}` },
    );

    const reloaded = await this.loadForMember(conversationId, accountId);
    return this.toItem(reloaded, accountId, 0);
  }

  /**
   * DELETE /conversations/:id/participants/me — any member leaves. Atomic: delete own row, then if the
   * leaver was the owner reassign createdBy to the earliest-joined remaining member (same tie-break as
   * the backfill), or delete the conversation (cascades participants + messages) when none remain. WS
   * is emitted ONLY after commit.
   */
  async leaveConversation(accountId: string, conversationId: string): Promise<void> {
    const conv = await this.loadGroupForMember(conversationId, accountId);
    const allPreviousIds = conv.participants.map((p) => p.accountId); // incl. the leaver

    let deleted = false;
    let newCreatedBy: string | null = conv.createdBy;
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.delete({
        where: { conversationId_accountId: { conversationId, accountId } },
      });
      const remaining = await tx.conversationParticipant.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }], // SAME ordering as the backfill
        select: { accountId: true },
      });
      if (remaining.length === 0) {
        await tx.conversation.delete({ where: { id: conversationId } });
        deleted = true;
      } else if (conv.createdBy === accountId) {
        newCreatedBy = remaining[0]!.accountId;
        await tx.conversation.update({ where: { id: conversationId }, data: { createdBy: newCreatedBy } });
      }
    });

    if (deleted) {
      this.gateway.emitConversationDeleted(allPreviousIds, { conversationId });
    } else {
      this.gateway.emitParticipantRemoved(allPreviousIds, {
        conversationId,
        userId: accountId,
        createdBy: newCreatedBy,
      });
    }
  }

  private async createGroup(
    accountId: string,
    name: string | undefined,
    participantIds: string[],
  ): Promise<ConversationItem> {
    // Follow-up 5b: the name is OPTIONAL (a group started from the widget's "＋ Conversation" flow has
    // none until PATCH /conversations/:id sets it). Blank → null → the participant-derived fallback.
    const trimmed = normalizeGroupName(name);

    const distinctOthers = [...new Set(participantIds.filter((id) => id && id !== accountId))];
    const existing = distinctOthers.length
      ? ((await this.prisma.account.findMany({
          where: { id: { in: distinctOthers }, deletedAt: null },
          select: { id: true, preferences: true },
        })) as { id: string; preferences: unknown }[])
      : [];
    // MC-10 blocks and F-19 dmPolicy apply here too. Without this, `{ participantIds: [X] }` was a
    // complete bypass of both: the DM arm refuses (getOrCreateDm), but a two-person "group" reaching
    // the same person did not — a blocked user could message their blocker, who saw it as unread.
    // Reject rather than silently drop, so the caller cannot probe who blocked them by diffing the
    // participant list against what they asked for; the message is the DM arm's, so a refusal here
    // discloses nothing a direct DM attempt would not.
    for (const other of existing) {
      if (await this.blocks.isBlockedPair(accountId, other.id)) {
        throw new BadRequestException("Impossible d'envoyer le message.");
      }
      if ((await this.routeNewDm(accountId, other.id, other.preferences)) === 'refused') {
        throw new BadRequestException("Impossible d'envoyer le message.");
      }
    }
    const validOthers = existing.map((a) => a.id);
    if (validOthers.length < 1) {
      // creator + ≥1 other = the ≥2-participant minimum (a 2-member group is drawn in the prototype).
      throw new BadRequestException('Ajoutez au moins un·e participant·e.');
    }

    const created = (await this.prisma.conversation.create({
      data: {
        type: 'group',
        name: trimmed, // null when unnamed

        createdBy: accountId, // MC-12: the creator owns the group
        participants: { create: [accountId, ...validOthers].map((id) => ({ accountId: id })) },
      },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow;
    return this.toItem(created, accountId, 0);
  }

  /**
   * PATCH /conversations/:id — set (or clear) a group's name after creation (follow-up 5b: the name
   * is optional at creation). Authz mirrors add/kick: CREATOR ONLY, read from the DB row, never a
   * client claim; a non-member gets the same no-existence-leak 404. An empty name clears it back to
   * the participant-derived fallback. Both participants refetch via conversation:updated.
   */
  async renameConversation(accountId: string, conversationId: string, name: string): Promise<ConversationItem> {
    const conv = await this.loadGroupForMember(conversationId, accountId); // 404 / 400 dm / 409 project
    if (conv.createdBy !== accountId) {
      throw new ForbiddenException('Seul·e le·la créateur·rice du groupe peut renommer le groupe.');
    }
    const trimmed = normalizeGroupName(name);

    const updated = (await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { name: trimmed },
      include: CONV_INCLUDE,
    })) as unknown as ConvRow;

    this.gateway.emitConversationUpdated(
      conv.participants.map((p) => p.accountId),
      { conversationId },
    );
    return this.toItem(updated, accountId, 0);
  }

  // DM title is the OTHER party's display name; group title is the stored name — or, when the group
  // has none (follow-up 5b), the other participants' names, so no surface ever renders an empty title.
  private displayName(conv: ConvRow, viewerId: string): string {
    if (conv.type === 'group') return conv.name?.trim() || participantsTitle(conv, viewerId);
    const other = conv.participants.find((p) => p.accountId !== viewerId);
    return other?.account.displayName ?? '';
  }

  private toItem(conv: ConvRow, viewerId: string, unreadCount: number): ConversationItem {
    const last = conv.messages?.[0];
    return {
      id: conv.id,
      type: conv.type,
      name: this.displayName(conv, viewerId),
      // The group's own name (null = unnamed → `name` above is the participant-derived fallback).
      customName: conv.type === 'group' ? (conv.name?.trim() || null) : null,
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
      // 'declined' rows are never returned by any route, so the client-facing type stays 'open'|'requested'.
      status: conv.status === 'requested' ? 'requested' : 'open',
      requestedBy: conv.status === 'requested' ? conv.requestedBy : null,
      createdBy: conv.createdBy, // MC-12: group owner; null for dm/salon
    };
  }

  private toMessageDto(m: MsgRow, participants: PartRow[], extras?: MessageExtras): MessageDto {
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
      // MC-15 — always present, so no client has to guess whether a surface fills them in.
      replyTo: extras?.replyTo ?? null,
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      likeCount: extras?.likeCount ?? 0,
      likedByMe: extras?.likedByMe ?? false,
    };
  }
}

/**
 * MC-15 — the ONE definition of "the salon is read-only once posted".
 *
 * The salon is a public room: erasing OR silently rewriting your own line after the room has read and
 * replied to it rewrites a shared record. Removal there is AD-5's (accountable, logged), never the
 * author's. Enforced server-side, not merely omitted from the menu — a UI-only omission is a fake gate.
 *
 * One guard rather than a copy per mutating route (review N-1): two branches doing their own version
 * of the same rule is what caused CS-8's REG-1. A third mutating route inherits it instead of
 * remembering it.
 */
function assertNotSalon(conv: { type: string }, verb: 'modifié' | 'supprimé'): void {
  if (conv.type === 'salon') {
    throw new ForbiddenException(`Un message du salon ne peut pas être ${verb}.`);
  }
}

// F-19: read the recipient's dmPolicy from their preferences JSON (defaults to 'requests'). Duplicated
// coercion (ponytail: same 2 lines as the accounts readPreferences; not worth a shared util across modules).
function readDmPolicy(raw: unknown): DmPolicy {
  const p = (raw as Record<string, unknown> | null | undefined)?.['dmPolicy'];
  return DM_POLICIES.includes(p as DmPolicy) ? (p as DmPolicy) : DM_POLICY_DEFAULT;
}

/** Trim a submitted group name; blank → null (unnamed). Throws past GROUP_NAME_MAX_LENGTH. */
function normalizeGroupName(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length > GROUP_NAME_MAX_LENGTH) {
    throw new BadRequestException(`Le nom ne peut pas dépasser ${GROUP_NAME_MAX_LENGTH} caractères.`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

/** Fallback title for an unnamed group: up to 3 other members, then "+N". Never empty. */
function participantsTitle(conv: ConvRow, viewerId: string): string {
  const others = conv.participants.filter((p) => p.accountId !== viewerId).map((p) => p.account.displayName);
  if (others.length === 0) return 'Groupe';
  const shown = others.slice(0, 3).join(', ');
  return others.length > 3 ? `${shown} +${others.length - 3}` : shown;
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
