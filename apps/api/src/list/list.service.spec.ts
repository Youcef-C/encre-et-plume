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

describe('ListService', () => {
  let service: ListService;
  let prisma: {
    watchlistItem: { findMany: jest.Mock; deleteMany: jest.Mock };
    readingProgress: { findMany: jest.Mock };
    favorite: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      watchlistItem: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      readingProgress: { findMany: jest.fn().mockResolvedValue([]) },
      favorite: { findMany: jest.fn().mockResolvedValue([]) },
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

  describe('removeFromList', () => {
    it('issues a deleteMany scoped to accountId + work.slug', async () => {
      await service.removeFromList('acc-1', 'lames-de-brume');

      expect(prisma.watchlistItem.deleteMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', work: { slug: 'lames-de-brume' } },
      });
    });

    it('is idempotent when no row matches (0 rows deleted, no throw)', async () => {
      prisma.watchlistItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeFromList('acc-1', 'inconnu')).resolves.toBeUndefined();
    });
  });
});
