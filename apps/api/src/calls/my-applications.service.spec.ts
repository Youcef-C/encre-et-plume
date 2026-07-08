import { ConflictException, NotFoundException } from '@nestjs/common';
import { MyApplicationsService } from './my-applications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';

// application.findMany returns rows with the joined `call` relation included.
const APP = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'app-1',
  callId: 'call-1',
  status: 'pending',
  appliedAs: 'dessinateur',
  createdAt: new Date('2026-07-07T10:00:00.000Z'),
  call: {
    title: '« Lames de Brume »',
    authorRoles: ['scenariste'],
    seekingRole: 'dessinateur',
    authorName: 'Camille R.',
    genres: ['seinen', 'thriller'],
  },
  assets: [],
  ...o,
});

describe('MyApplicationsService.list', () => {
  let service: MyApplicationsService;
  let prisma: {
    application: { findMany: jest.Mock; count: jest.Mock };
    projectCallAsset: { findMany: jest.Mock };
    media: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      application: {
        findMany: jest.fn().mockResolvedValue([APP()]),
        count: jest.fn().mockResolvedValue(1),
      },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new MyApplicationsService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as NotificationsService,
    );
  });

  it('scopes the query to the requesting user only (applicantId, never a client field)', async () => {
    await service.list('acc-me', { status: 'all', page: 1 });
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { applicantId: 'acc-me' } }),
    );
    expect(prisma.application.count).toHaveBeenCalledWith({ where: { applicantId: 'acc-me' } });
  });

  it('maps display fields from the joined ProjectCall and status/createdAt from the Application', async () => {
    const res = await service.list('acc-me', { status: 'all', page: 1 });
    expect(res.items[0]).toEqual({
      id: 'app-1',
      callId: 'call-1',
      callTitle: '« Lames de Brume »',
      callDirection: 'writerSeeksIllustrator',
      callGenres: ['seinen', 'thriller'],
      callSampleUrl: null,
      ownerName: 'Camille R.',
      status: 'pending',
      appliedAs: 'dessinateur',
      samples: [],
      createdAt: '2026-07-07T10:00:00.000Z',
    });
  });

  it('exposes the application own samples (position order) from its ApplicationAsset rows', async () => {
    prisma.application.findMany.mockResolvedValue([
      APP({
        assets: [
          { url: 'https://cdn/a.webp', kind: 'image', size: null, position: 0 },
          { url: 'https://cdn/b.pdf', kind: 'document', size: 2048, position: 1 },
        ],
      }),
    ]);
    const res = await service.list('acc-me', { status: 'all', page: 1 });
    expect(res.items[0].samples).toEqual([
      { url: 'https://cdn/a.webp', kind: 'image', size: null },
      { url: 'https://cdn/b.pdf', kind: 'document', size: 2048 },
    ]);
  });

  it('derives illustratorSeeksWriter when the call author is a dessinateur', async () => {
    prisma.application.findMany.mockResolvedValue([
      APP({ call: { ...APP().call, authorRoles: ['dessinateur'], seekingRoles: ['scenariste'] } }),
    ]);
    const res = await service.list('acc-me', { status: 'all', page: 1 });
    expect(res.items[0].callDirection).toBe('illustratorSeeksWriter');
  });

  it('resolves the call cover thumb from the first call_sample asset in a single batched lookup (no N+1)', async () => {
    prisma.application.findMany.mockResolvedValue([
      APP({ id: 'a1', callId: 'call-1' }),
      APP({ id: 'a2', callId: 'call-2' }),
    ]);
    prisma.projectCallAsset.findMany.mockResolvedValue([
      { callId: 'call-1', mediaId: 'med-1', position: 0 },
      { callId: 'call-2', mediaId: 'med-2', position: 0 },
    ]);
    prisma.media.findMany.mockResolvedValue([
      { id: 'med-1', variants: { thumb: 'https://cdn/thumb-1.webp' } },
      { id: 'med-2', variants: { thumb: 'https://cdn/thumb-2.webp' } },
    ]);
    const res = await service.list('acc-me', { status: 'all', page: 1 });
    expect(prisma.projectCallAsset.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.media.findMany).toHaveBeenCalledTimes(1);
    expect(res.items[0].callSampleUrl).toBe('https://cdn/thumb-1.webp');
    expect(res.items[1].callSampleUrl).toBe('https://cdn/thumb-2.webp');
  });

  it('never queries Media when no call has a cover asset (no wasted round-trip)', async () => {
    await service.list('acc-me', { status: 'all', page: 1 });
    expect(prisma.media.findMany).not.toHaveBeenCalled();
  });

  it('orders newest-first and paginates with MY_APPLICATIONS_PAGE_SIZE', async () => {
    await service.list('acc-me', { status: 'all', page: 3 });
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 20, skip: 40 }),
    );
  });

  it('filters by status and reports total (filtered) plus totalAll (unfiltered)', async () => {
    prisma.application.count
      .mockResolvedValueOnce(2) // total for the filtered where
      .mockResolvedValueOnce(7); // totalAll unfiltered
    const res = await service.list('acc-me', { status: 'rejected', page: 1 });
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { applicantId: 'acc-me', status: 'rejected' } }),
    );
    expect(res.total).toBe(2);
    expect(res.totalAll).toBe(7);
    expect(prisma.application.count).toHaveBeenCalledTimes(2);
  });

  it("counts once when status is 'all' (total === totalAll)", async () => {
    prisma.application.count.mockResolvedValue(4);
    const res = await service.list('acc-me', { status: 'all', page: 1 });
    expect(prisma.application.count).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(4);
    expect(res.totalAll).toBe(4);
  });

  it('returns the envelope shape with page + pageSize', async () => {
    const res = await service.list('acc-me', { status: 'all', page: 2 });
    expect(res).toMatchObject({ page: 2, pageSize: 20 });
    expect(Array.isArray(res.items)).toBe(true);
  });

  it('is read-only: no writes, no notifications (Prisma exposes only reads)', async () => {
    // The mocked prisma has no create/update/$transaction — if the service tried to write, it would throw.
    await expect(service.list('acc-me', { status: 'all', page: 1 })).resolves.toBeDefined();
  });
});

describe('MyApplicationsService.withdraw', () => {
  let service: MyApplicationsService;
  let prisma: {
    application: { findUnique: jest.Mock; delete: jest.Mock };
    projectCall: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { create: jest.Mock };

  const APP_ROW = (o: Partial<Record<string, unknown>> = {}) => ({
    id: 'app-1',
    applicantId: 'acc-me',
    status: 'pending',
    callId: 'call-1',
    call: { authorId: 'acc-owner' },
    ...o,
  });

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(APP_ROW()),
        delete: jest.fn().mockResolvedValue({}),
      },
      projectCall: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    service = new MyApplicationsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('hard-deletes a pending application and decrements the call count in one transaction', async () => {
    await service.withdraw('acc-me', 'app-1');
    expect(prisma.application.delete).toHaveBeenCalledWith({ where: { id: 'app-1' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('floors applicationCount at 0 (decrement only where the count is > 0)', async () => {
    await service.withdraw('acc-me', 'app-1');
    expect(prisma.projectCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', applicationCount: { gt: 0 } },
      data: { applicationCount: { decrement: 1 } },
    });
  });

  it('notifies the call owner (mirrors the apply notification; refId is the callId)', async () => {
    await service.withdraw('acc-me', 'app-1');
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'acc-owner',
      type: 'application',
      refId: 'call-1',
      sourceUserId: 'acc-me',
    });
  });

  it('skips the notification (no throw) when the call has no author', async () => {
    prisma.application.findUnique.mockResolvedValue(APP_ROW({ call: { authorId: null } }));
    await service.withdraw('acc-me', 'app-1');
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('404s an unknown application', async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(service.withdraw('acc-me', 'nope')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("404s another user's application (no existence leak, self-scoped)", async () => {
    prisma.application.findUnique.mockResolvedValue(APP_ROW({ applicantId: 'someone-else' }));
    await expect(service.withdraw('acc-me', 'app-1')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('409s an accepted application (only pending can be withdrawn)', async () => {
    prisma.application.findUnique.mockResolvedValue(APP_ROW({ status: 'accepted' }));
    await expect(service.withdraw('acc-me', 'app-1')).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('409s a rejected application', async () => {
    prisma.application.findUnique.mockResolvedValue(APP_ROW({ status: 'rejected' }));
    await expect(service.withdraw('acc-me', 'app-1')).rejects.toThrow(ConflictException);
  });
});
