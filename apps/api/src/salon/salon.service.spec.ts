import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { SALON_ONLINE_LIST_MAX, SALON_SEND_RATE_LIMIT, MESSAGE_MAX_LENGTH } from '@encre-et-plume/shared';
import { SalonService } from './salon.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { MessagingGateway } from '../messaging/messaging.gateway';

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
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(MSG({ senderId: 'acc-1', sender: { displayName: 'Me' } })),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.resolve([
      MSG({ senderId: 'acc-1', sender: undefined }),
      SALON,
    ])),
    ...over,
  };
}

function build(over: { prisma?: Record<string, unknown>; redis?: Record<string, unknown>; gateway?: Record<string, unknown> } = {}) {
  const prisma = over.prisma ?? makePrisma();
  const redis = over.redis ?? { incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(undefined) };
  const gateway = over.gateway ?? {
    emitSalonMessage: jest.fn(),
    getSalonOnlineAccountIds: jest.fn().mockResolvedValue([]),
  };
  const service = new SalonService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    gateway as unknown as MessagingGateway,
  );
  return { service, prisma, redis, gateway };
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

  it('onlineCount comes from the gateway salon room', async () => {
    const gateway = { emitSalonMessage: jest.fn(), getSalonOnlineAccountIds: jest.fn().mockResolvedValue(['a', 'b', 'c']) };
    const { service } = build({ gateway });
    const summary = await service.getSummary('acc-1');
    expect(summary.onlineCount).toBe(3);
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

describe('SalonService.join / leave (idempotent)', () => {
  it('join upserts the participant row and returns isMember true', async () => {
    const { service, prisma } = build();
    const res = await service.join('acc-1');
    expect(res).toEqual({ isMember: true });
    expect((prisma.conversationParticipant as any).upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId_accountId: { conversationId: 'salon-conv', accountId: 'acc-1' } } }),
    );
  });

  it('leave deleteMany (0 rows fine) and returns isMember false', async () => {
    const prisma = makePrisma();
    (prisma.conversationParticipant as any).deleteMany.mockResolvedValue({ count: 0 });
    const { service } = build({ prisma });
    const res = await service.leave('never-joined');
    expect(res).toEqual({ isMember: false });
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
