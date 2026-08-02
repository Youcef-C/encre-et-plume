import type { CatalogQuery } from '@encre-et-plume/shared';
import { CATALOG_PAGE_SIZE, GENRES } from '@encre-et-plume/shared';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const MATURE_FR = GENRES.filter((g) => g.mature).map((g) => g.fr);

const WORK_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  coverImage: null,
  genre: 'Seinen',
  meta: 'Camille R. × Yuki M. · 20 ch.',
  likeCount: 3400,
  weeklyLikeDelta: 545,
  priorWeekLikeDelta: 500,
  featuredRank: 1,
  createdAt: new Date('2026-01-01'),
  themes: ['Action'],
  format: 'Manga',
  language: 'Français',
  audienceRating: 'Tous publics',
  complete: true,
  chapterCount: 12,
  ratingAvg: 4.2,
  publishedAt: new Date('2026-06-01'),
  ...overrides,
});

// The `q` facet must still find a work by its AUTHOR's name. That used to work only because the
// author was baked into the dropped `Work.meta` string — it now matches through the WorkCreator
// relation, and this is the shape that keeps the capability from disappearing silently.
const CREATOR_NAME_MATCH = (q: string) => ({
  creators: { some: { account: { displayName: { contains: q, mode: 'insensitive' } } } },
});

const EMPTY_QUERY: CatalogQuery = {
  genre: [],
  format: [],
  public: [],
  langue: [],
  tri: 'populaires',
  page: 1,
};

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: {
    work: { findMany: jest.Mock; count: jest.Mock };
    contest: { findMany: jest.Mock };
    editorPick: { findMany: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = {
      work: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      contest: { findMany: jest.fn().mockResolvedValue([]) },
      editorPick: { findMany: jest.fn().mockResolvedValue([]) },
    };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    service = new CatalogService(prisma as unknown as PrismaService, redis as unknown as RedisService);
  });

  it('only returns published works (publishedAt not null)', async () => {
    await service.findWorks(EMPTY_QUERY);

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.publishedAt).toEqual({ not: null });
  });

  it('genre facet: maps ids to fr labels, matches a work via genre OR themes (round-2 rule)', async () => {
    await service.findWorks({ ...EMPTY_QUERY, genre: ['seinen', 'shonen'] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ genre: { in: ['Seinen', 'Shōnen'] } }, { themes: { hasSome: ['Seinen', 'Shōnen'] } }] }]);
  });

  it('genre facet: a work matches via its themes even when its genre column differs', async () => {
    // 'adventure' -> fr 'Aventure'; WORK_ROW's genre is 'Seinen' but themes includes 'Action' —
    // override themes to 'Aventure' to simulate a genre-via-theme match, and confirm it flows through.
    prisma.work.findMany.mockResolvedValue([WORK_ROW({ genre: 'Seinen', themes: ['Aventure'] })]);

    const result = await service.findWorks({ ...EMPTY_QUERY, genre: ['adventure'] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ genre: { in: ['Aventure'] } }, { themes: { hasSome: ['Aventure'] } }] }]);
    expect(result.items).toHaveLength(1);
  });

  it('format facet: OR-in', async () => {
    await service.findWorks({ ...EMPTY_QUERY, format: ['Manga', 'Roman'] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.format).toEqual({ in: ['Manga', 'Roman'] });
  });

  it('langue facet: OR-in', async () => {
    await service.findWorks({ ...EMPTY_QUERY, langue: ['Français', 'English'] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.language).toEqual({ in: ['Français', 'English'] });
  });

  it('public=[] (empty/default "Tous public"): no filter applied', async () => {
    await service.findWorks({ ...EMPTY_QUERY, public: [] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.audienceRating).toBeUndefined();
    expect(where.AND).toBeUndefined();
  });

  it('public=[18plus] only: scalar filter on audienceRating', async () => {
    await service.findWorks({ ...EMPTY_QUERY, public: ['18plus'] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.audienceRating).toBe('18+');
    expect(where.AND).toBeUndefined();
  });

  it('public=[mature] only: OR group over genre/themes for vocabulary entries with mature:true', async () => {
    await service.findWorks({ ...EMPTY_QUERY, public: ['mature'] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ genre: { in: MATURE_FR } }, { themes: { hasSome: MATURE_FR } }] }]);
  });

  it('public=[mature,18plus] both selected (round-2b): single OR-group combining mature genre/themes OR audienceRating 18+', async () => {
    await service.findWorks({ ...EMPTY_QUERY, public: ['mature', '18plus'] });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.audienceRating).toBeUndefined(); // not a scalar filter when combined with mature
    expect(where.AND).toEqual([{ OR: [{ genre: { in: MATURE_FR } }, { themes: { hasSome: MATURE_FR } }, { audienceRating: '18+' }] }]);
  });

  it('combines genre + format + public=[mature] + q with AND (each OR-group nested inside a top-level AND)', async () => {
    await service.findWorks({ ...EMPTY_QUERY, genre: ['seinen'], format: ['Manga'], public: ['mature'], q: 'brume' });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.format).toEqual({ in: ['Manga'] });
    expect(where.AND).toEqual([
      { OR: [{ genre: { in: ['Seinen'] } }, { themes: { hasSome: ['Seinen'] } }] },
      { OR: [{ genre: { in: MATURE_FR } }, { themes: { hasSome: MATURE_FR } }] },
      { OR: [{ title: { contains: 'brume', mode: 'insensitive' } }, CREATOR_NAME_MATCH('brume')] },
    ]);
  });

  it('statut=complete -> complete: true', async () => {
    await service.findWorks({ ...EMPTY_QUERY, statut: 'complete' });
    expect(prisma.work.findMany.mock.calls[0][0].where.complete).toBe(true);
  });

  it('statut=en-cours -> complete: false', async () => {
    await service.findWorks({ ...EMPTY_QUERY, statut: 'en-cours' });
    expect(prisma.work.findMany.mock.calls[0][0].where.complete).toBe(false);
  });

  it('longueur=oneshot -> chapterCount equals 1', async () => {
    await service.findWorks({ ...EMPTY_QUERY, longueur: 'oneshot' });
    expect(prisma.work.findMany.mock.calls[0][0].where.chapterCount).toEqual({ equals: 1 });
  });

  it('longueur=court -> chapterCount 2-15', async () => {
    await service.findWorks({ ...EMPTY_QUERY, longueur: 'court' });
    expect(prisma.work.findMany.mock.calls[0][0].where.chapterCount).toEqual({ gte: 2, lte: 15 });
  });

  it('longueur=long -> chapterCount >= 16', async () => {
    await service.findWorks({ ...EMPTY_QUERY, longueur: 'long' });
    expect(prisma.work.findMany.mock.calls[0][0].where.chapterCount).toEqual({ gte: 16 });
  });

  it('q alone -> single OR-group (title/meta contains, case-insensitive) nested in AND', async () => {
    await service.findWorks({ ...EMPTY_QUERY, q: 'brume' });

    const where = prisma.work.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: [{ title: { contains: 'brume', mode: 'insensitive' } }, CREATOR_NAME_MATCH('brume')] },
    ]);
  });

  it('tri=populaires -> orderBy likeCount desc, id asc', async () => {
    await service.findWorks({ ...EMPTY_QUERY, tri: 'populaires' });
    expect(prisma.work.findMany.mock.calls[0][0].orderBy).toEqual([{ likeCount: 'desc' }, { id: 'asc' }]);
  });

  it('tri=nouveautes -> orderBy publishedAt desc, id asc', async () => {
    await service.findWorks({ ...EMPTY_QUERY, tri: 'nouveautes' });
    expect(prisma.work.findMany.mock.calls[0][0].orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'asc' }]);
  });

  it('tri=mieux-notees -> orderBy ratingAvg desc, id asc', async () => {
    await service.findWorks({ ...EMPTY_QUERY, tri: 'mieux-notees' });
    expect(prisma.work.findMany.mock.calls[0][0].orderBy).toEqual([{ ratingAvg: 'desc' }, { id: 'asc' }]);
  });

  it('paginates: skip/take from page, and counts total with the same where', async () => {
    prisma.work.count.mockResolvedValue(25);

    await service.findWorks({ ...EMPTY_QUERY, page: 3, genre: ['seinen'] });

    const findManyArgs = prisma.work.findMany.mock.calls[0][0];
    expect(findManyArgs.skip).toBe((3 - 1) * CATALOG_PAGE_SIZE);
    expect(findManyArgs.take).toBe(CATALOG_PAGE_SIZE);

    const countArgs = prisma.work.count.mock.calls[0][0];
    expect(countArgs.where).toEqual(findManyArgs.where);
  });

  it('returns total/page/pageSize/totalPages from the count', async () => {
    prisma.work.count.mockResolvedValue(25);

    const result = await service.findWorks({ ...EMPTY_QUERY, page: 2 });

    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(CATALOG_PAGE_SIZE);
    expect(result.totalPages).toBe(Math.ceil(25 / CATALOG_PAGE_SIZE));
  });

  it('maps rows to CatalogWorkCard', async () => {
    prisma.work.findMany.mockResolvedValue([WORK_ROW()]);
    prisma.work.count.mockResolvedValue(1);

    const result = await service.findWorks(EMPTY_QUERY);

    expect(result.items).toEqual([
      {
        id: 'w1',
        slug: 'lames-de-brume',
        title: 'Lames de Brume',
        genre: 'Seinen',
        chapterCount: 12,
        likeCount: 3400,
        complete: true,
        format: 'Manga',
        cover: null,
        is18plus: false,
      },
    ]);
  });

  it('DR-10: maps is18plus true when audienceRating is 18+', async () => {
    prisma.work.findMany.mockResolvedValue([WORK_ROW({ audienceRating: '18+' })]);
    prisma.work.count.mockResolvedValue(1);

    const result = await service.findWorks(EMPTY_QUERY);

    expect(result.items[0]?.is18plus).toBe(true);
  });

  describe('getTrending', () => {
    it('orders by weeklyLikeDelta desc, id asc tiebreak, take 3, assigns sequential rank', async () => {
      prisma.work.findMany.mockResolvedValue([
        WORK_ROW({ id: 'w1', weeklyLikeDelta: 620, priorWeekLikeDelta: 500 }),
        WORK_ROW({ id: 'w2', weeklyLikeDelta: 590, priorWeekLikeDelta: 500 }),
        WORK_ROW({ id: 'w3', weeklyLikeDelta: 560, priorWeekLikeDelta: 500 }),
      ]);

      const result = await service.getTrending();

      expect(prisma.work.findMany).toHaveBeenCalledWith({
        orderBy: [{ weeklyLikeDelta: 'desc' }, { id: 'asc' }],
        take: 3,
      });
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ id: 'w1', rank: 1, growthPct: 24 });
      expect(result[1]).toMatchObject({ id: 'w2', rank: 2, growthPct: 18 });
      expect(result[2]).toMatchObject({ id: 'w3', rank: 3, growthPct: 12 });
    });

    it('DR-10: is18plus true when audienceRating is 18+', async () => {
      prisma.work.findMany.mockResolvedValue([WORK_ROW({ audienceRating: '18+' })]);
      const result = await service.getTrending();
      expect(result[0]?.is18plus).toBe(true);
    });
  });

  describe('getActiveContest', () => {
    it('returns the most recent active contest, mapped to ActiveContest', async () => {
      prisma.contest.findMany.mockResolvedValue([
        {
          id: 'c1',
          category: 'CONCOURS',
          title: 'Prix du jeune mangaka 2026',
          subtitle: 'Doté par un éditeur · clôture 30 j',
          ctaLabel: 'Participer',
          href: '/concours',
          active: true,
          createdAt: new Date('2026-06-01'),
        },
      ]);

      const result = await service.getActiveContest();

      expect(prisma.contest.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(result).toEqual({
        id: 'c1',
        category: 'CONCOURS',
        title: 'Prix du jeune mangaka 2026',
        subtitle: 'Doté par un éditeur · clôture 30 j',
        ctaLabel: 'Participer',
        href: '/concours',
      });
    });

    it('returns null when no contest is active', async () => {
      prisma.contest.findMany.mockResolvedValue([]);

      const result = await service.getActiveContest();

      expect(result).toBeNull();
    });
  });

  describe('getEditorPicks', () => {
    it('orders by order asc and maps blurb + workSlug (joined Work)', async () => {
      prisma.editorPick.findMany.mockResolvedValue([
        { id: 'ep1', blurb: '« Encre Blanche » repéré par une maison partenaire', order: 0, work: { slug: 'encre-blanche' } },
      ]);

      const result = await service.getEditorPicks();

      expect(prisma.editorPick.findMany).toHaveBeenCalledWith({
        orderBy: { order: 'asc' },
        include: { work: true },
      });
      expect(result).toEqual([{ id: 'ep1', workSlug: 'encre-blanche', blurb: '« Encre Blanche » repéré par une maison partenaire' }]);
    });
  });
});
