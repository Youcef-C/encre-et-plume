import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthRequest } from '../auth/guards/session.guard';

const NOTIF_ITEM = {
  id: 'n1',
  type: 'message' as const,
  area: 'messages' as const,
  refId: null,
  sourceUser: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  readAt: null,
};

const UNREAD_COUNTS = { total: 5, messages: 3, demandes: 2, signalements: 0 };

function makeReq(accountId = 'acc-a'): AuthRequest {
  return { accountId } as AuthRequest;
}

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: {
    list: jest.Mock;
    unreadCounts: jest.Mock;
    markRead: jest.Mock;
    markAllRead: jest.Mock;
  };
  let prisma: { account: { findUniqueOrThrow: jest.Mock } };

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      unreadCounts: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    prisma = { account: { findUniqueOrThrow: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: service },
        { provide: PrismaService, useValue: prisma },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  // ── GET /notifications ────────────────────────────────────────────────────

  it('GET /notifications delegates to service.list with req.accountId (BE-1, BE-7)', async () => {
    service.list.mockResolvedValue([NOTIF_ITEM]);

    const res = await controller.list(makeReq('acc-a'));

    expect(service.list).toHaveBeenCalledWith('acc-a');
    expect(res).toEqual([NOTIF_ITEM]);
  });

  // ── GET /notifications/unread-counts ─────────────────────────────────────

  it('GET /notifications/unread-counts loads role from DB and delegates (BE-2, BE-7)', async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValue({ role: 'utilisateur' });
    service.unreadCounts.mockResolvedValue(UNREAD_COUNTS);

    const res = await controller.unreadCounts(makeReq('acc-a'));

    expect(prisma.account.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'acc-a' }, select: { role: true } }),
    );
    expect(service.unreadCounts).toHaveBeenCalledWith('acc-a', 'utilisateur');
    expect(res).toEqual(UNREAD_COUNTS);
  });

  it('GET /notifications/unread-counts passes admin role to service (BE-6)', async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValue({ role: 'admin' });
    service.unreadCounts.mockResolvedValue({ ...UNREAD_COUNTS, signalements: 4, total: 9 });

    await controller.unreadCounts(makeReq('acc-admin'));

    expect(service.unreadCounts).toHaveBeenCalledWith('acc-admin', 'admin');
  });

  // ── POST /notifications/:id/read ─────────────────────────────────────────

  it('POST /notifications/:id/read delegates markRead with accountId (BE-3, BE-7)', async () => {
    service.markRead.mockResolvedValue(undefined);

    await controller.markRead(makeReq('acc-a'), 'notif-1');

    expect(service.markRead).toHaveBeenCalledWith('acc-a', 'notif-1');
  });

  it('POST /notifications/:id/read propagates ForbiddenException for foreign id (BE-7)', async () => {
    service.markRead.mockRejectedValue(new ForbiddenException());

    await expect(controller.markRead(makeReq('acc-a'), 'foreign-notif')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('POST /notifications/:id/read propagates NotFoundException for unknown id', async () => {
    service.markRead.mockRejectedValue(new NotFoundException());

    await expect(controller.markRead(makeReq('acc-a'), 'no-such')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ── POST /notifications/read-all ─────────────────────────────────────────

  it('POST /notifications/read-all delegates markAllRead and returns updated count (BE-4)', async () => {
    service.markAllRead.mockResolvedValue({ updated: 3 });

    const res = await controller.markAllRead(makeReq('acc-a'));

    expect(service.markAllRead).toHaveBeenCalledWith('acc-a');
    expect(res).toEqual({ updated: 3 });
  });
});
