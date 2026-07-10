import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReceivedApplicationsService } from './received-applications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ConnectionsService } from '../connections/connections.service';

// application.findMany rows for list(): applicant ref + assets + minimal call.
const APP = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'app-1',
  callId: 'call-1',
  sampleUrl: 'https://cdn/first.webp',
  message: 'Bonjour',
  status: 'pending',
  appliedAs: 'scenariste',
  createdAt: new Date('2026-07-07T10:00:00.000Z'),
  applicant: {
    id: 'usr-lea',
    displayName: 'Léa B.',
    profileSlug: 'lea-b',
    avatar: null,
    profile: { creatorRoles: ['scenariste'] },
  },
  assets: [] as unknown[],
  call: { id: 'call-1', title: 'Polar nocturne', createdAt: new Date('2026-07-07T09:00:00.000Z') },
  ...o,
});

describe('ReceivedApplicationsService.list', () => {
  let service: ReceivedApplicationsService;
  let prisma: { application: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { application: { findMany: jest.fn().mockResolvedValue([APP()]) } };
    service = new ReceivedApplicationsService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as NotificationsService,
      { ensureConnected: jest.fn() } as unknown as ConnectionsService,
    );
  });

  it('scopes the query to calls owned by the requester (call.authorId, never a client field)', async () => {
    await service.list('acc-owner');
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { call: { authorId: 'acc-owner' } }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('groups applications by call and maps each row to the ApplicationDto shape', async () => {
    const res = await service.list('acc-owner');
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0]).toMatchObject({ callId: 'call-1', callTitle: 'Polar nocturne' });
    expect(res.groups[0].applications[0]).toEqual({
      id: 'app-1',
      callId: 'call-1',
      applicant: { userId: 'usr-lea', name: 'Léa B.', slug: 'lea-b', avatarUrl: null, role: 'scenariste' },
      sampleUrl: 'https://cdn/first.webp',
      samples: [],
      message: 'Bonjour',
      status: 'pending',
      appliedAs: 'scenariste',
      createdAt: '2026-07-07T10:00:00.000Z',
    });
  });

  it('exposes each application own samples (position order) via toApplicationSamples', async () => {
    prisma.application.findMany.mockResolvedValue([
      APP({
        assets: [
          { url: 'https://cdn/a.webp', kind: 'image', size: null, position: 0 },
          { url: 'https://cdn/b.pdf', kind: 'document', size: 2048, position: 1 },
        ],
      }),
    ]);
    const res = await service.list('acc-owner');
    expect(res.groups[0].applications[0].samples).toEqual([
      { url: 'https://cdn/a.webp', kind: 'image', size: null },
      { url: 'https://cdn/b.pdf', kind: 'document', size: 2048 },
    ]);
  });

  it('orders groups by call createdAt desc and keeps rows newest-first within a group', async () => {
    // findMany already returns newest-first (orderBy createdAt desc); two calls, interleaved.
    prisma.application.findMany.mockResolvedValue([
      APP({ id: 'a-new', callId: 'call-new', createdAt: new Date('2026-07-07T12:00:00.000Z'),
        call: { id: 'call-new', title: 'Récent', createdAt: new Date('2026-07-07T11:00:00.000Z') } }),
      APP({ id: 'a-old2', callId: 'call-old', createdAt: new Date('2026-07-07T10:30:00.000Z'),
        call: { id: 'call-old', title: 'Ancien', createdAt: new Date('2026-07-07T08:00:00.000Z') } }),
      APP({ id: 'a-old1', callId: 'call-old', createdAt: new Date('2026-07-07T10:00:00.000Z'),
        call: { id: 'call-old', title: 'Ancien', createdAt: new Date('2026-07-07T08:00:00.000Z') } }),
    ]);
    const res = await service.list('acc-owner');
    expect(res.groups.map((g) => g.callId)).toEqual(['call-new', 'call-old']);
    expect(res.groups[1].applications.map((a) => a.id)).toEqual(['a-old2', 'a-old1']);
  });

  it('produces no group for calls with zero applications (empty result → empty groups)', async () => {
    prisma.application.findMany.mockResolvedValue([]);
    const res = await service.list('acc-owner');
    expect(res.groups).toEqual([]);
  });
});

describe('ReceivedApplicationsService.decide', () => {
  let service: ReceivedApplicationsService;
  let prisma: { application: { findUnique: jest.Mock; update: jest.Mock } };
  let notifications: { create: jest.Mock };
  let connections: { ensureConnected: jest.Mock };

  const ROW = (o: Partial<Record<string, unknown>> = {}) => ({
    id: 'app-1',
    callId: 'call-1',
    applicantId: 'usr-lea',
    sampleUrl: 'https://cdn/first.webp',
    message: 'Bonjour',
    status: 'pending',
    appliedAs: 'scenariste',
    createdAt: new Date('2026-07-07T10:00:00.000Z'),
    applicant: {
      id: 'usr-lea',
      displayName: 'Léa B.',
      profileSlug: 'lea-b',
      avatar: null,
      profile: { creatorRoles: ['scenariste'] },
    },
    assets: [],
    call: { authorId: 'acc-owner', title: 'Polar nocturne' },
    ...o,
  });

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(ROW()),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    connections = { ensureConnected: jest.fn().mockResolvedValue(undefined) };
    service = new ReceivedApplicationsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      connections as unknown as ConnectionsService,
    );
  });

  it('404s an unknown application', async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(service.decide('acc-owner', 'nope', 'accepted')).rejects.toThrow(NotFoundException);
    expect(prisma.application.update).not.toHaveBeenCalled();
  });

  it("404s when the requester does not own the parent call (no existence leak)", async () => {
    prisma.application.findUnique.mockResolvedValue(ROW({ call: { authorId: 'someone-else', title: 'X' } }));
    await expect(service.decide('acc-owner', 'app-1', 'accepted')).rejects.toThrow(NotFoundException);
    expect(prisma.application.update).not.toHaveBeenCalled();
  });

  it('409s an already accepted application (pending-only transition)', async () => {
    prisma.application.findUnique.mockResolvedValue(ROW({ status: 'accepted' }));
    await expect(service.decide('acc-owner', 'app-1', 'rejected')).rejects.toThrow(ConflictException);
    expect(prisma.application.update).not.toHaveBeenCalled();
  });

  it('409s an already rejected application', async () => {
    prisma.application.findUnique.mockResolvedValue(ROW({ status: 'rejected' }));
    await expect(service.decide('acc-owner', 'app-1', 'accepted')).rejects.toThrow(ConflictException);
  });

  it('accepts: persists status and notifies the applicant (application_accepted)', async () => {
    const dto = await service.decide('acc-owner', 'app-1', 'accepted');
    expect(prisma.application.update).toHaveBeenCalledWith({ where: { id: 'app-1' }, data: { status: 'accepted' } });
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'usr-lea',
      type: 'application_accepted',
      refId: 'app-1',
      sourceUserId: 'acc-owner',
    });
    expect(dto).toMatchObject({ id: 'app-1', status: 'accepted', applicant: { userId: 'usr-lea' } });
    // MC-8 seam: accepting creates the mutual connection between the owner and the applicant.
    expect(connections.ensureConnected).toHaveBeenCalledWith('acc-owner', 'usr-lea');
  });

  it('rejects: persists status and notifies the applicant (application_rejected)', async () => {
    const dto = await service.decide('acc-owner', 'app-1', 'rejected');
    expect(prisma.application.update).toHaveBeenCalledWith({ where: { id: 'app-1' }, data: { status: 'rejected' } });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'application_rejected', recipientId: 'usr-lea', refId: 'app-1' }),
    );
    expect(dto).toMatchObject({ status: 'rejected' });
    // MC-8 seam: a rejection must NOT create a connection.
    expect(connections.ensureConnected).not.toHaveBeenCalled();
  });
});

// MC-7 amendment (2026-07-10): the call owner can REMOVE an applicant regardless of status.
describe('ReceivedApplicationsService.remove', () => {
  let service: ReceivedApplicationsService;
  let prisma: {
    application: { findUnique: jest.Mock; delete: jest.Mock };
    projectCall: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const ROW = (o: Partial<Record<string, unknown>> = {}) => ({
    id: 'app-1',
    callId: 'call-1',
    status: 'pending',
    call: { authorId: 'acc-owner' },
    ...o,
  });

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(ROW()),
        delete: jest.fn().mockResolvedValue({}),
      },
      projectCall: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new ReceivedApplicationsService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as NotificationsService,
      { ensureConnected: jest.fn() } as unknown as ConnectionsService,
    );
  });

  it('404s an unknown application', async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(service.remove('acc-owner', 'nope')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s when the requester does not own the parent call (no existence leak)', async () => {
    prisma.application.findUnique.mockResolvedValue(ROW({ call: { authorId: 'someone-else' } }));
    await expect(service.remove('acc-owner', 'app-1')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['pending', 'accepted', 'rejected'])(
    'removes a %s application: deletes it and decrements the count (accepted frees the derived seat)',
    async (status) => {
      prisma.application.findUnique.mockResolvedValue(ROW({ status }));
      await service.remove('acc-owner', 'app-1');
      expect(prisma.application.delete).toHaveBeenCalledWith({ where: { id: 'app-1' } });
      expect(prisma.projectCall.updateMany).toHaveBeenCalledWith({
        where: { id: 'call-1', applicationCount: { gt: 0 } },
        data: { applicationCount: { decrement: 1 } },
      });
    },
  );
});
