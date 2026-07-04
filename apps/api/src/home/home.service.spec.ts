import { HomeService } from './home.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const WORK = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'work-1',
  slug: 'neon-sutra',
  title: 'Néon Sutra',
  coverImage: null,
  genre: 'Shōnen',
  meta: 'Léa B. × Hugo D. · 24 ch.',
  likeCount: 8100,
  weeklyLikeDelta: 620,
  priorWeekLikeDelta: 500,
  featuredRank: 0,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

describe('HomeService', () => {
  let service: HomeService;
  let prisma: {
    work: { findMany: jest.Mock };
    chapter: { findMany: jest.Mock };
    profile: { findMany: jest.Mock };
    announcement: { findMany: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = {
      work: { findMany: jest.fn() },
      chapter: { findMany: jest.fn() },
      profile: { findMany: jest.fn() },
      announcement: { findMany: jest.fn() },
    };
    // Cache miss on every read so tests exercise the Prisma path deterministically.
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    service = new HomeService(prisma as unknown as PrismaService, redis as unknown as RedisService);
  });

  describe('getFeatured', () => {
    it('orders by featuredRank ascending and maps to FeaturedWork', async () => {
      prisma.work.findMany.mockResolvedValue([WORK({ id: 'w1', featuredRank: 0 }), WORK({ id: 'w2', featuredRank: 1, slug: 'lames-de-brume', title: 'Lames de Brume' })]);

      const result = await service.getFeatured();

      expect(prisma.work.findMany).toHaveBeenCalledWith({
        where: { featuredRank: { not: null } },
        orderBy: { featuredRank: 'asc' },
      });
      expect(result).toEqual([
        { id: 'w1', slug: 'neon-sutra', title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.', genre: 'Shōnen', is18plus: false },
        { id: 'w2', slug: 'lames-de-brume', title: 'Lames de Brume', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.', genre: 'Shōnen', is18plus: false },
      ]);
    });

    it('DR-10: is18plus true when audienceRating is 18+', async () => {
      prisma.work.findMany.mockResolvedValue([WORK({ id: 'w1', audienceRating: '18+' })]);
      const result = await service.getFeatured();
      expect(result[0]?.is18plus).toBe(true);
    });
  });

  describe('getTrendingThisWeek', () => {
    it('queries with deterministic order (weeklyLikeDelta desc, id asc tiebreak) and take 4, assigns sequential rank', async () => {
      prisma.work.findMany.mockResolvedValue([
        WORK({ id: 'w1', weeklyLikeDelta: 620, priorWeekLikeDelta: 500, likeCount: 8100 }),
        WORK({ id: 'w2', weeklyLikeDelta: 590, priorWeekLikeDelta: 500, likeCount: 5700 }),
      ]);

      const result = await service.getTrendingThisWeek();

      expect(prisma.work.findMany).toHaveBeenCalledWith({
        orderBy: [{ weeklyLikeDelta: 'desc' }, { id: 'asc' }],
        take: 4,
      });
      expect(result[0]).toMatchObject({ id: 'w1', rank: 1, growthPct: 24 });
      expect(result[1]).toMatchObject({ id: 'w2', rank: 2, growthPct: 18 });
    });

    it('computes growth % as 100 when weekly>0 and prior=0, or 0 when both are 0', async () => {
      prisma.work.findMany.mockResolvedValue([
        WORK({ id: 'w1', weeklyLikeDelta: 50, priorWeekLikeDelta: 0 }),
        WORK({ id: 'w2', weeklyLikeDelta: 0, priorWeekLikeDelta: 0 }),
      ]);

      const result = await service.getTrendingThisWeek();

      expect(result[0].growthPct).toBe(100);
      expect(result[1].growthPct).toBe(0);
    });

    it('DR-10: is18plus true when audienceRating is 18+', async () => {
      prisma.work.findMany.mockResolvedValue([WORK({ id: 'w1', audienceRating: '18+' })]);
      const result = await service.getTrendingThisWeek();
      expect(result[0]?.is18plus).toBe(true);
    });
  });

  describe('getRankingAllTime', () => {
    it('orders by likeCount desc with id tiebreak, takes 8, assigns sequential rank', async () => {
      prisma.work.findMany.mockResolvedValue([WORK({ id: 'w1' }), WORK({ id: 'w2' })]);

      const result = await service.getRankingAllTime();

      expect(prisma.work.findMany).toHaveBeenCalledWith({
        orderBy: [{ likeCount: 'desc' }, { id: 'asc' }],
        take: 8,
      });
      expect(result).toEqual([
        { id: 'w1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.', is18plus: false },
        { id: 'w2', slug: 'neon-sutra', rank: 2, title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.', is18plus: false },
      ]);
    });
  });

  describe('getScheduledReleases', () => {
    it('filters to scheduled + future publishAt, orders ascending, takes 4', async () => {
      const chapter = {
        id: 'ch-1',
        workId: 'w1',
        number: 2,
        status: 'scheduled',
        publishAt: new Date('2026-07-10T18:00:00.000Z'),
        work: { slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen' },
      };
      prisma.chapter.findMany.mockResolvedValue([chapter]);

      const result = await service.getScheduledReleases();

      expect(prisma.chapter.findMany).toHaveBeenCalledWith({
        where: { status: 'scheduled', publishAt: { gt: expect.any(Date) } },
        orderBy: { publishAt: 'asc' },
        take: 4,
        include: { work: true },
      });
      expect(result).toEqual([
        {
          id: 'ch-1',
          workId: 'w1',
          workSlug: 'lames-de-brume',
          workTitle: 'Lames de Brume',
          chapterNumber: 2,
          genre: 'Seinen',
          releaseAt: '2026-07-10T18:00:00.000Z',
        },
      ]);
    });
  });

  describe('getTopCreators', () => {
    it('splits by role (dessinateur/scenariste), each ordered by trendingScore desc + id tiebreak, take 1', async () => {
      prisma.profile.findMany
        .mockResolvedValueOnce([{ accountId: 'acc-1', account: { id: 'acc-1', displayName: 'Yuki Moreau', profileSlug: 'yuki-moreau', avatar: null } }])
        .mockResolvedValueOnce([{ accountId: 'acc-2', account: { id: 'acc-2', displayName: 'Camille Roux', profileSlug: 'camille-roux', avatar: null } }]);

      const result = await service.getTopCreators();

      expect(prisma.profile.findMany).toHaveBeenNthCalledWith(1, {
        where: { creatorRoles: { has: 'dessinateur' } },
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: 1,
        include: { account: true },
      });
      expect(prisma.profile.findMany).toHaveBeenNthCalledWith(2, {
        where: { creatorRoles: { has: 'scenariste' } },
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: 1,
        include: { account: true },
      });
      expect(result).toEqual({
        artist: { id: 'acc-1', name: 'Yuki Moreau', slug: 'yuki-moreau', avatar: null, role: 'dessinateur' },
        scenarist: { id: 'acc-2', name: 'Camille Roux', slug: 'camille-roux', avatar: null, role: 'scenariste' },
      });
    });

    it('returns null for a role with no matching profile', async () => {
      prisma.profile.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.getTopCreators();

      expect(result).toEqual({ artist: null, scenarist: null });
    });
  });

  describe('getAnnouncements', () => {
    it('orders by order ascending and maps to Announcement', async () => {
      prisma.announcement.findMany.mockResolvedValue([{ id: 'a1', type: 'concours', label: 'Prix', href: '/concours', order: 0 }]);

      const result = await service.getAnnouncements();

      expect(prisma.announcement.findMany).toHaveBeenCalledWith({ orderBy: { order: 'asc' } });
      expect(result).toEqual([{ id: 'a1', type: 'concours', label: 'Prix', href: '/concours' }]);
    });
  });
});
