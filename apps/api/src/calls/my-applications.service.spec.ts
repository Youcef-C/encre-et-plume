import { ConflictException, NotFoundException } from '@nestjs/common';
import { MyApplicationsService } from './my-applications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { CallsService } from './calls.service';

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
      { resolveApplicationSamples: jest.fn() } as unknown as CallsService,
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
      ownerId: null,
      status: 'pending',
      appliedAs: 'dessinateur',
      samples: [],
      createdAt: '2026-07-07T10:00:00.000Z',
    });
  });

  it('MC-9 seam: exposes the call author account id as ownerId for the « Message » CTA', async () => {
    prisma.application.findMany.mockResolvedValue([APP({ call: { ...APP().call, authorId: 'acc-owner' } })]);
    const res = await service.list('acc-me', { status: 'all', page: 1 });
    expect(res.items[0].ownerId).toBe('acc-owner');
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
      { resolveApplicationSamples: jest.fn() } as unknown as CallsService,
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

  // MC-6 amendment (2026-07-10): an applicant may withdraw even after being accepted. The accepted
  // application is deleted (freeing its derived seat), applicationCount is decremented, and the owner
  // is notified. The MC-8 connection is left intact (withdraw never touches connections).
  it('withdraws an accepted application: deletes it, decrements the count, notifies the owner', async () => {
    prisma.application.findUnique.mockResolvedValue(APP_ROW({ status: 'accepted' }));
    await service.withdraw('acc-me', 'app-1');
    expect(prisma.application.delete).toHaveBeenCalledWith({ where: { id: 'app-1' } });
    expect(prisma.projectCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', applicationCount: { gt: 0 } },
      data: { applicationCount: { decrement: 1 } },
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'acc-owner', type: 'application', refId: 'call-1' }),
    );
  });

  it('409s a rejected application (nothing to free — cannot withdraw)', async () => {
    prisma.application.findUnique.mockResolvedValue(APP_ROW({ status: 'rejected' }));
    await expect(service.withdraw('acc-me', 'app-1')).rejects.toThrow(ConflictException);
  });
});

// MC-6 amendment #7: applicant-scoped detail (message + all samples + call ref) for the edit view.
describe('MyApplicationsService.get', () => {
  let service: MyApplicationsService;
  let prisma: {
    application: { findUnique: jest.Mock };
    projectCallAsset: { findMany: jest.Mock };
    media: { findMany: jest.Mock };
  };

  const DETAIL = (o: Partial<Record<string, unknown>> = {}) => ({
    id: 'app-1',
    callId: 'call-1',
    applicantId: 'acc-me',
    status: 'pending',
    appliedAs: 'dessinateur',
    message: 'Bonjour, voici mon travail',
    createdAt: new Date('2026-07-07T10:00:00.000Z'),
    call: { title: '« Lames de Brume »', authorRoles: ['scenariste'], authorName: 'Camille R.', authorId: 'acc-owner', genres: ['seinen'] },
    assets: [
      { mediaId: 'med-1', portfolioItemId: null, url: 'https://cdn/a.webp', kind: 'image', size: null, position: 0 },
      { mediaId: null, portfolioItemId: 'pi-2', url: 'https://cdn/b.pdf', kind: 'document', size: 2048, position: 1 },
    ],
    ...o,
  });

  beforeEach(() => {
    prisma = {
      application: { findUnique: jest.fn().mockResolvedValue(DETAIL()) },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new MyApplicationsService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as NotificationsService,
      { resolveApplicationSamples: jest.fn() } as unknown as CallsService,
    );
  });

  it('returns the caller own application detail with message and all samples (position order)', async () => {
    const res = await service.get('acc-me', 'app-1');
    expect(res).toMatchObject({
      id: 'app-1',
      callId: 'call-1',
      callTitle: '« Lames de Brume »',
      message: 'Bonjour, voici mon travail',
      appliedAs: 'dessinateur',
      status: 'pending',
    });
    // MC-6 #7 completion: detail samples carry their ref (mediaId XOR portfolioItemId) so the edit
    // modal can re-submit existing samples without re-uploading. url/kind/size stay for display.
    expect(res.samples).toEqual([
      { mediaId: 'med-1', url: 'https://cdn/a.webp', kind: 'image', size: null },
      { portfolioItemId: 'pi-2', url: 'https://cdn/b.pdf', kind: 'document', size: 2048 },
    ]);
  });

  it('404s an unknown application', async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(service.get('acc-me', 'nope')).rejects.toThrow(NotFoundException);
  });

  it("404s another user's application (no existence leak, self-scoped)", async () => {
    prisma.application.findUnique.mockResolvedValue(DETAIL({ applicantId: 'someone-else' }));
    await expect(service.get('acc-me', 'app-1')).rejects.toThrow(NotFoundException);
  });
});

// MC-6 amendment #7: applicant edits their own PENDING application (message + samples).
describe('MyApplicationsService.edit', () => {
  let service: MyApplicationsService;
  let prisma: {
    application: { findUnique: jest.Mock; update: jest.Mock };
    applicationAsset: { deleteMany: jest.Mock };
    projectCallAsset: { findMany: jest.Mock };
    media: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let calls: { resolveApplicationSamples: jest.Mock };

  const RESOLVED = [
    { mediaId: 'med-1', url: 'https://cdn/new-a.webp', kind: 'image', size: null },
    { portfolioItemId: 'pi-2', url: 'https://cdn/new-b.webp', kind: 'image', size: null },
  ];

  const DETAIL = (o: Partial<Record<string, unknown>> = {}) => ({
    id: 'app-1',
    callId: 'call-1',
    applicantId: 'acc-me',
    status: 'pending',
    appliedAs: 'dessinateur',
    message: 'edited',
    createdAt: new Date('2026-07-07T10:00:00.000Z'),
    call: { title: 'T', authorRoles: ['scenariste'], authorName: 'C', authorId: 'acc-owner', genres: [] },
    assets: [{ url: 'https://cdn/new-a.webp', kind: 'image', size: null, position: 0 }],
    ...o,
  });

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(DETAIL()),
        update: jest.fn().mockResolvedValue({}),
      },
      applicationAsset: { deleteMany: jest.fn().mockResolvedValue({}) },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    calls = { resolveApplicationSamples: jest.fn().mockResolvedValue(RESOLVED) };
    service = new MyApplicationsService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as NotificationsService,
      calls as unknown as CallsService,
    );
  });

  const dto = { samples: [{ mediaId: 'med-1' }, { portfolioItemId: 'pi-2' }], message: 'edited' };

  it('404s an unknown application (before any write)', async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(service.edit('acc-me', 'nope', dto)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("404s another user's application (self-scoped, no existence leak)", async () => {
    prisma.application.findUnique.mockResolvedValue(DETAIL({ applicantId: 'someone-else' }));
    await expect(service.edit('acc-me', 'app-1', dto)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['accepted', 'rejected'])('409s a %s application (pending-only edit)', async (status) => {
    prisma.application.findUnique.mockResolvedValue(DETAIL({ status }));
    await expect(service.edit('acc-me', 'app-1', dto)).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(calls.resolveApplicationSamples).not.toHaveBeenCalled();
  });

  it('resolves samples via the shared apply helper (no duplicated normalization)', async () => {
    await service.edit('acc-me', 'app-1', dto);
    expect(calls.resolveApplicationSamples).toHaveBeenCalledWith('acc-me', dto.samples);
  });

  it('replaces the asset set atomically and re-denormalizes sampleUrl to the new first sample', async () => {
    await service.edit('acc-me', 'app-1', dto);
    // one transaction: deleteMany old assets + update (message, sampleUrl, recreate assets).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.applicationAsset.deleteMany).toHaveBeenCalledWith({ where: { applicationId: 'app-1' } });
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app-1' },
        data: expect.objectContaining({
          message: 'edited',
          sampleUrl: 'https://cdn/new-a.webp',
          assets: { create: [
            { mediaId: 'med-1', portfolioItemId: null, url: 'https://cdn/new-a.webp', kind: 'image', size: null, position: 0 },
            { mediaId: null, portfolioItemId: 'pi-2', url: 'https://cdn/new-b.webp', kind: 'image', size: null, position: 1 },
          ] },
        }),
      }),
    );
  });

  it('returns the refreshed detail (MyApplicationRow with message)', async () => {
    const res = await service.edit('acc-me', 'app-1', dto);
    expect(res).toMatchObject({ id: 'app-1', message: 'edited' });
  });
});
