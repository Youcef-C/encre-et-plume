import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACCOUNT_A = 'acc-a';
const ACCOUNT_B = 'acc-b';

const SOURCE_USER_ROW = {
  displayName: 'Yuki Moreau',
  profileSlug: 'yuki-moreau',
  avatar: null,
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    recipientId: ACCOUNT_A,
    type: 'message',
    refId: 'ref-1',
    sourceUserId: ACCOUNT_B,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    readAt: null,
    sourceUser: SOURCE_USER_ROW,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts an unread notification and returns shaped NotificationItem (BE-8)', async () => {
      const row = makeRow();
      prisma.notification.create.mockResolvedValue(row);

      const item = await service.create({
        recipientId: ACCOUNT_A,
        type: 'message',
        refId: 'ref-1',
        sourceUserId: ACCOUNT_B,
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recipientId: ACCOUNT_A, type: 'message' }),
        }),
      );
      expect(item.id).toBe('notif-1');
      expect(item.type).toBe('message');
      expect(item.area).toBe('messages');
      expect(item.readAt).toBeNull();
      expect(item.sourceUser).toEqual({
        displayName: 'Yuki Moreau',
        slug: 'yuki-moreau',
        avatar: null,
      });
      expect(item.createdAt).toBe('2026-06-01T10:00:00.000Z');
    });

    it('maps application type to demandes area', async () => {
      const row = makeRow({ type: 'application' });
      prisma.notification.create.mockResolvedValue(row);

      const item = await service.create({ recipientId: ACCOUNT_A, type: 'application' });

      expect(item.area).toBe('demandes');
    });

    it('maps report type to signalements area', async () => {
      const row = makeRow({ type: 'report' });
      prisma.notification.create.mockResolvedValue(row);

      const item = await service.create({ recipientId: ACCOUNT_A, type: 'report' });

      expect(item.area).toBe('signalements');
    });

    it('maps like/comment/invitation/project_activity/release to autres area', async () => {
      for (const type of ['like', 'comment', 'invitation', 'project_activity', 'release'] as const) {
        const row = makeRow({ type });
        prisma.notification.create.mockResolvedValue(row);
        const item = await service.create({ recipientId: ACCOUNT_A, type });
        expect(item.area).toBe('autres');
      }
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it("returns only the caller's own rows in descending createdAt order (BE-1, BE-7)", async () => {
      const rows = [
        makeRow({ id: 'n2', createdAt: new Date('2026-06-02T10:00:00Z') }),
        makeRow({ id: 'n1', createdAt: new Date('2026-06-01T10:00:00Z') }),
      ];
      prisma.notification.findMany.mockResolvedValue(rows);

      const items = await service.list(ACCOUNT_A);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recipientId: ACCOUNT_A } }),
      );
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('n2');
    });

    it('excludes other users rows — query is always scoped to recipientId', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.list(ACCOUNT_B);

      const call = prisma.notification.findMany.mock.calls[0][0] as { where: { recipientId: string } };
      expect(call.where.recipientId).toBe(ACCOUNT_B);
    });

    it('includes sourceUser with displayName, slug, avatar', async () => {
      prisma.notification.findMany.mockResolvedValue([makeRow()]);

      const [item] = await service.list(ACCOUNT_A);

      expect(item.sourceUser).toEqual({ displayName: 'Yuki Moreau', slug: 'yuki-moreau', avatar: null });
    });

    it('returns empty array when no notifications', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      const items = await service.list(ACCOUNT_A);

      expect(items).toEqual([]);
    });
  });

  // ── unreadCounts ──────────────────────────────────────────────────────────

  describe('unreadCounts()', () => {
    it('folds unread notifications by area for utilisateur (BE-2, BE-6)', async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { type: 'message', _count: { _all: 3 } },
        { type: 'application', _count: { _all: 2 } },
        { type: 'like', _count: { _all: 1 } },
      ]);

      const counts = await service.unreadCounts(ACCOUNT_A, 'utilisateur');

      expect(counts.messages).toBe(3);
      expect(counts.demandes).toBe(2);
      expect(counts.signalements).toBe(0);
      expect(counts.total).toBe(6);
    });

    it('returns signalements=0 for utilisateur and excludes report from total (BE-6, BE-7)', async () => {
      // Should not include report type in query for non-moderators
      prisma.notification.groupBy.mockResolvedValue([
        { type: 'message', _count: { _all: 2 } },
      ]);

      const counts = await service.unreadCounts(ACCOUNT_A, 'utilisateur');

      expect(counts.signalements).toBe(0);
      // query should exclude report type
      const call = prisma.notification.groupBy.mock.calls[0][0] as { where: { type?: { not: string } } };
      expect(call.where.type).toEqual({ not: 'report' });
    });

    it('returns signalements count for admin (BE-6, BE-7)', async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { type: 'message', _count: { _all: 2 } },
        { type: 'report', _count: { _all: 4 } },
      ]);

      const counts = await service.unreadCounts(ACCOUNT_A, 'admin');

      expect(counts.signalements).toBe(4);
      expect(counts.total).toBe(6);
    });

    it('returns signalements count for maintainer (BE-6, BE-7)', async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { type: 'report', _count: { _all: 3 } },
      ]);

      const counts = await service.unreadCounts(ACCOUNT_A, 'maintainer');

      expect(counts.signalements).toBe(3);
      expect(counts.total).toBe(3);
      // query should NOT exclude report type for moderators
      const call = prisma.notification.groupBy.mock.calls[0][0] as { where: { type?: unknown } };
      expect(call.where.type).toBeUndefined();
    });

    it('only counts rows where readAt is null (BE-6)', async () => {
      prisma.notification.groupBy.mockResolvedValue([]);

      await service.unreadCounts(ACCOUNT_A, 'utilisateur');

      const call = prisma.notification.groupBy.mock.calls[0][0] as { where: { readAt: null } };
      expect(call.where.readAt).toBeNull();
    });

    it('returns all zeros when no unread notifications', async () => {
      prisma.notification.groupBy.mockResolvedValue([]);

      const counts = await service.unreadCounts(ACCOUNT_A, 'utilisateur');

      expect(counts).toEqual({ total: 0, messages: 0, demandes: 0, signalements: 0 });
    });
  });

  // ── markRead ─────────────────────────────────────────────────────────────

  describe('markRead()', () => {
    it('sets readAt on own unread notification (BE-3)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.markRead(ACCOUNT_A, 'notif-1')).resolves.toBeUndefined();

      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1', recipientId: ACCOUNT_A, readAt: null },
        }),
      );
    });

    it('is idempotent when notification is already read (BE-3)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      // Row exists for this user but already read
      prisma.notification.findUnique.mockResolvedValue({ recipientId: ACCOUNT_A });

      await expect(service.markRead(ACCOUNT_A, 'notif-1')).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when notification belongs to another user (BE-7)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      prisma.notification.findUnique.mockResolvedValue({ recipientId: ACCOUNT_B });

      await expect(service.markRead(ACCOUNT_A, 'notif-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for non-existent id (BE-3)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead(ACCOUNT_A, 'no-such')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── markAllRead ───────────────────────────────────────────────────────────

  describe('markAllRead()', () => {
    it('marks all own unread notifications and returns updated count (BE-4)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead(ACCOUNT_A);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipientId: ACCOUNT_A, readAt: null },
        }),
      );
      expect(result).toEqual({ updated: 5 });
    });

    it('returns updated=0 when no unread notifications exist', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllRead(ACCOUNT_A);

      expect(result).toEqual({ updated: 0 });
    });
  });
});
