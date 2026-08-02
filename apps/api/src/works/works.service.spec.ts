import { WORK_CHAPTER_PAGE_SIZE } from '@encre-et-plume/shared';
import { WorksService } from './works.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const WORK_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  coverImage: null,
  genre: 'Seinen',
  format: 'Manga',
  complete: true,
  audienceRating: 'Tous publics',
  publishedAt: new Date('2026-06-01'),
  synopsis: 'Une histoire de brume.',
  themes: ['Action'],
  hashtags: ['#seinen', '#brume'],
  proseExcerpt: null,
  likeCount: 3400,
  readCount: 128000,
  favoriteCount: 340,
  creators: [],
  fundingGoals: [],
  reviews: [],
  ...overrides,
});

const CREATOR_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'wc1',
  role: 'dessinateur',
  order: 0,
  account: {
    id: 'acc1',
    displayName: 'Yuki Moreau',
    profileSlug: 'dr1-yuki-moreau',
    avatar: null,
    profile: { city: 'Lyon' },
  },
  ...overrides,
});

const REVIEW_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'r1',
  authorName: 'Lea',
  storyRating: 4,
  artRating: 5,
  text: 'Superbe.',
  hidden: false,
  createdAt: new Date('2026-06-10'),
  ...overrides,
});

describe('WorksService', () => {
  let service: WorksService;
  let prisma: {
    work: { findFirst: jest.Mock; update: jest.Mock };
    chapter: { findMany: jest.Mock; count: jest.Mock };
    planche: { findMany: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = {
      work: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      chapter: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      planche: { findMany: jest.fn().mockResolvedValue([]) },
    };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    service = new WorksService(prisma as unknown as PrismaService, redis as unknown as RedisService);
  });

  describe('getWork', () => {
    it('returns null for an unpublished/missing slug', async () => {
      prisma.work.findFirst.mockResolvedValue(null);

      const result = await service.getWork('inconnu');

      expect(result).toBeNull();
      expect(prisma.work.findFirst.mock.calls[0][0].where).toEqual({ slug: 'inconnu', publishedAt: { not: null } });
    });

    it('maps a published work: stats, synopsis, hashtags, no team/funding/reviews', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW());
      prisma.chapter.count.mockResolvedValue(12);

      const result = await service.getWork('lames-de-brume');

      expect(result).toMatchObject({
        id: 'w1',
        slug: 'lames-de-brume',
        title: 'Lames de Brume',
        cover: null,
        genre: 'Seinen',
        format: 'Manga',
        complete: true,
        audienceRating: 'Tous publics',
        meta: '12 ch.', // derived: no WorkCreator rows on this fixture
        synopsis: 'Une histoire de brume.',
        themes: ['Action'],
        hashtags: ['#seinen', '#brume'],
        proseExcerpt: null,
        likeCount: 3400,
        readCount: 128000,
        favoriteCount: 340,
        chapterCount: 12,
        team: [],
        fundingGoals: [],
        reviews: [],
      });
    });

    it('F-22: returns themes (F-20 fr labels) and keeps hashtags (mature derivation input)', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ themes: ['Action', 'Aventure'], hashtags: ['#seinen'] }));

      const result = await service.getWork('lames-de-brume');

      expect(result?.themes).toEqual(['Action', 'Aventure']);
      expect(result?.hashtags).toEqual(['#seinen']);
    });

    it('maps team from WorkCreator rows (name/slug/role/city/avatar)', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ creators: [CREATOR_ROW()] }));

      const result = await service.getWork('lames-de-brume');

      expect(result?.team).toEqual([
        { id: 'acc1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'dessinateur', city: 'Lyon', avatar: null },
      ]);
    });

    it('derives meta from the real creators and the real published-chapter count', async () => {
      prisma.work.findFirst.mockResolvedValue(
        WORK_ROW({
          creators: [
            CREATOR_ROW({ order: 0, role: 'scenariste', account: { id: 'a1', displayName: 'Camille Roux', profileSlug: 'c', avatar: null, profile: null } }),
            CREATOR_ROW({ order: 1, account: { id: 'a2', displayName: 'Yuki Moreau', profileSlug: 'y', avatar: null, profile: null } }),
          ],
        }),
      );
      prisma.chapter.count.mockResolvedValue(12);

      const result = await service.getWork('lames-de-brume');

      expect(result?.meta).toBe('Camille Roux × Yuki Moreau · 12 ch.');
    });

    it('city is null when the account has no profile', async () => {
      prisma.work.findFirst.mockResolvedValue(
        WORK_ROW({ creators: [CREATOR_ROW({ account: { id: 'acc2', displayName: 'X', profileSlug: 'x', avatar: null, profile: null } })] }),
      );

      const result = await service.getWork('lames-de-brume');

      expect(result?.team[0].city).toBeNull();
    });

    it('funding goal pct = round(current/target*100), clamped to 100, guarded against target<=0', async () => {
      prisma.work.findFirst.mockResolvedValue(
        WORK_ROW({
          fundingGoals: [
            { id: 'fg1', title: 'Impression', currentCents: 5000, targetCents: 10000, order: 0 },
            { id: 'fg2', title: 'Surprogress', currentCents: 20000, targetCents: 10000, order: 1 },
            { id: 'fg3', title: 'Zero target', currentCents: 100, targetCents: 0, order: 2 },
          ],
        }),
      );

      const result = await service.getWork('lames-de-brume');

      expect(result?.fundingGoals).toEqual([
        { id: 'fg1', title: 'Impression', currentCents: 5000, targetCents: 10000, pct: 50 },
        { id: 'fg2', title: 'Surprogress', currentCents: 20000, targetCents: 10000, pct: 100 },
        { id: 'fg3', title: 'Zero target', currentCents: 100, targetCents: 0, pct: 0 },
      ]);
    });

    it('proseExcerpt is returned only when format === Roman', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Manga', proseExcerpt: 'stored but hidden' }));
      const manga = await service.getWork('lames-de-brume');
      expect(manga?.proseExcerpt).toBeNull();

      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Roman', proseExcerpt: 'La pluie...' }));
      const roman = await service.getWork('le-murmure');
      expect(roman?.proseExcerpt).toBe('La pluie...');
    });

    it('aggregates ratingAvg/ratingStoryAvg/ratingArtAvg/reviewCount from Review rows (overall = mean of per-review (story+art)/2)', async () => {
      prisma.work.findFirst.mockResolvedValue(
        WORK_ROW({
          reviews: [
            REVIEW_ROW({ id: 'r1', storyRating: 4, artRating: 4 }),
            REVIEW_ROW({ id: 'r2', storyRating: 5, artRating: 3 }),
          ],
        }),
      );

      const result = await service.getWork('lames-de-brume');

      // overall per review: (4+4)/2=4, (5+3)/2=4 -> mean 4
      expect(result?.ratingAvg).toBe(4);
      expect(result?.ratingStoryAvg).toBe(4.5);
      expect(result?.ratingArtAvg).toBe(3.5);
      expect(result?.reviewCount).toBe(2);
    });

    it('rating fields are all 0 when there are no reviews', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ reviews: [] }));

      const result = await service.getWork('lames-de-brume');

      expect(result?.ratingAvg).toBe(0);
      expect(result?.ratingStoryAvg).toBe(0);
      expect(result?.ratingArtAvg).toBe(0);
      expect(result?.reviewCount).toBe(0);
    });

    it('a hidden review is still returned with hidden:true and text blanked', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ reviews: [REVIEW_ROW({ hidden: true, text: 'contenu modéré' })] }));

      const result = await service.getWork('lames-de-brume');

      expect(result?.reviews).toEqual([
        { id: 'r1', authorName: 'Lea', storyRating: 4, artRating: 5, text: '', hidden: true },
      ]);
    });

    it('chapterCount counts published chapters only (publishAt <= now)', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW());
      prisma.chapter.count.mockResolvedValue(7);

      const result = await service.getWork('lames-de-brume');

      expect(prisma.chapter.count).toHaveBeenCalledWith({
        where: { workId: 'w1', status: 'published', publishAt: { lte: expect.any(Date) } },
      });
      expect(result?.chapterCount).toBe(7);
    });

    it('performs no write (AC-B7 — pure read)', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW());

      await service.getWork('lames-de-brume');

      expect(prisma.work.update).not.toHaveBeenCalled();
    });

    it('DR-12: an Illustration(s) work maps ordered collectionItems', async () => {
      prisma.work.findFirst.mockResolvedValue(
        WORK_ROW({
          format: 'Illustration(s)',
          collectionItems: [
            { order: 0, illustration: { id: 'a', title: 'A', image: null, likeCount: 5, category: 'personnages', genres: [] } },
            { order: 1, illustration: { id: 'b', title: 'B', image: 'x', likeCount: 9, category: 'decors', genres: [] } },
          ],
        }),
      );

      const result = await service.getWork('carnet-d-encre');

      expect(result?.collectionItems?.map((i) => i.id)).toEqual(['a', 'b']);
      expect(result?.collectionItems?.[1]).toMatchObject({ id: 'b', thumbnail: 'x', categoryLabel: 'Décors', order: 1 });
    });

    it('BE-9: excludes unpublished (private) members from the public collectionItems query', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Illustration(s)', collectionItems: [] }));

      await service.getWork('carnet-d-encre');

      const include = prisma.work.findFirst.mock.calls[0][0].include;
      expect(include.collectionItems.where).toEqual({ illustration: { publishedAt: { not: null } } });
    });

    it('DR-12: a non-collection (Manga) work has collectionItems null', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Manga' }));

      const result = await service.getWork('lames-de-brume');

      expect(result?.collectionItems).toBeNull();
    });
  });

  describe('getChapters', () => {
    it('returns null when the work is missing/unpublished', async () => {
      prisma.work.findFirst.mockResolvedValue(null);

      const result = await service.getChapters('inconnu', 1);

      expect(result).toBeNull();
    });

    it('paginates published chapters only, ordered by number asc', async () => {
      prisma.work.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.chapter.count.mockResolvedValue(25);
      prisma.chapter.findMany.mockResolvedValue([
        { id: 'c1', number: 1, title: 'Sous la pluie', plancheCount: 22, publishAt: new Date('2026-01-01'), likeCount: 1800, premium: false },
      ]);

      const result = await service.getChapters('lames-de-brume', 2);

      const findManyArgs = prisma.chapter.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({ workId: 'w1', status: 'published', publishAt: { lte: expect.any(Date) } });
      expect(findManyArgs.orderBy).toEqual({ number: 'asc' });
      expect(findManyArgs.skip).toBe((2 - 1) * WORK_CHAPTER_PAGE_SIZE);
      expect(findManyArgs.take).toBe(WORK_CHAPTER_PAGE_SIZE);

      expect(prisma.chapter.count.mock.calls[0][0].where).toEqual(findManyArgs.where);

      expect(result).toEqual({
        items: [
          {
            id: 'c1',
            number: 1,
            title: 'Sous la pluie',
            plancheCount: 22,
            publishedAt: '2026-01-01T00:00:00.000Z',
            likeCount: 1800,
            locked: false,
            lockReason: null,
          },
        ],
        total: 25,
        page: 2,
        pageSize: WORK_CHAPTER_PAGE_SIZE,
        totalPages: Math.ceil(25 / WORK_CHAPTER_PAGE_SIZE),
      });
    });

    it('marks a premium chapter locked with reason "premium" (DR-4)', async () => {
      prisma.work.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.chapter.count.mockResolvedValue(1);
      prisma.chapter.findMany.mockResolvedValue([
        { id: 'c4', number: 4, title: null, plancheCount: 19, publishAt: new Date('2024-11-01'), likeCount: 820, premium: true },
      ]);

      const result = await service.getChapters('lames-de-brume', 1);

      expect(result?.items[0]).toMatchObject({ locked: true, lockReason: 'premium' });
    });

    it('non-premium chapter is not locked (lockReason null)', async () => {
      prisma.work.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.chapter.count.mockResolvedValue(1);
      prisma.chapter.findMany.mockResolvedValue([
        { id: 'c1', number: 1, title: 'Sous la pluie', plancheCount: 22, publishAt: new Date('2024-03-14'), likeCount: 1800, premium: false },
      ]);

      const result = await service.getChapters('lames-de-brume', 1);

      expect(result?.items[0]).toMatchObject({ locked: false, lockReason: null });
    });
  });

  describe('getPlanches', () => {
    it('returns null when the work is missing/unpublished', async () => {
      prisma.work.findFirst.mockResolvedValue(null);

      const result = await service.getPlanches('inconnu');

      expect(result).toBeNull();
    });

    it('returns planches ordered by order asc', async () => {
      prisma.work.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.planche.findMany.mockResolvedValue([{ id: 'p1', image: 'img.jpg', caption: 'Planche 1' }]);

      const result = await service.getPlanches('lames-de-brume');

      expect(prisma.planche.findMany).toHaveBeenCalledWith({ where: { workId: 'w1', chapterId: null }, orderBy: { order: 'asc' } });
      expect(result).toEqual([{ id: 'p1', image: 'img.jpg', caption: 'Planche 1' }]);
    });

    it('excludes DR-4 reader pages (chapterId set) from the work-level grid (DR-4 regression)', async () => {
      prisma.work.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.planche.findMany.mockResolvedValue([]);

      await service.getPlanches('lames-de-brume');

      expect(prisma.planche.findMany.mock.calls[0][0].where).toEqual({ workId: 'w1', chapterId: null });
    });

    it('an empty array is a valid response', async () => {
      prisma.work.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.planche.findMany.mockResolvedValue([]);

      const result = await service.getPlanches('lames-de-brume');

      expect(result).toEqual([]);
    });
  });

  describe('getAudienceRating (H2)', () => {
    it('returns null when the work is missing/unpublished', async () => {
      prisma.work.findFirst.mockResolvedValue(null);

      const result = await service.getAudienceRating('inconnu');

      expect(result).toBeNull();
    });

    it("returns the work's audienceRating when found", async () => {
      prisma.work.findFirst.mockResolvedValue({ audienceRating: '18+' });

      const result = await service.getAudienceRating('le-dernier-ronin');

      expect(prisma.work.findFirst.mock.calls[0][0]).toEqual({
        where: { slug: 'le-dernier-ronin', publishedAt: { not: null } },
        select: { audienceRating: true },
      });
      expect(result).toBe('18+');
    });
  });
});
