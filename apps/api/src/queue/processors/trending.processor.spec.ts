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
