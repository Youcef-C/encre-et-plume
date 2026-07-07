import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CallsService, parseCallsLimit } from './calls.service';
import { PrismaService } from '../prisma/prisma.service';
import type { QueueService } from '../queue/queue.service';

const CALL_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'call-1',
  title: '« Lames de Brume »',
  authorRole: 'scenariste',
  seekingRole: 'dessinateur',
  authorId: 'acc-owner',
  authorName: 'Camille R.',
  tags: ['Seinen', 'Thriller'],
  description: 'Un thriller urbain.',
  genres: ['seinen', 'thriller'],
  format: null,
  scope: '~120 planches',
  sampleMediaId: null,
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

describe('CallsService', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    media: { findMany: jest.Mock; findUnique: jest.Mock };
    account: { findUnique: jest.Mock };
  };
  let queue: { enqueue: jest.Mock };

  beforeEach(() => {
    prisma = {
      projectCall: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      media: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      account: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Camille R.' }) },
    };
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new CallsService(prisma as unknown as PrismaService, queue as unknown as QueueService);
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

  it('returns closesInDays null when closesAt is unset (falls back to applicationCount on FE)', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ closesAt: null })]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0].closesInDays).toBeNull();
    expect(res.items[0].applicationCount).toBe(5);
  });

  it('computes closesInDays as whole days until closesAt (ceil)', async () => {
    const closesAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000 - 1000); // just under 12 days → ceil 12
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ closesAt })]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0].closesInDays).toBe(12);
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
    media: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      projectCall: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      media: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService);
  });

  it('filters by role (seekingRole = direction sought)', async () => {
    await service.findBoard({ role: 'dessinateur', status: 'all' }, 'viewer');
    expect(prisma.projectCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ seekingRole: 'dessinateur' }) }),
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
    // open requires closesAt null OR in the future
    expect(where.OR).toEqual([{ closesAt: null }, { closesAt: { gt: expect.any(Date) } }]);
  });

  it('status=closed includes stored-closed OR past-deadline rows', async () => {
    await service.findBoard({ status: 'closed' }, 'viewer');
    const where = prisma.projectCall.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ status: 'closed' }, { closesAt: { lte: expect.any(Date) } }]);
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

  it('derives status=closed on a row whose deadline has passed', async () => {
    const closesAt = new Date(Date.now() - 1000);
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ closesAt })]);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items[0].status).toBe('closed');
  });

  it('isOwner false for a non-owning viewer', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW()]);
    const res = await service.findBoard({ status: 'all' }, 'someone-else');
    expect(res.items[0].isOwner).toBe(false);
  });

  it('emits the dessinateur-author heading without the ·RICE suffix', async () => {
    prisma.projectCall.findMany.mockResolvedValue([
      CALL_ROW({ authorRole: 'dessinateur', seekingRole: 'scenariste' }),
    ]);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items[0].heading).toBe('DESSINATEUR CHERCHE SCÉNARISTE');
    expect(res.items[0].direction).toBe('illustratorSeeksWriter');
  });

  it('resolves sampleUrl from a ready sample Media thumb', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ sampleMediaId: 'med-1' })]);
    prisma.media.findMany.mockResolvedValue([
      { id: 'med-1', status: 'ready', variants: { thumb: 'https://cdn/thumb.webp' } },
    ]);
    const res = await service.findBoard({ status: 'all' }, 'viewer');
    expect(res.items[0].sampleUrl).toBe('https://cdn/thumb.webp');
  });
});

describe('CallsService.createCall', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { create: jest.Mock };
    media: { findUnique: jest.Mock };
    account: { findUnique: jest.Mock };
  };
  let queue: { enqueue: jest.Mock };

  const FUTURE = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    prisma = {
      projectCall: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'call-new',
          ...data,
          applicationCount: 0,
          createdAt: new Date(),
        })),
      },
      media: { findUnique: jest.fn() },
      account: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Camille R.' }) },
    };
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new CallsService(prisma as unknown as PrismaService, queue as unknown as QueueService);
  });

  const DTO = (o: Partial<Record<string, unknown>> = {}) => ({
    direction: 'writerSeeksIllustrator',
    title: '« Lames de Brume »',
    description: 'Un thriller urbain.',
    genres: ['seinen', 'thriller'],
    scope: '~120 planches',
    deadline: FUTURE,
    ...o,
  });

  it('maps direction → authorRole/seekingRole and denormalizes authorName from the session account', async () => {
    await service.createCall('acc-1', DTO() as never);
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      authorId: 'acc-1',
      authorRole: 'scenariste',
      seekingRole: 'dessinateur',
      authorName: 'Camille R.',
    });
  });

  it('composes tags from genre fr labels + scope', async () => {
    await service.createCall('acc-1', DTO() as never);
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data.tags).toEqual(['Seinen', 'Thriller', '~120 planches']);
  });

  it('composes tags with the format label when no scope', async () => {
    await service.createCall('acc-1', DTO({ scope: undefined, format: 'one_shot', genres: ['supernatural'] }) as never);
    const data = prisma.projectCall.create.mock.calls[0][0].data;
    expect(data.tags).toEqual(['Fantastique', 'One-shot']);
  });

  it('enqueues a delayed close-call job keyed by call id', async () => {
    await service.createCall('acc-1', DTO() as never);
    expect(queue.enqueue).toHaveBeenCalledWith(
      'calls',
      'close-call',
      { callId: 'call-new' },
      expect.objectContaining({ idempotencyKey: 'close-call-call-new', delayMs: expect.any(Number) }),
    );
    expect(queue.enqueue.mock.calls[0][3].delayMs).toBeGreaterThan(0);
  });

  it('uses a BullMQ-safe idempotency key (hyphens only — a colon makes q.add throw)', async () => {
    await service.createCall('acc-1', DTO() as never);
    const key = queue.enqueue.mock.calls[0][3].idempotencyKey as string;
    expect(key).not.toContain(':'); // BullMQ: "Custom Id cannot contain :"
    expect(key).toMatch(/^close-call-[\w-]+$/);
  });

  it('returns a CallCard with isOwner true and derived open status', async () => {
    const card = await service.createCall('acc-1', DTO() as never);
    expect(card).toMatchObject({ isOwner: true, status: 'open', direction: 'writerSeeksIllustrator' });
  });

  it('rejects a sampleMediaId not owned by the caller', async () => {
    prisma.media.findUnique.mockResolvedValue({ ownerId: 'other', status: 'ready', kind: 'call_sample' });
    await expect(service.createCall('acc-1', DTO({ sampleMediaId: 'med-x' }) as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a sampleMediaId that is not ready', async () => {
    prisma.media.findUnique.mockResolvedValue({ ownerId: 'acc-1', status: 'pending', kind: 'call_sample' });
    await expect(service.createCall('acc-1', DTO({ sampleMediaId: 'med-x' }) as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a sampleMediaId of the wrong kind', async () => {
    prisma.media.findUnique.mockResolvedValue({ ownerId: 'acc-1', status: 'ready', kind: 'avatar' });
    await expect(service.createCall('acc-1', DTO({ sampleMediaId: 'med-x' }) as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CallsService.closeEarly', () => {
  let service: CallsService;
  let prisma: { projectCall: { findUnique: jest.Mock; update: jest.Mock }; media: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      projectCall: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...CALL_ROW(), ...data })),
      },
      media: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new CallsService(prisma as unknown as PrismaService, {} as unknown as QueueService);
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
