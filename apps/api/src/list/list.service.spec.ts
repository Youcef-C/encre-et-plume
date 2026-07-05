import { ListService } from './list.service';
import { PrismaService } from '../prisma/prisma.service';

const WATCHLIST_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  createdAt: new Date('2026-07-01T10:00:00Z'),
  work: { id: 'work-1', slug: 'lames-de-brume', title: 'Lames de Brume', coverImage: null, chapterCount: 12 },
  ...overrides,
});

const PROGRESS_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  workId: 'work-1',
  page: 3,
  updatedAt: new Date('2026-07-02T10:00:00Z'),
  chapter: { number: 1 },
  ...overrides,
});

const FAVORITE_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  createdAt: new Date('2026-07-01T10:00:00Z'),
  work: { slug: 'lames-de-brume', title: 'Lames de Brume', coverImage: null, genre: 'Seinen', likeCount: 3400 },
  ...overrides,
});

const REACTION_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  targetId: 'illus-1',
  ...overrides,
});

const ILLUSTRATION_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'illus-1',
  title: 'Pluie de Néons',
  artistName: 'Yuki Moreau',
  category: 'couvertures',
  image: null,
  likeCount: 12401,
  ...overrides,
});

describe('ListService', () => {
  let service: ListService;
  let prisma: {
    watchlistItem: { findMany: jest.Mock };
    readingProgress: { findMany: jest.Mock };
    favorite: { findMany: jest.Mock };
    reaction: { findMany: jest.Mock };
    illustration: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      watchlistItem: { findMany: jest.fn().mockResolvedValue([]) },
      readingProgress: { findMany: jest.fn().mockResolvedValue([]) },
      favorite: { findMany: jest.fn().mockResolvedValue([]) },
      reaction: { findMany: jest.fn().mockResolvedValue([]) },
      illustration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ListService(prisma as unknown as PrismaService);
  });

  describe('getList', () => {
    it('maps a saved work with no progress to lastChapterNumber:null, page:null, progressPercent:0', async () => {
      prisma.watchlistItem.findMany.mockResolvedValue([WATCHLIST_ROW()]);

      const result = await service.getList('acc-1');

      expect(result).toEqual([
        {
          slug: 'lames-de-brume',
          title: 'Lames de Brume',
          cover: null,
          savedAt: '2026-07-01T10:00:00.000Z',
          lastChapterNumber: null,
          page: null,
          totalChapters: 12,
          progressPercent: 0,
        },
      ]);
    });

    it('joins the latest reading progress for the work, rounding progressPercent', async () => {
      prisma.watchlistItem.findMany.mockResolvedValue([WATCHLIST_ROW()]);
      prisma.readingProgress.findMany.mockResolvedValue([PROGRESS_ROW()]);

      const result = await service.getList('acc-1');

      // chapterNumber 1 / totalChapters 12 * 100 = 8.33... -> rounds to 8
      expect(result[0]).toMatchObject({ lastChapterNumber: 1, page: 3, progressPercent: 8 });
    });

    it('dedupes progress to the most-recently-updated row per work', async () => {
      prisma.watchlistItem.findMany.mockResolvedValue([WATCHLIST_ROW()]);
      prisma.readingProgress.findMany.mockResolvedValue([
        PROGRESS_ROW({ page: 3, updatedAt: new Date('2026-07-03T10:00:00Z'), chapter: { number: 5 } }),
        PROGRESS_ROW({ page: 1, updatedAt: new Date('2026-07-01T10:00:00Z'), chapter: { number: 1 } }),
      ]);

      const result = await service.getList('acc-1');

      expect(result[0]).toMatchObject({ lastChapterNumber: 5, page: 3 });
    });

    it('returns progressPercent:0 when totalChapters is 0 (avoids division by zero)', async () => {
      prisma.watchlistItem.findMany.mockResolvedValue([WATCHLIST_ROW({ work: { id: 'work-1', slug: 'x', title: 'X', coverImage: null, chapterCount: 0 } })]);
      prisma.readingProgress.findMany.mockResolvedValue([PROGRESS_ROW()]);

      const result = await service.getList('acc-1');

      expect(result[0]?.progressPercent).toBe(0);
    });

    it('orders by createdAt desc via the query and scopes to the given account', async () => {
      await service.getList('acc-1');

      expect(prisma.watchlistItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'acc-1' }, orderBy: { createdAt: 'desc' } }),
      );
    });

    it('returns an empty array when nothing is saved', async () => {
      const result = await service.getList('acc-1');
      expect(result).toEqual([]);
    });
  });

  describe('getLikes', () => {
    it('maps a favorite row to a LikedWorkDto', async () => {
      prisma.favorite.findMany.mockResolvedValue([FAVORITE_ROW()]);

      const result = await service.getLikes('acc-1');

      expect(result).toEqual([
        {
          slug: 'lames-de-brume',
          title: 'Lames de Brume',
          cover: null,
          genre: 'Seinen',
          likeCount: 3400,
          likedAt: '2026-07-01T10:00:00.000Z',
        },
      ]);
    });

    it('scopes to the given account, ordered createdAt desc', async () => {
      await service.getLikes('acc-1');

      expect(prisma.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'acc-1' }, orderBy: { createdAt: 'desc' } }),
      );
    });

    it('returns an empty array when nothing is liked', async () => {
      const result = await service.getLikes('acc-1');
      expect(result).toEqual([]);
    });
  });

  describe('getLikedIllustrations', () => {
    it('maps a liked-illustration Reaction row to a LikedIllustrationDto', async () => {
      prisma.reaction.findMany.mockResolvedValue([REACTION_ROW()]);
      prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW()]);

      const result = await service.getLikedIllustrations('acc-1');

      expect(result).toEqual([
        {
          id: 'illus-1',
          title: 'Pluie de Néons',
          artistName: 'Yuki Moreau',
          category: 'couvertures',
          categoryLabel: 'Couvertures',
          image: null,
          likeCount: 12401,
        },
      ]);
    });

    it('queries Reaction scoped to the account, targetType illustration, kind like, ordered createdAt desc', async () => {
      await service.getLikedIllustrations('acc-1');

      expect(prisma.reaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: 'acc-1', targetType: 'illustration', kind: 'like' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('drops reactions whose illustration is unpublished or deleted', async () => {
      prisma.reaction.findMany.mockResolvedValue([REACTION_ROW({ targetId: 'illus-1' }), REACTION_ROW({ targetId: 'illus-gone' })]);
      prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW()]);

      const result = await service.getLikedIllustrations('acc-1');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('illus-1');
    });

    it('only fetches published illustrations (publishedAt not null)', async () => {
      prisma.reaction.findMany.mockResolvedValue([REACTION_ROW()]);

      await service.getLikedIllustrations('acc-1');

      expect(prisma.illustration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ publishedAt: { not: null } }) }),
      );
    });

    it('preserves Reaction order (createdAt desc) rather than illustration query order', async () => {
      prisma.reaction.findMany.mockResolvedValue([REACTION_ROW({ targetId: 'illus-2' }), REACTION_ROW({ targetId: 'illus-1' })]);
      prisma.illustration.findMany.mockResolvedValue([
        ILLUSTRATION_ROW({ id: 'illus-1' }),
        ILLUSTRATION_ROW({ id: 'illus-2', title: 'Onibi' }),
      ]);

      const result = await service.getLikedIllustrations('acc-1');

      expect(result.map((r: { id: string }) => r.id)).toEqual(['illus-2', 'illus-1']);
    });

    it('returns an empty array when nothing is liked', async () => {
      const result = await service.getLikedIllustrations('acc-1');
      expect(result).toEqual([]);
      expect(prisma.illustration.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getSavedIllustrations', () => {
    it('queries Reaction scoped to the account, targetType illustration, kind save', async () => {
      await service.getSavedIllustrations('acc-1');

      expect(prisma.reaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: 'acc-1', targetType: 'illustration', kind: 'save' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('maps a saved-illustration Reaction row to a LikedIllustrationDto', async () => {
      prisma.reaction.findMany.mockResolvedValue([REACTION_ROW()]);
      prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW()]);

      const result = await service.getSavedIllustrations('acc-1');

      expect(result).toEqual([
        {
          id: 'illus-1',
          title: 'Pluie de Néons',
          artistName: 'Yuki Moreau',
          category: 'couvertures',
          categoryLabel: 'Couvertures',
          image: null,
          likeCount: 12401,
        },
      ]);
    });

    it('returns an empty array when nothing is saved', async () => {
      const result = await service.getSavedIllustrations('acc-1');
      expect(result).toEqual([]);
    });
  });
});
