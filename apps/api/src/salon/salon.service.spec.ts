import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { SALON_ONLINE_LIST_MAX, SALON_ROSTER_MAX, SALON_SEND_RATE_LIMIT, MESSAGE_MAX_LENGTH } from '@encre-et-plume/shared';
import { SalonService } from './salon.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { MessagingGateway } from '../messaging/messaging.gateway';
import type { BlocksService } from '../blocks/blocks.service';

const SALON = {
  id: 'salon-conv',
  type: 'salon',
  name: 'Le Comptoir',
  dmKey: 'salon',
  lastMessageAt: new Date('2026-07-09T10:00:00.000Z'),
};

function MSG(over: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    conversationId: 'salon-conv',
    senderId: 'acc-2',
    body: 'Bonjour le comptoir',
    createdAt: new Date('2026-07-09T11:00:00.000Z'),
    sender: { displayName: 'Bob' },
    ...over,
  };
}

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    conversation: {
      upsert: jest.fn().mockResolvedValue(SALON),
      update: jest.fn().mockResolvedValue(SALON),
    },
    conversationParticipant: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      // MC-15: the quoted-parent lookup shares the model with the page query.
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(MSG({ senderId: 'acc-1', sender: { displayName: 'Me' } })),
    },
    // MC-15: likes live on the same Message rows the salon already writes.
    messageLike: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1', displayName: 'Alice', avatar: null, profileSlug: 'alice' }),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.resolve([
      MSG({ senderId: 'acc-1', sender: undefined }),
      SALON,
    ])),
    ...over,
  };
}

function build(over: { prisma?: Record<string, unknown>; redis?: Record<string, unknown>; gateway?: Record<string, unknown>; blocks?: Record<string, unknown> } = {}) {
  const prisma = over.prisma ?? makePrisma();
  const redis = over.redis ?? {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
  };
  const gateway = over.gateway ?? {
    emitSalonMessage: jest.fn(),
    emitSalonMemberJoined: jest.fn(),
    emitSalonMemberLeft: jest.fn(),
    getSalonOnlineAccountIds: jest.fn().mockResolvedValue([]),
  };
  const blocks = over.blocks ?? { blockedPairIds: jest.fn().mockResolvedValue(new Set<string>()) };
  const service = new SalonService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    gateway as unknown as MessagingGateway,
    blocks as unknown as BlocksService,
  );
  return { service, prisma, redis, gateway, blocks };
}

type Person = string | { id: string; displayName?: string; avatar?: string | null; profileSlug?: string };

/**
 * Salon members as the DB returns them: the roster is ONE participant query that joins the account,
 * filters (blocked / deleted) in its WHERE and caps with `take` (P-1). The mock honors both so the
 * cap and the exclusion stay real assertions instead of post-fetch JS the test could never catch.
 */
function withMembers(people: Person[], over: Record<string, unknown> = {}) {
  const prisma = makePrisma(over);
  const rows = people.map((p) => {
    const a = typeof p === 'string' ? { id: p } : p;
    return {
      account: {
        id: a.id,
        displayName: a.displayName ?? a.id,
        avatar: a.avatar ?? null,
        profileSlug: a.profileSlug ?? a.id,
      },
    };
  });
  (prisma.conversationParticipant as any).findMany.mockImplementation((args: any) => {
    const notIn: string[] = args?.where?.account?.id?.notIn ?? [];
    const kept = rows.filter((r) => !notIn.includes(r.account.id));
    return Promise.resolve(args?.take ? kept.slice(0, args.take) : kept);
  });
  return prisma;
}

describe('SalonService.ensureSalon (seeded once, idempotent)', () => {
  it('upserts the singleton on dmKey "salon" with type salon and name Le Comptoir', async () => {
    const { service, prisma } = build();
    await service.getSummary('acc-1');
    await service.getSummary('acc-1');
    const upsert = (prisma.conversation as any).upsert;
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dmKey: 'salon' },
        create: expect.objectContaining({ type: 'salon', name: 'Le Comptoir', dmKey: 'salon' }),
      }),
    );
  });
});

describe('SalonService.getSummary', () => {
  it('non-member → isMember false, unreadCount 0', async () => {
    const { service } = build();
    const summary = await service.getSummary('acc-1');
    expect(summary).toEqual(
      expect.objectContaining({ conversationId: 'salon-conv', name: 'Le Comptoir', isMember: false, unreadCount: 0 }),
    );
  });

  it('member with 2 unread → unreadCount 2, own messages excluded from the count query', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).findUnique.mockResolvedValue({ accountId: 'acc-1', lastReadAt: new Date('2026-07-09T10:30:00.000Z') });
    (prisma.message as any).count.mockResolvedValue(2);
    const { service } = build({ prisma });
    const summary = await service.getSummary('acc-1');
    expect(summary.isMember).toBe(true);
    expect(summary.unreadCount).toBe(2);
    const countArgs = (prisma.message as any).count.mock.calls[0][0];
    expect(countArgs.where.senderId).toEqual({ not: 'acc-1' });
    expect(countArgs.where.conversationId).toBe('salon-conv');
  });

  it('onlineCount = ALL visible salon members INCLUDING self (membership, not app-online sockets)', async () => {
    // members query includes self now (no accountId:{not} filter)
    const prisma = withMembers(['acc-1', 'acc-2', 'acc-3']);
    const { service } = build({ prisma });
    const summary = await service.getSummary('acc-1');
    expect(summary.onlineCount).toBe(3); // self counted
  });

  it('onlineCount excludes blocked members (per-viewer)', async () => {
    const prisma = withMembers(['acc-1', 'blk']);
    const blocks = { blockedPairIds: jest.fn().mockResolvedValue(new Set(['blk'])) };
    const { service } = build({ prisma, blocks });
    const summary = await service.getSummary('acc-1');
    expect(summary.onlineCount).toBe(1); // only self visible
  });
});

describe('SalonService.getMessages (public preview — no membership required)', () => {
  it('returns newest-first items with senderId + senderName, no membership check', async () => {
    const prisma = makePrisma();
    (prisma.message as any).findMany.mockResolvedValue([MSG(), MSG({ id: 'msg-0', senderId: 'acc-3', sender: { displayName: 'Cara' } })]);
    const { service } = build({ prisma });
    const page = await service.getMessages('non-member', {});
    // never checks participant membership for reads
    expect((prisma.conversationParticipant as any).findUnique).not.toHaveBeenCalled();
    expect(page.items[0]).toEqual(
      expect.objectContaining({ id: 'msg-1', senderId: 'acc-2', senderName: 'Bob', body: 'Bonjour le comptoir' }),
    );
    expect((prisma.message as any).findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('sets nextCursor when a full page is returned', async () => {
    const prisma = makePrisma();
    const rows = Array.from({ length: 30 }, (_, i) => MSG({ id: `m-${i}` }));
    (prisma.message as any).findMany.mockResolvedValue(rows);
    const { service } = build({ prisma });
    const page = await service.getMessages('acc-1', { limit: 30 });
    expect(page.nextCursor).toBe('m-29');
  });
});

describe('SalonService.join / leave (idempotent + SYMMETRIC live broadcast)', () => {
  const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  const gw = () => ({ emitSalonMessage: jest.fn(), emitSalonMemberJoined: jest.fn(), emitSalonMemberLeft: jest.fn(), getSalonOnlineAccountIds: jest.fn().mockResolvedValue([]) });

  it('join creates the participant row and returns isMember true', async () => {
    const { service, prisma } = build();
    const res = await service.join('acc-1');
    expect(res).toEqual({ isMember: true });
    expect((prisma.conversationParticipant as any).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { conversationId: 'salon-conv', accountId: 'acc-1' } }),
    );
  });

  it('join of a NEW member broadcasts salon:member:joined { user } (mutation-driven, like leave)', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).create.mockResolvedValue({}); // create SUCCEEDS = genuine new member
    (prisma.account as any).findFirst.mockResolvedValue({ id: 'acc-1', displayName: 'Alice', avatar: null, profileSlug: 'alice' });
    const gateway = gw();
    const { service } = build({ prisma, gateway });
    await service.join('acc-1');
    expect(gateway.emitSalonMemberJoined).toHaveBeenCalledWith({ user: { id: 'acc-1', name: 'Alice', avatarUrl: null, slug: 'alice' } });
  });

  it('join of an ALREADY-member (create → P2002) is an idempotent no-op: no broadcast, still isMember true', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).create.mockRejectedValue(p2002()); // unique-violation = already a member
    const gateway = gw();
    const { service } = build({ prisma, gateway });
    const res = await service.join('acc-1');
    expect(res).toEqual({ isMember: true });
    expect(gateway.emitSalonMemberJoined).not.toHaveBeenCalled();
  });

  it('join rethrows a non-P2002 DB error (never swallows real failures)', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).create.mockRejectedValue(new Error('db down'));
    const { service } = build({ prisma });
    await expect(service.join('acc-1')).rejects.toThrow('db down');
  });

  it('SYMMETRY: a genuine join emits joined and a genuine leave emits left (same room audience)', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).create.mockResolvedValue({});
    (prisma.conversationParticipant as any).deleteMany.mockResolvedValue({ count: 1 });
    (prisma.account as any).findFirst.mockResolvedValue({ id: 'acc-1', displayName: 'Alice', avatar: null, profileSlug: 'alice' });
    const gateway = gw();
    const { service } = build({ prisma, gateway });
    await service.join('acc-1');
    await service.leave('acc-1');
    expect(gateway.emitSalonMemberJoined).toHaveBeenCalledTimes(1);
    expect(gateway.emitSalonMemberLeft).toHaveBeenCalledTimes(1);
    expect(gateway.emitSalonMemberLeft).toHaveBeenCalledWith({ userId: 'acc-1' });
  });

  it('leave deleteMany (0 rows fine) and returns isMember false; no broadcast when nothing was removed', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).deleteMany.mockResolvedValue({ count: 0 });
    const gateway = { emitSalonMessage: jest.fn(), emitSalonMemberJoined: jest.fn(), emitSalonMemberLeft: jest.fn(), getSalonOnlineAccountIds: jest.fn().mockResolvedValue([]) };
    const { service } = build({ prisma, gateway });
    const res = await service.leave('never-joined');
    expect(res).toEqual({ isMember: false });
    expect(gateway.emitSalonMemberLeft).not.toHaveBeenCalled();
  });

  it('leave of an actual member broadcasts salon:member:left with the userId', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).deleteMany.mockResolvedValue({ count: 1 });
    const gateway = { emitSalonMessage: jest.fn(), emitSalonMemberJoined: jest.fn(), emitSalonMemberLeft: jest.fn(), getSalonOnlineAccountIds: jest.fn().mockResolvedValue([]) };
    const { service } = build({ prisma, gateway });
    await service.leave('acc-1');
    expect(gateway.emitSalonMemberLeft).toHaveBeenCalledWith({ userId: 'acc-1' });
  });
});

describe('SalonService.sendMessage', () => {
  const memberPrisma = () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).findUnique.mockResolvedValue({ accountId: 'acc-1' });
    return prisma;
  };

  it('403 for a non-member', async () => {
    const { service } = build(); // findUnique → null
    await expect(service.sendMessage('acc-1', { body: 'hi' })).rejects.toThrow(ForbiddenException);
  });

  it('400 on empty / whitespace body', async () => {
    const { service } = build({ prisma: memberPrisma() });
    await expect(service.sendMessage('acc-1', { body: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('400 when body exceeds MESSAGE_MAX_LENGTH', async () => {
    const { service } = build({ prisma: memberPrisma() });
    await expect(service.sendMessage('acc-1', { body: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) })).rejects.toThrow(BadRequestException);
  });

  it('persists, bumps lastMessageAt, emits salon message, and never enqueues a notification', async () => {
    const prisma = memberPrisma();
    const gateway = { emitSalonMessage: jest.fn(), getSalonOnlineAccountIds: jest.fn().mockResolvedValue([]) };
    const { service } = build({ prisma, gateway });
    const dto = await service.sendMessage('acc-1', { body: 'Bonjour' });
    expect((prisma.$transaction as any)).toHaveBeenCalled();
    expect(gateway.emitSalonMessage).toHaveBeenCalledWith({ message: expect.objectContaining({ senderId: 'acc-1' }) });
    expect(dto.senderId).toBe('acc-1');
  });

  it('429 when the flood limit is exceeded', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(SALON_SEND_RATE_LIMIT.max + 1), expire: jest.fn() };
    const { service } = build({ prisma: memberPrisma(), redis });
    await expect(service.sendMessage('acc-1', { body: 'spam' })).rejects.toThrow(HttpException);
  });
});

describe('SalonService.markRead', () => {
  it('member → updateMany lastReadAt, returns unreadCount 0', async () => {
    const { service, prisma } = build();
    const res = await service.markRead('acc-1');
    expect(res).toEqual({ unreadCount: 0 });
    expect((prisma.conversationParticipant as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: 'salon-conv', accountId: 'acc-1' } }),
    );
  });

  it('non-member → no-op (updateMany 0 rows), still unreadCount 0', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).updateMany.mockResolvedValue({ count: 0 });
    const { service } = build({ prisma });
    await expect(service.markRead('never')).resolves.toEqual({ unreadCount: 0 });
  });
});

describe('SalonService.getOnlineUsers', () => {
  it('dedupes gateway ids, resolves display names, caps at SALON_ONLINE_LIST_MAX', async () => {
    const ids = Array.from({ length: SALON_ONLINE_LIST_MAX + 10 }, (_, i) => `u-${i}`);
    const gateway = { emitSalonMessage: jest.fn(), getSalonOnlineAccountIds: jest.fn().mockResolvedValue([...ids, 'u-0']) };
    const prisma = makePrisma();
    (prisma.account as any).findMany.mockResolvedValue([{ id: 'u-0', displayName: 'Alice' }, { id: 'u-1', displayName: 'Bob' }]);
    const { service } = build({ prisma, gateway });
    const res = await service.getOnlineUsers();
    const queried = (prisma.account as any).findMany.mock.calls[0][0].where.id.in as string[];
    expect(queried.length).toBeLessThanOrEqual(SALON_ONLINE_LIST_MAX);
    expect(res.items).toContainEqual({ userId: 'u-0', name: 'Alice' });
  });
});

describe('SalonService.getPresence (MC-13 — salon MEMBERSHIP roster, self INCLUDED)', () => {
  it('includes ALL members INCLUDING the caller (flagged self), count === items.length, sorted fr', async () => {
    // members query includes self
    const prisma = withMembers([
      { id: 'acc-3', displayName: 'Cara', avatar: 'http://cdn/c.webp', profileSlug: 'cara' },
      { id: 'acc-1', displayName: 'Alice', avatar: null, profileSlug: 'alice' }, // the caller
      { id: 'acc-2', displayName: 'Bob', avatar: null, profileSlug: 'bob' },
    ]);
    const { service } = build({ prisma });
    const res = await service.getPresence('acc-1');
    // members query is NOT filtered by accountId:{not:viewer} anymore (self is a member too)
    expect((prisma.conversationParticipant as any).findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ conversationId: 'salon-conv' }) }),
    );
    expect(res.items).toEqual([
      { id: 'acc-1', name: 'Alice', avatarUrl: null, slug: 'alice', self: true }, // caller flagged
      { id: 'acc-2', name: 'Bob', avatarUrl: null, slug: 'bob', self: false },
      { id: 'acc-3', name: 'Cara', avatarUrl: 'http://cdn/c.webp', slug: 'cara', self: false },
    ]);
    expect(res.count).toBe(res.items.length);
    expect(res.count).toBe(3);
  });

  it('excludes ONLY blocked pairs (self stays); count === items.length', async () => {
    const prisma = withMembers([
      { id: 'acc-1', displayName: 'Alice', profileSlug: 'alice' },
      { id: 'acc-2', displayName: 'Bob', profileSlug: 'bob' },
      { id: 'acc-blocked', displayName: 'Zoé', profileSlug: 'zoe' },
    ]);
    const blocks = { blockedPairIds: jest.fn().mockResolvedValue(new Set(['acc-blocked'])) };
    const { service } = build({ prisma, blocks });
    const res = await service.getPresence('acc-1');
    expect(res.items.map((i) => i.id)).toEqual(['acc-1', 'acc-2']); // self kept, blocked gone
    expect(res.count).toBe(2);
    expect(res.count).toBe(res.items.length);
  });

  it('caller alone in the salon → { count: 1, items: [<self>] }', async () => {
    const prisma = withMembers([{ id: 'acc-1', displayName: 'Alice', profileSlug: 'alice' }]);
    const { service } = build({ prisma });
    const res = await service.getPresence('acc-1');
    expect(res).toEqual({ count: 1, items: [{ id: 'acc-1', name: 'Alice', avatarUrl: null, slug: 'alice', self: true }] });
  });

  it('no members at all → { count: 0, items: [] }', async () => {
    const prisma = withMembers([]);
    const { service } = build({ prisma });
    await expect(service.getPresence('acc-1')).resolves.toEqual({ count: 0, items: [] });
  });

  it('caps BOTH count and items at SALON_ROSTER_MAX (count === items.length even when capped)', async () => {
    const many = Array.from({ length: SALON_ROSTER_MAX + 20 }, (_, i) => `u-${i}`);
    const prisma = withMembers(many);
    const { service } = build({ prisma });
    const res = await service.getPresence('acc-1');
    expect(res.count).toBe(SALON_ROSTER_MAX);
    expect(res.items).toHaveLength(SALON_ROSTER_MAX);
    expect(res.count).toBe(res.items.length);
  });

  // ── P-1 (DB scalability pass) — the WORK must be bounded, not just the response ──
  // « Le Comptoir » is ONE global conversation: fetching every participant to render a 100-row list is
  // O(members) per roster open. The cap and the filters belong in the query, exactly like MC-15's
  // `listLikes` — filtering AFTER the fetch is what forces the unbounded read in the first place.

  it('P-1: asks the DATABASE for at most SALON_ROSTER_MAX rows (take in the query, no post-fetch slice)', async () => {
    const prisma = withMembers(Array.from({ length: SALON_ROSTER_MAX + 20 }, (_, i) => `u-${i}`));
    const { service } = build({ prisma });
    await service.getPresence('acc-1');
    expect((prisma.conversationParticipant as any).findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: SALON_ROSTER_MAX }),
    );
  });

  it('P-1: excludes blocked accounts + deleted accounts in the WHERE clause, not after the fetch', async () => {
    const prisma = withMembers(['acc-1', 'acc-2']);
    const blocks = { blockedPairIds: jest.fn().mockResolvedValue(new Set(['acc-blocked'])) };
    const { service } = build({ prisma, blocks });
    await service.getPresence('acc-1');
    const where = (prisma.conversationParticipant as any).findMany.mock.calls[0][0].where;
    expect(where.conversationId).toBe('salon-conv');
    expect(where.account).toEqual(
      expect.objectContaining({ deletedAt: null, id: { notIn: ['acc-blocked'] } }),
    );
  });

  it('P-1: the DB picks the capped page in displayName order (the cap is not an arbitrary subset)', async () => {
    const prisma = withMembers(['acc-1']);
    const { service } = build({ prisma });
    await service.getPresence('acc-1');
    expect((prisma.conversationParticipant as any).findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { account: { displayName: 'asc' } } }),
    );
  });

  it('P-1: never issues a second unbounded account lookup for the roster', async () => {
    const prisma = withMembers(['acc-1', 'acc-2']);
    const { service } = build({ prisma });
    await service.getPresence('acc-1');
    expect((prisma.account as any).findMany).not.toHaveBeenCalled();
  });
});

// ─── MC-15 · the salon inherits the SAME message actions, minus edit and delete ──
// The salon is a public room: Répondre and J'aime yes, Modifier and Supprimer NEVER (those live in
// MessagesService and refuse a salon conversation 403 — tested there). Here: the read path carries
// the same fields, and a quote must belong to the salon.

describe('SalonService — MC-15 read fields', () => {
  it('every salon message carries likeCount / likedByMe / replyTo / editedAt', async () => {
    const prisma = makePrisma();
    (prisma.message as any).findMany.mockResolvedValue([MSG({ id: 'm-1' })]);
    (prisma.messageLike as any).findMany.mockResolvedValue([
      { messageId: 'm-1', accountId: 'acc-1' },
      { messageId: 'm-1', accountId: 'acc-9' },
    ]);
    const { service } = build({ prisma });

    const page = await service.getMessages('acc-1', {});
    expect(page.items[0]).toEqual(
      expect.objectContaining({ likeCount: 2, likedByMe: true, replyTo: null, editedAt: null }),
    );
  });

  it('a previewer (not a member) sees the counts but never likedByMe', async () => {
    const prisma = makePrisma();
    (prisma.message as any).findMany.mockResolvedValue([MSG({ id: 'm-1' })]);
    (prisma.messageLike as any).findMany.mockResolvedValue([{ messageId: 'm-1', accountId: 'acc-2' }]);
    const { service } = build({ prisma });

    const page = await service.getMessages('non-member', {});
    expect(page.items[0]).toEqual(expect.objectContaining({ likeCount: 1, likedByMe: false }));
  });

  it('D-3: a message whose quoted target was deleted renders a deleted quote', async () => {
    const prisma = makePrisma();
    (prisma.message as any).findMany.mockResolvedValue([
      MSG({ id: 'm-2', replyToId: null, replyToDeleted: true }),
    ]);
    const { service } = build({ prisma });

    const page = await service.getMessages('acc-1', {});
    expect(page.items[0]!.replyTo).toMatchObject({ deleted: true });
  });

  it('no N+1: one like query and one parent query for the whole page', async () => {
    const prisma = makePrisma();
    (prisma.message as any).findMany.mockImplementation((args: { where?: { id?: unknown } }) =>
      Promise.resolve(
        args?.where?.id
          ? [MSG({ id: 'm-0' })]
          : Array.from({ length: 20 }, (_, i) => MSG({ id: `m-${i}`, replyToId: 'm-0' })),
      ),
    );
    const { service } = build({ prisma });

    await service.getMessages('acc-1', {});
    expect((prisma.messageLike as any).findMany).toHaveBeenCalledTimes(1);
    expect((prisma.message as any).findMany).toHaveBeenCalledTimes(2);
  });
});

describe('SalonService.sendMessage — replies (MC-15 B4)', () => {
  it('refuses a replyToId that is not a salon message (400)', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).findUnique.mockResolvedValue({ accountId: 'acc-1' });
    (prisma.message as any).findUnique.mockResolvedValue({
      id: 'msg-9',
      conversationId: 'conv-elsewhere',
      senderId: 'acc-2',
      body: 'ailleurs',
      attachments: [],
    });
    const { service } = build({ prisma });

    await expect(
      service.sendMessage('acc-1', { body: 'hi', replyToId: 'msg-9' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a valid replyToId and echoes the resolved quote back', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).findUnique.mockResolvedValue({ accountId: 'acc-1' });
    (prisma.message as any).findUnique.mockResolvedValue({
      id: 'msg-9',
      conversationId: 'salon-conv',
      senderId: 'acc-2',
      body: 'Le message cité',
      attachments: [],
      sender: { displayName: 'Bob' },
    });
    const { service } = build({ prisma });

    const sent = await service.sendMessage('acc-1', { body: 'hi', replyToId: 'msg-9' });
    expect(sent.replyTo).toEqual({
      id: 'msg-9',
      senderId: 'acc-2',
      senderName: 'Bob',
      excerpt: 'Le message cité',
      deleted: false,
    });
  });
});
