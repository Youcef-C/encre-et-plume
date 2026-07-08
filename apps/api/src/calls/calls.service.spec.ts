import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CallsService, parseCallsLimit } from './calls.service';
import { PrismaService } from '../prisma/prisma.service';
import type { QueueService } from '../queue/queue.service';
import type { NotificationsService } from '../notifications/notifications.service';

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
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService);
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
  };

  beforeEach(() => {
    prisma = {
      projectCall: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      application: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService);
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
    prisma.application.findMany.mockResolvedValue([{ id: 'app-9', callId: 'call-1' }]);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(prisma.application.findMany).toHaveBeenCalledTimes(1);
    const applied = res.items.find((c) => c.id === 'call-1');
    const notApplied = res.items.find((c) => c.id === 'call-2');
    expect(applied?.myApplicationId).toBe('app-9');
    expect(applied?.hasApplied).toBe(true);
    expect(notApplied?.myApplicationId).toBeNull();
    expect(notApplied?.hasApplied).toBe(false);
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
    account: { findUnique: jest.Mock };
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
      account: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Camille R.' }) },
      profile: { findUnique: jest.fn().mockResolvedValue({ creatorRoles: ['scenariste'] }) },
      project: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'acc-1' }) },
      // interactive transaction: run the callback with the tx client (same mocked models)
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb({ projectCall, projectCallAsset })),
    };
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new CallsService(prisma as unknown as PrismaService, queue as unknown as QueueService, {} as unknown as NotificationsService);
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
  };

  beforeEach(() => {
    prisma = {
      projectCall: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...CALL_ROW(), ...data })),
      },
      projectCallAsset: { findMany: jest.fn().mockResolvedValue([]) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      profile: { findUnique: jest.fn().mockResolvedValue(null) },
      application: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService);
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
      expect.objectContaining({ where: { id: 'call-1' }, data: { status: 'closed' } }),
    );
    expect(card.status).toBe('closed');
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
    account: { findUnique: jest.Mock };
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
      account: { findUnique: jest.fn().mockResolvedValue(ref('acc-owner', 'Camille R.', 'scenariste')) },
      invitation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService);
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
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService, {} as unknown as NotificationsService);
  });

  it('closes the call when every seat is covered by accepted applications', async () => {
    prisma.application.groupBy.mockResolvedValue(accepted([{ appliedAs: 'dessinateur', n: 2 }]));
    const closed = await service.closeIfFilled('call-1');
    expect(closed).toBe(true);
    expect(prisma.projectCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', status: 'open' }, // status guard ⇒ idempotent + race-safe
      data: { status: 'closed' },
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
