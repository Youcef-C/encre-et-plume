import { RankingService } from './ranking.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RANKING_LIMIT, RANKING_ORDER_BY } from './ranking.util';

const WORK = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'work-1',
  slug: 'neon-sutra',
  title: 'Néon Sutra',
  coverImage: null,
  genre: 'Shōnen',
  meta: 'Léa B. × Hugo D. · 24 ch.',
  likeCount: 8100,
  ...overrides,
});

describe('RankingService', () => {
  let service: RankingService;
  let prisma: { work: { findMany: jest.Mock } };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = { work: { findMany: jest.fn() } };
    // Cache miss on every read so tests exercise the Prisma path deterministically (mirrors HomeService tests).
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    service = new RankingService(prisma as unknown as PrismaService, redis as unknown as RedisService);
  });

  it('orders by likeCount desc with id asc tiebreak, and passes take: limit', async () => {
    prisma.work.findMany.mockResolvedValue([WORK({ id: 'w1' }), WORK({ id: 'w2' })]);

    await service.getAllTime(undefined, RANKING_LIMIT);

    expect(prisma.work.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: RANKING_ORDER_BY,
      take: RANKING_LIMIT,
    });
  });

  it('with no genre, queries with an empty where clause', async () => {
    prisma.work.findMany.mockResolvedValue([]);

    await service.getAllTime(undefined, RANKING_LIMIT);

    expect(prisma.work.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('with genre "Seinen", queries with a genre-equality where clause', async () => {
    prisma.work.findMany.mockResolvedValue([]);

    await service.getAllTime('Seinen', RANKING_LIMIT);

    expect(prisma.work.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { genre: 'Seinen' } }));
  });

  it('returns an empty array for an unknown genre with no matches', async () => {
    prisma.work.findMany.mockResolvedValue([]);

    const result = await service.getAllTime('Inconnu', RANKING_LIMIT);

    expect(result).toEqual([]);
  });

  it('maps works to 1-based ranked rows, passing through cover: null', async () => {
    prisma.work.findMany.mockResolvedValue([WORK({ id: 'w1' }), WORK({ id: 'w2', slug: 'lames-de-brume', title: 'Lames de Brume' })]);

    const result = await service.getAllTime(undefined, RANKING_LIMIT);

    expect(result).toEqual([
      { id: 'w1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.' },
      { id: 'w2', slug: 'lames-de-brume', rank: 2, title: 'Lames de Brume', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.' },
    ]);
  });

  describe('caching (fail-open Redis, 60s TTL, keyed per genre)', () => {
    it('caches under "ranking:all-time:all" when no genre is given', async () => {
      prisma.work.findMany.mockResolvedValue([WORK({ id: 'w1' })]);

      await service.getAllTime(undefined, RANKING_LIMIT);

      expect(redis.get).toHaveBeenCalledWith('ranking:all-time:all');
      expect(redis.set).toHaveBeenCalledWith('ranking:all-time:all', expect.any(String), 'EX', 60);
    });

    it('caches under a genre-specific key when a genre is given', async () => {
      prisma.work.findMany.mockResolvedValue([]);

      await service.getAllTime('Seinen', RANKING_LIMIT);

      expect(redis.get).toHaveBeenCalledWith('ranking:all-time:Seinen');
    });

    it('returns the cached value and skips Prisma on a cache hit', async () => {
      const cached = [{ id: 'w1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'meta' }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getAllTime(undefined, RANKING_LIMIT);

      expect(result).toEqual(cached);
      expect(prisma.work.findMany).not.toHaveBeenCalled();
    });

    it('normalizes a whitespace-padded genre to the SAME cache key and the SAME where-filter as the trimmed genre', async () => {
      prisma.work.findMany.mockResolvedValue([]);

      await service.getAllTime('Seinen ', RANKING_LIMIT);

      // Same canonical key as the trimmed genre — must not poison `ranking:all-time:Seinen`
      // with a whitespace-caused empty result.
      expect(redis.get).toHaveBeenCalledWith('ranking:all-time:Seinen');
      expect(redis.set).toHaveBeenCalledWith('ranking:all-time:Seinen', expect.any(String), 'EX', 60);
      // Same where-filter as the trimmed genre — must not query with the raw trailing space.
      expect(prisma.work.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { genre: 'Seinen' } }));
    });

    it('treats a whitespace-only genre as no filter (empty-after-trim = "Tout")', async () => {
      prisma.work.findMany.mockResolvedValue([]);

      await service.getAllTime('   ', RANKING_LIMIT);

      expect(redis.get).toHaveBeenCalledWith('ranking:all-time:all');
      expect(prisma.work.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });
});
