import { ReadingHistoryService } from './reading-history.service';
import { PrismaService } from '../prisma/prisma.service';

const ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  page: 12,
  updatedAt: new Date('2026-07-01T10:00:00Z'),
  work: { slug: 'lames-de-brume', title: 'Lames de Brume', format: 'Manga' },
  chapter: { number: 4, title: null, prose: null, _count: { pages: 28 } },
  ...overrides,
});

describe('ReadingHistoryService', () => {
  let service: ReadingHistoryService;
  let prisma: { readingProgress: { findMany: jest.Mock; findFirst: jest.Mock } };

  beforeEach(() => {
    prisma = { readingProgress: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) } };
    service = new ReadingHistoryService(prisma as unknown as PrismaService);
  });

  describe('getHistory', () => {
    it('maps a manga row using chapter._count.pages as totalPages', async () => {
      prisma.readingProgress.findMany.mockResolvedValue([ROW()]);

      const result = await service.getHistory('acc-1', 1);

      expect(result.items).toEqual([
        {
          workSlug: 'lames-de-brume',
          workTitle: 'Lames de Brume',
          chapterNumber: 4,
          chapterTitle: null,
          page: 12,
          totalPages: 28,
          updatedAt: '2026-07-01T10:00:00.000Z',
        },
      ]);
    });

    it('maps a roman row using ceil(prose paragraphs / 5) as totalPages', async () => {
      const prose = Array.from({ length: 10 }, (_, i) => `Paragraphe ${i + 1}`).join('\n\n');
      prisma.readingProgress.findMany.mockResolvedValue([
        ROW({
          work: { slug: 'le-murmure', title: "L'odeur du papier", format: 'Roman' },
          chapter: { number: 1, title: null, prose, _count: { pages: 0 } },
        }),
      ]);

      const result = await service.getHistory('acc-1', 1);

      expect(result.items[0]?.totalPages).toBe(2);
    });

    it('dedupes to one entry per work, keeping the most-recently-updated chapter', async () => {
      prisma.readingProgress.findMany.mockResolvedValue([
        ROW({ page: 12, updatedAt: new Date('2026-07-02T10:00:00Z'), chapter: { number: 4, title: null, prose: null, _count: { pages: 28 } } }),
        ROW({ page: 3, updatedAt: new Date('2026-07-01T10:00:00Z'), chapter: { number: 1, title: null, prose: null, _count: { pages: 20 } } }),
      ]);

      const result = await service.getHistory('acc-1', 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.chapterNumber).toBe(4);
      expect(result.total).toBe(1);
    });

    it('orders most-recent first across different works and paginates the deduped list', async () => {
      const rows = Array.from({ length: 25 }, (_, i) =>
        ROW({
          work: { slug: `work-${i}`, title: `Work ${i}`, format: 'Manga' },
          updatedAt: new Date(2026, 6, 1, 0, 0, i),
        }),
      );
      prisma.readingProgress.findMany.mockResolvedValue(rows);

      const page1 = await service.getHistory('acc-1', 1);
      const page2 = await service.getHistory('acc-1', 2);

      expect(page1.items).toHaveLength(20);
      expect(page2.items).toHaveLength(5);
      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(20);
    });

    it('filters unpublished works/chapters via the query where clause', async () => {
      await service.getHistory('acc-1', 1);

      expect(prisma.readingProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: 'acc-1',
            work: { publishedAt: { not: null } },
            chapter: { status: 'published', publishAt: { lte: expect.any(Date) } },
          }),
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });

    it('returns an empty result with no throw when nothing matches', async () => {
      prisma.readingProgress.findMany.mockResolvedValue([]);

      const result = await service.getHistory('acc-1', 1);

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    });
  });

  describe('getForWork', () => {
    it('returns the mapped latest entry for the work', async () => {
      prisma.readingProgress.findFirst.mockResolvedValue(ROW());

      const result = await service.getForWork('acc-1', 'lames-de-brume');

      expect(result).toEqual({
        workSlug: 'lames-de-brume',
        workTitle: 'Lames de Brume',
        chapterNumber: 4,
        chapterTitle: null,
        page: 12,
        totalPages: 28,
        updatedAt: '2026-07-01T10:00:00.000Z',
      });
    });

    it('returns null when there is no progress on the work', async () => {
      prisma.readingProgress.findFirst.mockResolvedValue(null);

      const result = await service.getForWork('acc-1', 'inconnu');

      expect(result).toBeNull();
    });
  });
});
