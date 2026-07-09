import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type {
  MarkReadResponse,
  SalonMembershipResponse,
  SalonMessageDto,
  SalonMessagesPage,
  SalonOnlineResponse,
  SalonSendRequest,
  SalonSummary,
} from '@encre-et-plume/shared';
import {
  MESSAGE_MAX_LENGTH,
  SALON_MESSAGES_PAGE_MAX,
  SALON_MESSAGES_PAGE_SIZE,
  SALON_NAME,
  SALON_ONLINE_LIST_MAX,
  SALON_SEND_RATE_LIMIT,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MessagingGateway } from '../messaging/messaging.gateway';

interface PageOpts {
  cursor?: string;
  limit?: number;
}

interface SalonMsgRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
  sender?: { displayName: string };
}

/**
 * MC-11 "Le Comptoir": one global public room reusing the MC-9 Conversation/Message backend — no new
 * message storage. `ConversationParticipant` is the membership table, `lastReadAt` the unread tracker,
 * `Message` the storage. Any authed user may read (public preview); posting requires membership.
 * Realtime + presence go through the shared MessagingGateway (Redis adapter). No F-5 notifications, no
 * queue — a global room must never fan out one notification per offline member.
 *
 * AD-11 oversight: the salon is a normal group-style Conversation row, so staff read access is satisfied
 * by construction — nothing to build here.
 */
@Injectable()
export class SalonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: MessagingGateway,
  ) {}

  // Reuse the existing unique dmKey column as the singleton key — DB-enforced, no new migration.
  // ponytail: dmKey doubles as the salon singleton key; add a dedicated unique key only if a second salon ships.
  private ensureSalon() {
    return this.prisma.conversation.upsert({
      where: { dmKey: 'salon' },
      update: {},
      create: { type: 'salon', name: SALON_NAME, dmKey: 'salon' },
    }) as unknown as Promise<{ id: string; name: string | null }>;
  }

  async getSummary(accountId: string): Promise<SalonSummary> {
    const salon = await this.ensureSalon();
    const member = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_accountId: { conversationId: salon.id, accountId } },
      select: { lastReadAt: true },
    });
    const unreadCount = member
      ? await this.prisma.message.count({
          where: {
            conversationId: salon.id,
            senderId: { not: accountId },
            createdAt: { gt: member.lastReadAt },
          },
        })
      : 0;
    const onlineCount = (await this.gateway.getSalonOnlineAccountIds()).length;
    return {
      conversationId: salon.id,
      name: salon.name ?? SALON_NAME,
      onlineCount,
      unreadCount,
      isMember: !!member,
    };
  }

  async getMessages(_accountId: string, opts: PageOpts): Promise<SalonMessagesPage> {
    const salon = await this.ensureSalon(); // no membership check — public preview for any authed user
    const limit = clampLimit(opts.limit, SALON_MESSAGES_PAGE_SIZE, SALON_MESSAGES_PAGE_MAX);
    const rows = (await this.prisma.message.findMany({
      where: { conversationId: salon.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { sender: { select: { displayName: true } } },
    })) as unknown as SalonMsgRow[];
    const items = rows.map(toSalonDto);
    const nextCursor = items.length === limit ? (items[items.length - 1]?.id ?? null) : null;
    return { items, nextCursor };
  }

  async join(accountId: string): Promise<SalonMembershipResponse> {
    const salon = await this.ensureSalon();
    // AD-6 seam: ban check lands with AD-6.
    await this.prisma.conversationParticipant.upsert({
      where: { conversationId_accountId: { conversationId: salon.id, accountId } },
      update: {},
      create: { conversationId: salon.id, accountId },
    });
    return { isMember: true };
  }

  async leave(accountId: string): Promise<SalonMembershipResponse> {
    const salon = await this.ensureSalon();
    await this.prisma.conversationParticipant.deleteMany({
      where: { conversationId: salon.id, accountId },
    });
    return { isMember: false };
  }

  async sendMessage(accountId: string, dto: SalonSendRequest): Promise<SalonMessageDto> {
    const salon = await this.ensureSalon();
    const member = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_accountId: { conversationId: salon.id, accountId } },
      select: { accountId: true },
    });
    // AD-6 seam: ban check lands with AD-6. Public room → 403 (no existence-leak concern, unlike MC-9's 404).
    if (!member) throw new ForbiddenException('Rejoignez le salon pour écrire.');

    const body = (dto.body ?? '').trim();
    if (body.length === 0) throw new BadRequestException('Écrivez un message.');
    if (body.length > MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(`Le message ne peut pas dépasser ${MESSAGE_MAX_LENGTH} caractères.`);
    }

    await this.enforceSendRateLimit(accountId);

    // ACID: persist the message + bump the ordering key together (same pattern as MC-9).
    const [created] = (await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: salon.id, senderId: accountId, body, attachments: [] },
        include: { sender: { select: { displayName: true } } },
      }),
      this.prisma.conversation.update({ where: { id: salon.id }, data: { lastMessageAt: new Date() } }),
    ])) as unknown as [SalonMsgRow, unknown];

    const message = toSalonDto(created);
    // Fan-out to the salon room (members AND previewers). No F-5 notifications, no queue.
    this.gateway.emitSalonMessage({ message });
    return message;
  }

  async markRead(accountId: string): Promise<MarkReadResponse> {
    const salon = await this.ensureSalon();
    // updateMany → non-member is a harmless 0-row no-op (nothing to leak).
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId: salon.id, accountId },
      data: { lastReadAt: new Date() },
    });
    return { unreadCount: 0 };
  }

  async getOnlineUsers(): Promise<SalonOnlineResponse> {
    const ids = [...new Set(await this.gateway.getSalonOnlineAccountIds())].slice(0, SALON_ONLINE_LIST_MAX);
    if (ids.length === 0) return { items: [] };
    const accounts = (await this.prisma.account.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, displayName: true },
    })) as { id: string; displayName: string }[];
    return { items: accounts.map((a) => ({ userId: a.id, name: a.displayName })) };
  }

  private async enforceSendRateLimit(accountId: string): Promise<void> {
    // Never honor the escape hatch in production.
    if (process.env['DISABLE_RATE_LIMIT'] === 'true' && process.env['NODE_ENV'] !== 'production') return;
    const key = `rl:salon:${accountId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, SALON_SEND_RATE_LIMIT.windowSec);
    if (count > SALON_SEND_RATE_LIMIT.max) {
      throw new HttpException('Vous envoyez des messages trop vite. Réessayez dans un instant.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

function clampLimit(raw: number | undefined, def: number, max: number): number {
  if (!raw || raw < 1) return def;
  return Math.min(Math.floor(raw), max);
}

function toSalonDto(m: SalonMsgRow): SalonMessageDto {
  return {
    id: m.id,
    senderId: m.senderId,
    senderName: m.sender?.displayName ?? '',
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}
