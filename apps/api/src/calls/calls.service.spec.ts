import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CallsService, parseCallsLimit } from './calls.service';
import { PrismaService } from '../prisma/prisma.service';
import type { QueueService } from '../queue/queue.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { BlocksService } from '../blocks/blocks.service';

const noBlocks = () => ({ isBlockedPair: jest.fn().mockResolvedValue(false) }) as unknown as BlocksService;

const CALL_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'call-1',
  title: '« Lames de Brume »',
  authorRoles: ['scenariste'],
  seekingRoles: ['dessinateur'],
  seats: { dessinateur: 1 },
  projectId: null,
  authorId: 'acc-owner',
  authorName: 'Camille R.',
  tags: ['Seinen', 'Thriller'],
  description: 'Un thriller urbain.',
  genres: ['seinen', 'thriller'],
  format: null,
  scope: '~120 planches',
  closesAt: null,
  applicationCount: 5,
  status: 'open',
  createdAt: new Date('2026-07-01'),
  ...overrides,
});

describe('parseCallsLimit', () => {
  it('defaults to 2', () => {
    expect(parseCallsLimit(undefined)).toBe(2);
  });
  it('clamps to a max of 6', () => {
    expect(parseCallsLimit('99')).toBe(6);
  });
  it('falls back to default on non-numeric / below-range input', () => {
    expect(parseCallsLimit('0')).toBe(2);
    expect(parseCallsLimit('abc')).toBe(2);
  });
});

describe('CallsService.findOpenCalls', () => {
  let service: CallsService;
  let prisma: { projectCall: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { projectCall: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('queries only open calls, newest first, limited', async () => {
    await service.findOpenCalls(2);
    expect(prisma.projectCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'open' }, orderBy: { createdAt: 'desc' }, take: 2 }),
    );
  });

  it('composes the heading server-side from author/seeking roles', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW()]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0].heading).toBe('SCÉNARISTE CHERCHE DESSINATEUR·RICE');
  });

  it('maps the full CallPreview contract', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW()]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0]).toEqual({
      id: 'call-1',
      heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
      title: '« Lames de Brume »',
      tags: ['Seinen', 'Thriller'],
      authorName: 'Camille R.',
      closesInDays: null,
      applicationCount: 5,
    });
  });
});

describe('CallsService.findBoard', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findMany: jest.Mock; count: jest.Mock };
    projectCallAsset: { findMany: jest.Mock };
    media: { findMany: jest.Mock };
    application: { findMany: jest.Mock; groupBy: jest.Mock };
    profile: { findUnique: jest.Mock };
    account: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      projectCall: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      account: { findMany: jest.fn().mockResolvedValue([]) },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      application: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('filters by role — matches calls seeking that role (ANY, via has)', async () => {
    await service.findBoard({ role: 'dessinateur', status: 'all' }, 'viewer');
    expect(prisma.projectCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ seekingRoles: { has: 'dessinateur' } }) }),
    );
  });

  it('filters by genre ids with hasSome', async () => {
    await service.findBoard({ genre: ['seinen', 'thriller'], status: 'all' }, 'viewer');
    expect(prisma.projectCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ genres: { hasSome: ['seinen', 'thriller'] } }) }),
    );
  });

  it('status=open excludes stored-open rows whose deadline has passed (derived closure)', async () => {
    await service.findBoard({ status: 'open' }, 'viewer');
    const where = prisma.projectCall.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('open');
    expect(where.OR).toEqual([{ closesAt: null }, { closesAt: { gt: expect.any(Date) } }]);
  });

  it('paginates (pageSize 10) and returns total', async () => {
    prisma.projectCall.count.mockResolvedValue(23);
    const res = await service.findBoard({ status: 'all', page: 2 }, 'viewer');
    expect(prisma.projectCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10, orderBy: { createdAt: 'desc' } }),
    );
    expect(res).toMatchObject({ page: 2, pageSize: 10, total: 23 });
  });

  it('maps a full CallCard: direction, description, status, deadline, isOwner, heading', async () => {
    const closesAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ closesAt })]);
    const res = await service.findBoard({ status: 'all' }, 'acc-owner');
    expect(res.items[0]).toMatchObject({
      id: 'call-1',
      direction: 'writerSeeksIllustrator',
      description: 'Un thriller urbain.',
      heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
      status: 'open',
      isOwner: true,
      sampleUrl: null,
    });
    expect(res.items[0].deadline).toBe(closesAt.toISOString());
  });

  it('resolves sampleUrl from the first ready call_sample asset thumb', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW()]);
    prisma.projectCallAsset.findMany.mockResolvedValue([{ callId: 'call-1', mediaId: 'med-1', position: 0 }]);
    prisma.media.findMany.mockResolvedValue([{ id: 'med-1', kind: 'call_sample', variants: { thumb: 'https://cdn/thumb.webp' }, size: null }]);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items[0].sampleUrl).toBe('https://cdn/thumb.webp');
  });

  // ── MC-4X: viewerHasRole ──────────────────────────────────────────────────
  it('viewerHasRole true when the viewer creatorRoles contain the call seekingRole', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ seekingRoles: ['dessinateur'] })]);
    prisma.profile.findUnique.mockResolvedValue({ creatorRoles: ['scenariste', 'dessinateur'] });
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items[0].viewerHasRole).toBe(true);
  });

  it('viewerHasRole false when the viewer lacks the call seekingRole', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ seekingRoles: ['dessinateur'] })]);
    prisma.profile.findUnique.mockResolvedValue({ creatorRoles: ['scenariste'] });
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items[0].viewerHasRole).toBe(false);
  });

  it('viewerHasRole false when the viewer has no profile', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ seekingRoles: ['dessinateur'] })]);
    prisma.profile.findUnique.mockResolvedValue(null);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items[0].viewerHasRole).toBe(false);
  });

  it('sets myApplicationId (and hasApplied) only for calls the viewer applied to (single lookup, no N+1)', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ id: 'call-1' }), CALL_ROW({ id: 'call-2' })]);
    prisma.application.findMany.mockResolvedValue([{ id: 'app-9', callId: 'call-1', status: 'pending' }]);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(prisma.application.findMany).toHaveBeenCalledTimes(1);
    const applied = res.items.find((c) => c.id === 'call-1');
    const notApplied = res.items.find((c) => c.id === 'call-2');
    expect(applied?.myApplicationId).toBe('app-9');
    expect(applied?.hasApplied).toBe(true);
    expect(notApplied?.myApplicationId).toBeNull();
    expect(notApplied?.hasApplied).toBe(false);
  });

  // MC-14: the viewer's own application status feeds the applicant-side pill (Acceptée/Refusée/envoyée).
  it('exposes myApplicationStatus from the viewer application (null when not applied)', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ id: 'call-1' }), CALL_ROW({ id: 'call-2' })]);
    prisma.application.findMany.mockResolvedValue([{ id: 'app-9', callId: 'call-1', status: 'accepted' }]);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items.find((c) => c.id === 'call-1')?.myApplicationStatus).toBe('accepted');
    expect(res.items.find((c) => c.id === 'call-2')?.myApplicationStatus).toBeNull();
  });

  it('skips the applications lookup when the page is empty', async () => {
    prisma.projectCall.findMany.mockResolvedValue([]);
    await service.findBoard({ status: 'all' }, 'viewer');
    expect(prisma.application.findMany).not.toHaveBeenCalled();
  });
});

describe('CallsService.createCall', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { create: jest.Mock };
    projectCallAsset: { createMany: jest.Mock; findMany: jest.Mock };
    media: { findMany: jest.Mock };
    account: { findUnique: jest.Mock; findMany: jest.Mock };
    profile: { findUnique: jest.Mock };
    project: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: { enqueue: jest.Mock };

  const FUTURE = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    const projectCall = {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'call-new', ...data, applicationCount: 0, createdAt: new Date() })),
    };
    const projectCallAsset = { createMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) };
    prisma = {
      projectCall,
      projectCallAsset,
      media: { findMany: jest.fn().mockResolvedValue([]) },
      account: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Camille R.' }), findMany: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue({ creatorRoles: ['scenariste'] }) },
      project: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'acc-1' }) },
      // interactive transaction: run the callback with the tx client (same mocked models)
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb({ projectCall, projectCallAsset })),
    };
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new CallsService(prisma as unknown as PrismaService, queue as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  const DTO = (o: Partial<Record<string, unknown>> = {}) => ({
    seats: { dessinateur: 1 },
    title: '« Lames de Brume »',
    description: 'Un thriller urbain.',
    genres: ['seinen', 'thriller'],
    scope: '~120 planches',
    deadline: FUTURE,
    ...o,
  });

  const readyMedia = (id: string, kind: string, ownerId = 'acc-1') => ({ id, ownerId, status: 'ready', kind });

  it('derives authorRoles from the profile (not the client) and denormalizes authorName', async () => {
    prisma.profile.findUnique.mockResolvedValue({ creatorRoles: ['scenariste'] });
    await service.createCall('acc-1', DTO() as never);
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ authorId: 'acc-1', authorRoles: ['scenariste'], seekingRoles: ['dessinateur'], authorName: 'Camille R.' });
  });

  // ── MC-4X §8: seats + derived author label ──────────────────────────────────
  it('stores seats + derives seekingRoles from the seat keys (deterministic CREATOR_ROLES order)', async () => {
    await service.createCall('acc-1', DTO({ seats: { dessinateur: 2, scenariste: 1 } }) as never);
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data.seats).toEqual({ dessinateur: 2, scenariste: 1 });
    expect(data.seekingRoles).toEqual(['scenariste', 'dessinateur']);
  });

  it('drops zero/invalid seats and caps each role at CALL_MAX_SEATS_PER_ROLE', async () => {
    await service.createCall('acc-1', DTO({ seats: { dessinateur: 99, scenariste: 0 } }) as never);
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data.seats).toEqual({ dessinateur: 5 });
    expect(data.seekingRoles).toEqual(['dessinateur']);
  });

  it('composes the multi-author heading when the author has both creator roles', async () => {
    prisma.profile.findUnique.mockResolvedValue({ creatorRoles: ['scenariste', 'dessinateur'] });
    const card = await service.createCall('acc-1', DTO({ seats: { scenariste: 1 } }) as never);
    expect(card.heading).toBe('SCÉNARISTE & DESSINATEUR CHERCHE SCÉNARISTE');
  });

  it('422s when the author profile has no creator role', async () => {
    prisma.profile.findUnique.mockResolvedValue({ creatorRoles: [] });
    await expect(service.createCall('acc-1', DTO() as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.projectCall.create).not.toHaveBeenCalled();
  });

  it('exposes seats, acceptedByRole (empty on a fresh call) and remainingSeats', async () => {
    const card = await service.createCall('acc-1', DTO({ seats: { dessinateur: 2 } }) as never);
    expect(card.seats).toEqual({ dessinateur: 2 });
    expect(card.acceptedByRole).toEqual({});
    expect(card.remainingSeats).toBe(2);
  });

  it('links an author-owned project (stores projectId)', async () => {
    prisma.project.findUnique.mockResolvedValue({ ownerId: 'acc-1' });
    await service.createCall('acc-1', DTO({ projectId: 'proj-1' }) as never);
    expect(prisma.projectCall.create.mock.calls[0][0].data.projectId).toBe('proj-1');
  });

  it('403s linking a project the caller does not own', async () => {
    prisma.project.findUnique.mockResolvedValue({ ownerId: 'someone-else' });
    await expect(service.createCall('acc-1', DTO({ projectId: 'proj-1' }) as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('400s linking an unknown project', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.createCall('acc-1', DTO({ projectId: 'nope' }) as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('composes tags from genre fr labels + scope', async () => {
    await service.createCall('acc-1', DTO() as never);
    expect(prisma.projectCall.create.mock.calls[0][0].data.tags).toEqual(['Seinen', 'Thriller', '~120 planches']);
  });

  it('enqueues a BullMQ-safe delayed close-call job keyed by call id (hyphens only)', async () => {
    await service.createCall('acc-1', DTO() as never);
    const call = queue.enqueue.mock.calls[0];
    expect(call[0]).toBe('calls');
    expect(call[1]).toBe('close-call');
    expect(call[3].idempotencyKey).toBe('close-call-call-new');
    expect(call[3].idempotencyKey).not.toContain(':');
    expect(call[3].delayMs).toBeGreaterThan(0);
  });

  it('returns a CallCard with isOwner true, derived open status and viewerHasRole', async () => {
    const card = await service.createCall('acc-1', DTO() as never);
    expect(card).toMatchObject({ isOwner: true, status: 'open', direction: 'writerSeeksIllustrator', viewerHasRole: false });
  });

  // ── MC-4X: multi-sample + documents ─────────────────────────────────────────
  it('persists sample + document assets with positions in one transaction', async () => {
    prisma.media.findMany.mockResolvedValue([
      readyMedia('s1', 'call_sample'),
      readyMedia('s2', 'call_sample'),
      readyMedia('d1', 'call_document'),
    ]);
    await service.createCall('acc-1', DTO({ sampleMediaIds: ['s1', 's2'], documentMediaIds: ['d1'] }) as never);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.projectCallAsset.createMany).toHaveBeenCalledWith({
      data: [
        { callId: 'call-new', mediaId: 's1', position: 0 },
        { callId: 'call-new', mediaId: 's2', position: 1 },
        { callId: 'call-new', mediaId: 'd1', position: 2 },
      ],
    });
  });

  it('validates every asset id in ONE media.findMany (no N+1)', async () => {
    prisma.media.findMany.mockResolvedValue([readyMedia('s1', 'call_sample'), readyMedia('d1', 'call_document')]);
    await service.createCall('acc-1', DTO({ sampleMediaIds: ['s1'], documentMediaIds: ['d1'] }) as never);
    expect(prisma.media.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.media.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['s1', 'd1'] } } }));
  });

  it('rejects a sample media not owned by the caller', async () => {
    prisma.media.findMany.mockResolvedValue([readyMedia('s1', 'call_sample', 'other')]);
    await expect(service.createCall('acc-1', DTO({ sampleMediaIds: ['s1'] }) as never)).rejects.toThrow(
      new BadRequestException("Ce visuel d'exemple est invalide."),
    );
  });

  it('rejects a sample media that is not ready', async () => {
    prisma.media.findMany.mockResolvedValue([{ id: 's1', ownerId: 'acc-1', status: 'pending', kind: 'call_sample' }]);
    await expect(service.createCall('acc-1', DTO({ sampleMediaIds: ['s1'] }) as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a sample media of the wrong kind', async () => {
    prisma.media.findMany.mockResolvedValue([readyMedia('s1', 'avatar')]);
    await expect(service.createCall('acc-1', DTO({ sampleMediaIds: ['s1'] }) as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid document with the document message', async () => {
    prisma.media.findMany.mockResolvedValue([readyMedia('d1', 'call_sample')]); // wrong kind for a document
    await expect(service.createCall('acc-1', DTO({ documentMediaIds: ['d1'] }) as never)).rejects.toThrow(
      new BadRequestException('Ce document est invalide.'),
    );
  });

  it('rejects more than CALL_MAX_SAMPLES samples', async () => {
    await expect(
      service.createCall('acc-1', DTO({ sampleMediaIds: ['a', 'b', 'c', 'd', 'e', 'f'] }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects more than CALL_MAX_DOCUMENTS documents', async () => {
    await expect(
      service.createCall('acc-1', DTO({ documentMediaIds: ['a', 'b', 'c', 'd'] }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CallsService.closeEarly', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findUnique: jest.Mock; update: jest.Mock };
    projectCallAsset: { findMany: jest.Mock };
    media: { findMany: jest.Mock };
    profile: { findUnique: jest.Mock };
    application: { groupBy: jest.Mock };
    account: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      projectCall: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...CALL_ROW(), ...data })),
      },
      account: { findMany: jest.fn().mockResolvedValue([]) },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue(null) },
      application: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('404s an unknown call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    await expect(service.closeEarly('acc-owner', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s a non-owner', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: 'acc-owner' }));
    await expect(service.closeEarly('someone-else', 'call-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('flips status to closed for the owner', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: 'acc-owner' }));
    const card = await service.closeEarly('acc-owner', 'call-1');
    expect(prisma.projectCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'call-1' }, data: { status: 'closed', closedReason: 'manual' } }),
    );
    expect(card.status).toBe('closed');
  });

  // MC-14: a manual close carries closedReason 'manual' so reopenIfSeatFreed never reopens it.
  it('marks the manual close as reason manual (sticky, never auto-reopened)', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: 'acc-owner' }));
    await service.closeEarly('acc-owner', 'call-1');
    expect(prisma.projectCall.update.mock.calls[0][0].data).toEqual({ status: 'closed', closedReason: 'manual' });
  });
});

describe('CallsService.findDetail', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findUnique: jest.Mock };
    projectCallAsset: { findMany: jest.Mock };
    media: { findMany: jest.Mock };
    application: { findMany: jest.Mock; groupBy: jest.Mock };
    profile: { findUnique: jest.Mock };
    account: { findUnique: jest.Mock; findMany: jest.Mock };
    invitation: { findMany: jest.Mock };
  };

  const ref = (id: string, name: string, role: string | null = null) => ({
    id,
    displayName: name,
    profileSlug: `${id}-slug`,
    avatar: null,
    profile: role ? { creatorRoles: [role] } : null,
  });

  beforeEach(() => {
    prisma = {
      projectCall: { findUnique: jest.fn().mockResolvedValue(CALL_ROW()) },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      // resolveApplied (viewer's applications) + buildTeam (accepted applicants) share this mock; the
      // status:'accepted' query in buildTeam selects { applicant }, so accepted rows carry `applicant`.
      application: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue({ creatorRoles: ['dessinateur'] }) },
      account: { findUnique: jest.fn().mockResolvedValue(ref('acc-owner', 'Camille R.', 'scenariste')), findMany: jest.fn().mockResolvedValue([]) },
      invitation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('404s an unknown id', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    await expect(service.findDetail('viewer', 'nope')).rejects.toThrow(new NotFoundException('Appel introuvable.'));
  });

  it('returns the full detail: samples (web, position order), documents (orig + size), createdAt, viewer flags', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ createdAt: new Date('2026-07-01T09:00:00.000Z') }));
    prisma.projectCallAsset.findMany.mockResolvedValue([
      { callId: 'call-1', mediaId: 's1', position: 0 },
      { callId: 'call-1', mediaId: 's2', position: 1 },
      { callId: 'call-1', mediaId: 'd1', position: 2 },
    ]);
    prisma.media.findMany.mockResolvedValue([
      { id: 's1', kind: 'call_sample', variants: { thumb: 't1', web: 'web1', orig: 'o1' }, size: null },
      { id: 's2', kind: 'call_sample', variants: { thumb: 't2', web: 'web2', orig: 'o2' }, size: null },
      { id: 'd1', kind: 'call_document', variants: { orig: 'https://cdn/d1.pdf' }, size: 4096 },
    ]);
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.samples).toEqual(['web1', 'web2']);
    expect(detail.documents).toEqual([{ mediaId: '', url: 'https://cdn/d1.pdf', size: 4096 }]);
    expect(detail.createdAt).toBe('2026-07-01T09:00:00.000Z');
    expect(detail.viewerHasRole).toBe(true);
    expect(detail.sampleUrl).toBe('t1'); // board thumb still the first sample thumb
  });

  // MC-7 F5: raw genres/format/scope for the owner edit-form pre-fill (additive contract).
  it('exposes raw genres/format/scope for the edit form', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(
      CALL_ROW({ genres: ['seinen', 'thriller'], format: 'serie', scope: '~120 planches' }),
    );
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.genres).toEqual(['seinen', 'thriller']);
    expect(detail.format).toBe('serie');
    expect(detail.scope).toBe('~120 planches');
  });

  it('omits pending/failed media (not returned by the ready-filtered media query)', async () => {
    prisma.projectCallAsset.findMany.mockResolvedValue([
      { callId: 'call-1', mediaId: 's1', position: 0 },
      { callId: 'call-1', mediaId: 's2', position: 1 },
    ]);
    prisma.media.findMany.mockResolvedValue([{ id: 's1', kind: 'call_sample', variants: { web: 'web1' }, size: null }]);
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.samples).toEqual(['web1']);
  });

  it('reflects hasApplied when the viewer has an application on the call', async () => {
    prisma.application.findMany.mockResolvedValue([{ id: 'app-1', callId: 'call-1', applicant: ref('acc-x', 'X') }]);
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.hasApplied).toBe(true);
    expect(detail.myApplicationId).toBe('app-1');
  });

  // ── MC-4X req6: team ────────────────────────────────────────────────────────
  it('team = the author, deduped, as an InvitationUserRef', async () => {
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.team).toEqual([
      { userId: 'acc-owner', name: 'Camille R.', slug: 'acc-owner-slug', avatarUrl: null, role: 'scenariste' },
    ]);
  });

  it('team includes accepted applicants after the author', async () => {
    prisma.application.findMany.mockResolvedValue([{ applicant: ref('acc-appl', 'Applicant A', 'dessinateur') }]);
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.team.map((m) => m.userId)).toEqual(['acc-owner', 'acc-appl']);
  });

  it('team includes accepted project collaborators when a project is linked (deduped, no author repeat)', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ projectId: 'proj-1' }));
    prisma.invitation.findMany.mockResolvedValue([
      { fromUser: ref('acc-owner', 'Camille R.', 'scenariste'), toUser: ref('acc-collab', 'Collab C', 'dessinateur') },
    ]);
    const detail = await service.findDetail('viewer', 'call-1');
    expect(prisma.invitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'proj-1', status: 'accepted' } }),
    );
    expect(detail.team.map((m) => m.userId)).toEqual(['acc-owner', 'acc-collab']);
  });

  it('does not query invitations when no project is linked', async () => {
    await service.findDetail('viewer', 'call-1');
    expect(prisma.invitation.findMany).not.toHaveBeenCalled();
  });

  it('empty sections when the call has no assets', async () => {
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.samples).toEqual([]);
    expect(detail.documents).toEqual([]);
  });

  it('exposes seats + accepted-per-role + remaining (batched groupBy)', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ seats: { dessinateur: 2, scenariste: 1 } }));
    prisma.application.groupBy.mockResolvedValue([
      { callId: 'call-1', appliedAs: 'dessinateur', _count: { _all: 1 } },
    ]);
    const detail = await service.findDetail('viewer', 'call-1');
    expect(detail.seats).toEqual({ dessinateur: 2, scenariste: 1 });
    expect(detail.acceptedByRole).toEqual({ dessinateur: 1 });
    expect(detail.remainingSeats).toBe(2); // (2-1) + (1-0)
  });
});

describe('CallsService.closeIfFilled (MC-4X §8 — MC-7 accept seam)', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findUnique: jest.Mock; updateMany: jest.Mock };
    application: { groupBy: jest.Mock };
  };

  const accepted = (rows: { appliedAs: string; n: number }[]) =>
    rows.map((r) => ({ callId: 'call-1', appliedAs: r.appliedAs, _count: { _all: r.n } }));

  beforeEach(() => {
    prisma = {
      projectCall: {
        findUnique: jest.fn().mockResolvedValue({ id: 'call-1', status: 'open', seats: { dessinateur: 2 } }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      application: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('closes the call when every seat is covered by accepted applications', async () => {
    prisma.application.groupBy.mockResolvedValue(accepted([{ appliedAs: 'dessinateur', n: 2 }]));
    const closed = await service.closeIfFilled('call-1');
    expect(closed).toBe(true);
    expect(prisma.projectCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', status: 'open' }, // status guard ⇒ idempotent + race-safe
      data: { status: 'closed', closedReason: 'full' }, // MC-14: auto-close is reopenable
    });
  });

  it('does not close when a seat is still open', async () => {
    prisma.application.groupBy.mockResolvedValue(accepted([{ appliedAs: 'dessinateur', n: 1 }]));
    const closed = await service.closeIfFilled('call-1');
    expect(closed).toBe(false);
    expect(prisma.projectCall.updateMany).not.toHaveBeenCalled();
  });

  it('requires EVERY role filled on a multi-role call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue({ id: 'call-1', status: 'open', seats: { dessinateur: 1, scenariste: 1 } });
    prisma.application.groupBy.mockResolvedValue(accepted([{ appliedAs: 'dessinateur', n: 1 }])); // scenariste unfilled
    expect(await service.closeIfFilled('call-1')).toBe(false);
  });

  it('is a no-op when the call is already closed', async () => {
    prisma.projectCall.findUnique.mockResolvedValue({ id: 'call-1', status: 'closed', seats: { dessinateur: 2 } });
    expect(await service.closeIfFilled('call-1')).toBe(false);
    expect(prisma.projectCall.updateMany).not.toHaveBeenCalled();
  });

  it('returns false when the guarded update already ran (idempotent — count 0)', async () => {
    prisma.application.groupBy.mockResolvedValue(accepted([{ appliedAs: 'dessinateur', n: 2 }]));
    prisma.projectCall.updateMany.mockResolvedValue({ count: 0 }); // a concurrent close won the race
    expect(await service.closeIfFilled('call-1')).toBe(false);
  });

  it('returns false for an unknown call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    expect(await service.closeIfFilled('nope')).toBe(false);
  });
});

// ── MC-14: reopenIfSeatFreed — symmetric half of closeIfFilled ────────────────
describe('CallsService.reopenIfSeatFreed', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findUnique: jest.Mock; updateMany: jest.Mock };
    application: { groupBy: jest.Mock };
  };

  const accepted = (rows: { appliedAs: string; n: number }[]) =>
    rows.map((r) => ({ callId: 'call-1', appliedAs: r.appliedAs, _count: { _all: r.n } }));

  beforeEach(() => {
    prisma = {
      projectCall: {
        // closed + auto (full) + a free seat by default (2 seats, 1 accepted below)
        findUnique: jest.fn().mockResolvedValue({ id: 'call-1', status: 'closed', closedReason: 'full', seats: { dessinateur: 2 }, closesAt: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      application: { groupBy: jest.fn().mockResolvedValue(accepted([{ appliedAs: 'dessinateur', n: 1 }])) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('reopens an auto-closed (full) call once a seat frees', async () => {
    const reopened = await service.reopenIfSeatFreed('call-1');
    expect(reopened).toBe(true);
    expect(prisma.projectCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', status: 'closed', closedReason: 'full' }, // guard ⇒ race-safe, manual never matches
      data: { status: 'open', closedReason: null },
    });
  });

  it('never reopens a manually closed call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue({ id: 'call-1', status: 'closed', closedReason: 'manual', seats: { dessinateur: 2 }, closesAt: null });
    expect(await service.reopenIfSeatFreed('call-1')).toBe(false);
    expect(prisma.projectCall.updateMany).not.toHaveBeenCalled();
  });

  it('does not reopen when the call is still full', async () => {
    prisma.application.groupBy.mockResolvedValue(accepted([{ appliedAs: 'dessinateur', n: 2 }]));
    expect(await service.reopenIfSeatFreed('call-1')).toBe(false);
    expect(prisma.projectCall.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op when the call is already open', async () => {
    prisma.projectCall.findUnique.mockResolvedValue({ id: 'call-1', status: 'open', closedReason: null, seats: { dessinateur: 2 }, closesAt: null });
    expect(await service.reopenIfSeatFreed('call-1')).toBe(false);
    expect(prisma.projectCall.updateMany).not.toHaveBeenCalled();
  });

  it('does not reopen a call whose deadline has already passed (stays closed)', async () => {
    prisma.projectCall.findUnique.mockResolvedValue({
      id: 'call-1', status: 'closed', closedReason: 'full', seats: { dessinateur: 2 },
      closesAt: new Date(Date.now() - 60_000),
    });
    expect(await service.reopenIfSeatFreed('call-1')).toBe(false);
    expect(prisma.projectCall.updateMany).not.toHaveBeenCalled();
  });

  it('returns false when the guarded update already ran (idempotent — count 0)', async () => {
    prisma.projectCall.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.reopenIfSeatFreed('call-1')).toBe(false);
  });

  it('returns false for an unknown call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    expect(await service.reopenIfSeatFreed('nope')).toBe(false);
  });
});

// ── MC-7 round 3: owner field edit (PATCH /calls/:id) ─────────────────────────
describe('CallsService.updateCall', () => {
  let service: CallsService;
  let queue: { enqueue: jest.Mock };
  let prisma: {
    projectCall: { findUnique: jest.Mock; update: jest.Mock };
    projectCallAsset: { findMany: jest.Mock };
    media: { findMany: jest.Mock };
    profile: { findUnique: jest.Mock };
    application: { groupBy: jest.Mock };
    account: { findMany: jest.Mock };
  };

  beforeEach(() => {
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      projectCall: {
        findUnique: jest.fn().mockResolvedValue(CALL_ROW({ authorId: 'acc-owner' })),
        update: jest.fn().mockImplementation(({ data }) => ({ ...CALL_ROW({ authorId: 'acc-owner' }), ...data })),
      },
      account: { findMany: jest.fn().mockResolvedValue([]) },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue(null) },
      application: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, queue as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('400s an empty body (no field to change)', async () => {
    await expect(service.updateCall('acc-owner', 'call-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400s when status:closed is combined with a field edit', async () => {
    await expect(
      service.updateCall('acc-owner', 'call-1', { status: 'closed', title: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates {status:closed} alone to closeEarly (manual close, reason manual)', async () => {
    const card = await service.updateCall('acc-owner', 'call-1', { status: 'closed' });
    expect(prisma.projectCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'call-1' }, data: { status: 'closed', closedReason: 'manual' } }),
    );
    expect(card.status).toBe('closed');
  });

  it('404s an unknown call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    await expect(service.updateCall('acc-owner', 'nope', { title: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s a non-owner (no existence leak — same shape as an owner edit path)', async () => {
    await expect(service.updateCall('someone-else', 'call-1', { title: 'X' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('409s a closed call (settled record — edit refused)', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: 'acc-owner', status: 'closed' }));
    await expect(service.updateCall('acc-owner', 'call-1', { title: 'X' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists title/description and re-derives tags from genres/scope/format', async () => {
    const card = await service.updateCall('acc-owner', 'call-1', {
      title: '« Nouveau »',
      description: 'Nouvelle desc.',
      genres: ['shonen'],
      format: 'serie',
      scope: '~80 planches',
    });
    const data = prisma.projectCall.update.mock.calls[0][0].data;
    expect(data.title).toBe('« Nouveau »');
    expect(data.description).toBe('Nouvelle desc.');
    expect(data.genres).toEqual(['shonen']);
    expect(data.format).toBe('serie');
    expect(data.scope).toBe('~80 planches');
    expect(data.tags).toEqual(['Shōnen', '~80 planches']); // genre FR label + scope
    expect(card.title).toBe('« Nouveau »');
  });

  it('re-derives seekingRoles from edited seats', async () => {
    await service.updateCall('acc-owner', 'call-1', { seats: { scenariste: 2 } });
    const data = prisma.projectCall.update.mock.calls[0][0].data;
    expect(data.seats).toEqual({ scenariste: 2 });
    expect(data.seekingRoles).toEqual(['scenariste']);
  });

  it('409s when reducing a role below its accepted-application count', async () => {
    prisma.application.groupBy.mockResolvedValue([{ callId: 'call-1', appliedAs: 'dessinateur', _count: { _all: 1 } }]);
    await expect(
      service.updateCall('acc-owner', 'call-1', { seats: { scenariste: 1 } }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.projectCall.update).not.toHaveBeenCalled();
  });

  it('allows reducing seats to exactly the accepted count', async () => {
    prisma.application.groupBy.mockResolvedValue([{ callId: 'call-1', appliedAs: 'dessinateur', _count: { _all: 1 } }]);
    await service.updateCall('acc-owner', 'call-1', { seats: { dessinateur: 1 } });
    expect(prisma.projectCall.update).toHaveBeenCalled();
  });

  it('updates closesAt and enqueues a fresh versioned-key close-call job on a deadline change', async () => {
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await service.updateCall('acc-owner', 'call-1', { deadline });
    const data = prisma.projectCall.update.mock.calls[0][0].data;
    expect(data.closesAt).toBeInstanceOf(Date);
    expect(queue.enqueue).toHaveBeenCalledWith(
      'calls',
      'close-call',
      { callId: 'call-1' },
      expect.objectContaining({ idempotencyKey: `close-call-call-1-${new Date(deadline).getTime()}` }),
    );
  });

  it('does not enqueue a job when the deadline is untouched', async () => {
    await service.updateCall('acc-owner', 'call-1', { title: 'X' });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

// ── MC-7 round 3: owner delete (DELETE /calls/:id) ────────────────────────────
describe('CallsService.deleteCall', () => {
  let service: CallsService;
  let notifications: { create: jest.Mock };
  let prisma: {
    projectCall: { findUnique: jest.Mock; delete: jest.Mock };
    application: { count: jest.Mock };
  };

  beforeEach(() => {
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      projectCall: {
        findUnique: jest.fn().mockResolvedValue({ id: 'call-1', authorId: 'acc-owner' }),
        delete: jest.fn().mockResolvedValue({ id: 'call-1' }),
      },
      application: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, notifications as unknown as NotificationsService, noBlocks());
  });

  it('404s an unknown call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    await expect(service.deleteCall('acc-owner', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s a non-owner', async () => {
    await expect(service.deleteCall('someone-else', 'call-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.projectCall.delete).not.toHaveBeenCalled();
  });

  it('deletes the call for the owner (non-accepted applications cascade at the DB level)', async () => {
    await service.deleteCall('acc-owner', 'call-1');
    expect(prisma.projectCall.delete).toHaveBeenCalledWith({ where: { id: 'call-1' } });
  });

  it('409s when the call has an accepted application, leaving the call intact', async () => {
    prisma.application.count.mockResolvedValue(1);
    await expect(service.deleteCall('acc-owner', 'call-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.projectCall.delete).not.toHaveBeenCalled();
  });

  it('creates no notification on delete', async () => {
    await service.deleteCall('acc-owner', 'call-1');
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

// ── CS-1: seedFromProject (create-project wizard "Je recherche" → one Appel à projets) ──
describe('CallsService.seedFromProject', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { create: jest.Mock };
    account: { findUnique: jest.Mock; findMany: jest.Mock };
    profile: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      projectCall: { create: jest.fn().mockResolvedValue({ id: 'call-seed' }) },
      account: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Camille R.' }), findMany: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue({ creatorRoles: ['scenariste'] }) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService, noBlocks());
  });

  it('creates ONE open call: seats, derived seekingRoles, author snapshot, no deadline', async () => {
    await service.seedFromProject('acc-1', {
      projectId: 'proj-1',
      title: 'Lames de Brume',
      seats: { scenariste: 1, dessinateur: 2 },
      genres: ['seinen', 'action'],
      description: 'Un récit.',
    });
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      title: 'Lames de Brume',
      projectId: 'proj-1',
      authorId: 'acc-1',
      authorName: 'Camille R.',
      authorRoles: ['scenariste'],
      seekingRoles: ['scenariste', 'dessinateur'],
      seats: { scenariste: 1, dessinateur: 2 },
      genres: ['seinen', 'action'],
      description: 'Un récit.',
      status: 'open',
      closesAt: null,
    });
  });

  it('still lists sought roles when the owner has no creator roles (authorRoles empty)', async () => {
    prisma.profile.findUnique.mockResolvedValue({ creatorRoles: [] });
    await service.seedFromProject('acc-1', { projectId: 'p', title: 'X', seats: { dessinateur: 1 }, genres: [], description: '' });
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data.authorRoles).toEqual([]);
    expect(data.seekingRoles).toEqual(['dessinateur']);
  });
});
