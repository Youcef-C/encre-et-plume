import { TrendingProcessor } from './trending.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { Job } from 'bullmq';

type Grouped = { workId?: string; targetId?: string; _count: { _all: number } };

function makePrisma(overrides: {
  favCur?: Grouped[];
  favPrior?: Grouped[];
  illCur?: Grouped[];
  readCur?: Grouped[];
  creators?: { workId: string; accountId: string }[];
  artists?: { id: string; artistId: string | null }[];
} = {}) {
  const favorite = {
    groupBy: jest
      .fn()
      .mockResolvedValueOnce(overrides.favCur ?? [])
      .mockResolvedValueOnce(overrides.favPrior ?? []),
  };
  return {
    favorite,
    reaction: { groupBy: jest.fn().mockResolvedValue(overrides.illCur ?? []) },
    readingProgress: { groupBy: jest.fn().mockResolvedValue(overrides.readCur ?? []) },
    workCreator: { findMany: jest.fn().mockResolvedValue(overrides.creators ?? []) },
    work: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    illustration: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(overrides.artists ?? []),
    },
    profile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

const JOB = { name: 'recompute-trending' } as Job;

function build(prisma: ReturnType<typeof makePrisma>) {
  const redis = { delByPattern: jest.fn().mockResolvedValue(undefined) };
  const processor = new TrendingProcessor(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
  );
  return { processor, redis };
}

describe('TrendingProcessor', () => {
  it('targets the analytics queue', () => {
    const { processor } = build(makePrisma());
    expect(processor.queue).toBe('analytics');
  });

  it('B2/B3 · counts favorites over the 0→7d and 8→14d windows', async () => {
    const prisma = makePrisma();
    const { processor } = build(prisma);

    await processor.process({}, JOB);

    const [cur] = prisma.favorite.groupBy.mock.calls[0] as [
      { by: string[]; where: { createdAt: { gte: Date } } },
    ];
    const [prior] = prisma.favorite.groupBy.mock.calls[1] as [
      { by: string[]; where: { createdAt: { gte: Date; lt: Date } } },
    ];
    expect(cur.by).toEqual(['workId']);
    expect(prior.by).toEqual(['workId']);

    const spanDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5);
    expect(spanDays(cur.where.createdAt.gte, new Date())).toBe(7);
    expect(spanDays(prior.where.createdAt.gte, new Date())).toBe(14);
    // the prior window ends where the current one starts — the two never double-count
    expect(prior.where.createdAt.lt.getTime()).toBe(cur.where.createdAt.gte.getTime());
  });

  it('B2/B3 · resets every non-zero work BEFORE writing the fresh counts', async () => {
    const prisma = makePrisma({
      favCur: [{ workId: 'w1', _count: { _all: 4 } }],
      favPrior: [{ workId: 'w1', _count: { _all: 2 } }, { workId: 'w2', _count: { _all: 9 } }],
    });
    const { processor } = build(prisma);

    await processor.process({}, JOB);

    expect(prisma.work.updateMany.mock.calls[0][0]).toEqual({
      where: { OR: [{ weeklyLikeDelta: { not: 0 } }, { priorWeekLikeDelta: { not: 0 } }] },
      data: { weeklyLikeDelta: 0, priorWeekLikeDelta: 0 },
    });
    expect(prisma.work.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { weeklyLikeDelta: 4, priorWeekLikeDelta: 2 },
    });
    // w2 only has prior-week likes: it must still be written (0 current), not skipped
    expect(prisma.work.updateMany).toHaveBeenCalledWith({
      where: { id: 'w2' },
      data: { weeklyLikeDelta: 0, priorWeekLikeDelta: 9 },
    });
    expect(prisma.work.updateMany).toHaveBeenCalledTimes(3);
  });

  it('B4 · counts only illustration likes, and resets before writing', async () => {
    const prisma = makePrisma({ illCur: [{ targetId: 'i1', _count: { _all: 6 } }] });
    const { processor } = build(prisma);

    await processor.process({}, JOB);

    const [args] = prisma.reaction.groupBy.mock.calls[0] as [
      { by: string[]; where: { targetType: string; kind: string; createdAt: { gte: Date } } },
    ];
    expect(args.by).toEqual(['targetId']);
    expect(args.where.targetType).toBe('illustration');
    expect(args.where.kind).toBe('like');
    expect(Math.round((new Date().getTime() - args.where.createdAt.gte.getTime()) / 864e5)).toBe(7);

    expect(prisma.illustration.updateMany.mock.calls[0][0]).toEqual({
      where: { weeklyLikeDelta: { not: 0 } },
      data: { weeklyLikeDelta: 0 },
    });
    expect(prisma.illustration.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { weeklyLikeDelta: 6 },
    });
  });

  it('B5 · scores a creator as reads7d + 3 × likes7d across their works and illustrations', async () => {
    const prisma = makePrisma({
      favCur: [{ workId: 'w1', _count: { _all: 3 } }],
      readCur: [{ workId: 'w1', _count: { _all: 5 } }],
      illCur: [{ targetId: 'i1', _count: { _all: 2 } }],
      creators: [{ workId: 'w1', accountId: 'acc-1' }],
      artists: [{ id: 'i1', artistId: 'acc-1' }],
    });
    const { processor } = build(prisma);

    await processor.process({}, JOB);

    // 5 reads + 3×(3 work likes + 2 illustration likes) = 20
    expect(prisma.profile.updateMany.mock.calls[0][0]).toEqual({
      where: { trendingScore: { not: 0 } },
      data: { trendingScore: 0 },
    });
    expect(prisma.profile.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      data: { trendingScore: 20 },
    });
    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(2);
  });

  it('B5 · skips an illustration with no artist account (artistId is nullable)', async () => {
    const prisma = makePrisma({
      illCur: [{ targetId: 'i1', _count: { _all: 2 } }],
      artists: [{ id: 'i1', artistId: null }],
    });
    const { processor } = build(prisma);

    await processor.process({}, JOB);

    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1); // reset only
  });

  it('D-2 · invalidates the five 60s read caches that order by these columns', async () => {
    const { processor, redis } = build(makePrisma());

    await processor.process({}, JOB);

    expect(redis.delByPattern.mock.calls.flat()).toEqual([
      'home:*',
      'catalog:list:*',
      'gallery:list:*',
      'collections:list:*',
      'ranking:*',
    ]);
  });

  it('ignores an unknown job name on the shared analytics queue', async () => {
    const prisma = makePrisma();
    const { processor } = build(prisma);

    await processor.process({}, { name: 'something-else' } as Job);

    expect(prisma.favorite.groupBy).not.toHaveBeenCalled();
    expect(prisma.work.updateMany).not.toHaveBeenCalled();
  });
});

// ── F-23: two more job names on the same analytics queue ─────────────────────

function buildFlush(buffer: string[]) {
  const calls: string[] = [];
  const prisma = {
    event: {
      createMany: jest.fn(async (args: { data: unknown[] }) => {
        calls.push('createMany');
        return { count: args.data.length };
      }),
    },
  };
  const redis = {
    lpopCount: jest.fn(async (_k: string, count: number) => {
      calls.push('lpopCount');
      return buffer.splice(0, count);
    }),
    delByPattern: jest.fn(),
  };
  const processor = new TrendingProcessor(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
  );
  return { processor, prisma, redis, calls };
}

function bufferedVisit(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    kind: 'visit',
    at: '2026-08-25T12:00:00.000Z',
    visitorId: '00000000-0000-8000-8000-000000000001',
    accountId: null,
    targetType: null,
    targetId: null,
    path: '/',
    ref: null,
    ...overrides,
  });
}

const FLUSH_JOB = { name: 'flush-events' } as Job;

describe('TrendingProcessor — flush-events (F-23 B8)', () => {
  it('pops the batch from Redis BEFORE touching Prisma — no LPOP inside the DB call', async () => {
    const { processor, calls } = buildFlush([bufferedVisit(), bufferedVisit()]);

    await processor.process({}, FLUSH_JOB);

    expect(calls).toEqual(['lpopCount', 'createMany']);
  });

  it('writes a 1000-row batch with exactly ONE createMany', async () => {
    const { processor, prisma, redis } = buildFlush(
      Array.from({ length: 1000 }, () => bufferedVisit()),
    );

    await processor.process({}, FLUSH_JOB);

    expect(redis.lpopCount).toHaveBeenCalledWith('analytics:buffer', 1000);
    expect(prisma.event.createMany).toHaveBeenCalledTimes(1);
    expect((prisma.event.createMany.mock.calls[0][0] as { data: unknown[] }).data).toHaveLength(1000);
  });

  it('does no DB call at all on an empty buffer', async () => {
    const { processor, prisma } = buildFlush([]);

    await processor.process({}, FLUSH_JOB);

    expect(prisma.event.createMany).not.toHaveBeenCalled();
  });

  it('D-5 · keeps the server-stamped `at` as a Date, never a client string', async () => {
    const { processor, prisma } = buildFlush([bufferedVisit({ at: '2026-08-25T12:00:00.000Z' })]);

    await processor.process({}, FLUSH_JOB);

    const [row] = (prisma.event.createMany.mock.calls[0][0] as { data: { at: Date }[] }).data;
    expect(row.at).toBeInstanceOf(Date);
    expect(row.at.toISOString()).toBe('2026-08-25T12:00:00.000Z');
  });

  it('drops a corrupt buffer entry instead of losing the whole batch', async () => {
    const { processor, prisma } = buildFlush(['not json', bufferedVisit(), '{"kind":"nonsense"}']);

    await processor.process({}, FLUSH_JOB);

    expect((prisma.event.createMany.mock.calls[0][0] as { data: unknown[] }).data).toHaveLength(1);
  });

  it('never stores an IP — only the columns the model declares', async () => {
    const { processor, prisma } = buildFlush([bufferedVisit({ ip: '203.0.113.7' } as never)]);

    await processor.process({}, FLUSH_JOB);

    const [row] = (prisma.event.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] }).data;
    expect(Object.keys(row).sort()).toEqual(
      ['accountId', 'at', 'kind', 'path', 'ref', 'targetId', 'targetType', 'visitorId'].sort(),
    );
  });
});

const ROLLUP_JOB = { name: 'rollup-daily' } as Job;

type Upsert = { where: { day_metric_dim: { day: Date; metric: string; dim: string } }; create: { value: number } };

function buildRollup(
  o: {
    byKind?: { kind: string; _count: { _all: number } }[];
    visitors?: { visitorId: string | null }[];
    readsByWork?: { targetId: string | null; _count: { _all: number } }[];
    visitsByRef?: { ref: string | null; _count: { _all: number } }[];
    alreadyRolledUp?: boolean;
    works?: { publishedAt: Date | null }[];
    chapters?: { createdAt: Date }[];
    illustrations?: { publishedAt: Date | null }[];
    reviews?: { createdAt: Date }[];
    accounts?: { createdAt: Date }[];
  } = {},
) {
  const upserts: Upsert[] = [];
  const prisma = {
    event: {
      groupBy: jest.fn(async (args: { by: string[]; where?: unknown }) => {
        if (args.by[0] === 'kind') return o.byKind ?? [];
        if (args.by[0] === 'visitorId') return o.visitors ?? [];
        if (args.by[0] === 'targetId') return o.readsByWork ?? [];
        return o.visitsByRef ?? [];
      }),
    },
    dailyStat: {
      findFirst: jest.fn(async (_a: unknown) => (o.alreadyRolledUp ? { day: new Date(), metric: 'works', dim: '', value: 1 } : null)),
      upsert: jest.fn(async (args: Upsert) => {
        upserts.push(args);
        return args.create;
      }),
    },
    work: { findMany: jest.fn(async (_a: unknown) => o.works ?? []) },
    chapter: { findMany: jest.fn(async (_a: unknown) => o.chapters ?? []) },
    illustration: { findMany: jest.fn(async (_a: unknown) => o.illustrations ?? []) },
    review: { findMany: jest.fn(async (_a: unknown) => o.reviews ?? []) },
    account: { findMany: jest.fn(async (_a: unknown) => o.accounts ?? []) },
  };
  const processor = new TrendingProcessor(
    prisma as unknown as PrismaService,
    { delByPattern: jest.fn() } as unknown as RedisService,
  );
  return { processor, prisma, upserts };
}

/** All (metric, dim) → value pairs the rollup wrote. */
function written(upserts: Upsert[]) {
  return upserts.map((u) => ({
    day: u.where.day_metric_dim.day.toISOString().slice(0, 10),
    metric: u.where.day_metric_dim.metric,
    dim: u.where.day_metric_dim.dim,
    value: u.create.value,
  }));
}

describe('TrendingProcessor — rollup-daily (F-23 B13)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T03:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('rolls up yesterday, not today', async () => {
    const { processor, prisma } = buildRollup({ byKind: [{ kind: 'visit', _count: { _all: 4 } }] });

    await processor.process({}, ROLLUP_JOB);

    const where = (prisma.event.groupBy.mock.calls[0][0] as unknown as { where: { at: { gte: Date; lt: Date } } }).where;
    expect(where.at.gte.toISOString()).toBe('2026-08-25T00:00:00.000Z');
    expect(where.at.lt.toISOString()).toBe('2026-08-26T00:00:00.000Z');
  });

  it('writes the four event metrics as platform totals (dim = "")', async () => {
    const { processor, upserts } = buildRollup({
      byKind: [
        { kind: 'visit', _count: { _all: 9 } },
        { kind: 'read', _count: { _all: 4 } },
        { kind: 'signup', _count: { _all: 2 } },
      ],
      visitors: [{ visitorId: 'a' }, { visitorId: 'b' }, { visitorId: null }],
    });

    await processor.process({}, ROLLUP_JOB);

    const rows = written(upserts);
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'visits', dim: '', value: 9 });
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'reads', dim: '', value: 4 });
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'signups', dim: '', value: 2 });
    // null visitorId (Redis was down) is not a unique visitor
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'uniques', dim: '', value: 2 });
  });

  it('B5 · never stores a rate — conversion is two series, divided at read time', async () => {
    const { processor, upserts } = buildRollup({
      byKind: [
        { kind: 'visit', _count: { _all: 100 } },
        { kind: 'signup', _count: { _all: 5 } },
      ],
      visitors: [{ visitorId: 'a' }],
    });

    await processor.process({}, ROLLUP_JOB);

    const metrics = written(upserts).map((r) => r.metric);
    expect(metrics).not.toContain('conversion');
    expect(written(upserts).every((r) => Number.isInteger(r.value))).toBe(true);
  });

  it('PE-5 · writes per-work reads under dim = workId', async () => {
    const { processor, upserts } = buildRollup({
      byKind: [{ kind: 'read', _count: { _all: 5 } }],
      readsByWork: [
        { targetId: 'work-1', _count: { _all: 3 } },
        { targetId: 'work-2', _count: { _all: 2 } },
      ],
    });

    await processor.process({}, ROLLUP_JOB);

    expect(written(upserts)).toContainEqual({ day: '2026-08-25', metric: 'reads', dim: 'work-1', value: 3 });
    expect(written(upserts)).toContainEqual({ day: '2026-08-25', metric: 'reads', dim: 'work-2', value: 2 });
  });

  it('writes visits per referrer host under dim = host', async () => {
    const { processor, upserts } = buildRollup({
      byKind: [{ kind: 'visit', _count: { _all: 3 } }],
      visitsByRef: [
        { ref: 'www.google.com', _count: { _all: 2 } },
        { ref: null, _count: { _all: 1 } }, // direct — no dim row
      ],
    });

    await processor.process({}, ROLLUP_JOB);

    expect(written(upserts)).toContainEqual({
      day: '2026-08-25',
      metric: 'visits',
      dim: 'www.google.com',
      value: 2,
    });
  });

  it('backfills every past day from the business tables on the first run', async () => {
    const { processor, prisma, upserts } = buildRollup({
      works: [
        { publishedAt: new Date('2024-03-02T09:00:00.000Z') },
        { publishedAt: new Date('2024-03-02T21:00:00.000Z') },
        { publishedAt: new Date('2026-08-25T10:00:00.000Z') },
      ],
    });

    await processor.process({}, ROLLUP_JOB);

    // No `gte` on the first run — the whole history is scanned once.
    const where = (prisma.work.findMany.mock.calls[0][0] as unknown as { where: { publishedAt: Record<string, unknown> } }).where;
    expect(where.publishedAt).not.toHaveProperty('gte');

    expect(written(upserts)).toContainEqual({ day: '2024-03-02', metric: 'works', dim: '', value: 2 });
    expect(written(upserts)).toContainEqual({ day: '2026-08-25', metric: 'works', dim: '', value: 1 });
  });

  it('scans only yesterday once the backfill has already run', async () => {
    const { processor, prisma } = buildRollup({ alreadyRolledUp: true });

    await processor.process({}, ROLLUP_JOB);

    const where = (prisma.work.findMany.mock.calls[0][0] as unknown as { where: { publishedAt: { gte: Date } } }).where;
    expect(where.publishedAt.gte.toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });

  it('counts all five business tables', async () => {
    const day = new Date('2026-08-25T12:00:00.000Z');
    const { processor, upserts } = buildRollup({
      works: [{ publishedAt: day }],
      chapters: [{ createdAt: day }, { createdAt: day }],
      illustrations: [{ publishedAt: day }],
      reviews: [{ createdAt: day }],
      accounts: [{ createdAt: day }, { createdAt: day }, { createdAt: day }],
    });

    await processor.process({}, ROLLUP_JOB);

    const rows = written(upserts);
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'works', dim: '', value: 1 });
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'chapters', dim: '', value: 2 });
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'illustrations', dim: '', value: 1 });
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'reviews', dim: '', value: 1 });
    expect(rows).toContainEqual({ day: '2026-08-25', metric: 'accounts', dim: '', value: 3 });
  });

  it('is idempotent — a second run upserts the same values, never doubles them', async () => {
    const seed = {
      byKind: [{ kind: 'visit', _count: { _all: 9 } }],
      works: [{ publishedAt: new Date('2026-08-25T10:00:00.000Z') }],
    };
    const first = buildRollup(seed);
    await first.processor.process({}, ROLLUP_JOB);
    const second = buildRollup({ ...seed, alreadyRolledUp: true });
    await second.processor.process({}, ROLLUP_JOB);

    const a = written(first.upserts).find((r) => r.metric === 'visits');
    const b = written(second.upserts).find((r) => r.metric === 'visits');
    expect(b).toEqual(a);
    // The upsert's update branch must SET the value, not increment it.
    const update = (second.upserts[0] as unknown as { update: { value: number } }).update;
    expect(update.value).toBe(9);
  });
});
