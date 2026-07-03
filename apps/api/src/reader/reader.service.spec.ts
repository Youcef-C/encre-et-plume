import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PROSE_PARAGRAPHS_PER_PAGE } from '@encre-et-plume/shared';
import { ReaderService } from './reader.service';
import { PrismaService } from '../prisma/prisma.service';

const WORK_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'w1',
  slug: 'lames-de-brume',
  format: 'Manga',
  publishedAt: new Date('2026-01-01'),
  ...overrides,
});

const CHAPTER_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'c1',
  workId: 'w1',
  number: 1,
  premium: false,
  prose: null,
  ...overrides,
});

describe('ReaderService', () => {
  let service: ReaderService;
  let prisma: {
    work: { findFirst: jest.Mock; update: jest.Mock };
    chapter: { findFirst: jest.Mock };
    planche: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      work: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(undefined) },
      chapter: { findFirst: jest.fn().mockResolvedValue(null) },
      planche: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ReaderService(prisma as unknown as PrismaService);
  });

  it('throws 404 when the work is missing/unpublished', async () => {
    prisma.work.findFirst.mockResolvedValue(null);

    await expect(service.getPages('inconnu', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.work.update).not.toHaveBeenCalled();
  });

  it('throws 404 when the chapter number is missing', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW());
    prisma.chapter.findFirst.mockResolvedValue(null);

    await expect(service.getPages('lames-de-brume', 99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.work.update).not.toHaveBeenCalled();
  });

  it('throws 403 with reason "premium" for a locked chapter and does not increment readCount', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW());
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW({ premium: true }));

    await expect(service.getPages('lames-de-brume', 4)).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' }),
    });
    await expect(service.getPages('lames-de-brume', 4)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.work.update).not.toHaveBeenCalled();
  });

  it('builds a manga payload: ordered pages, totalPages = pages.length, readMode "pages"', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Manga' }));
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());
    prisma.planche.findMany.mockResolvedValue([
      { id: 'p1', image: 'a.jpg', caption: null, order: 0 },
      { id: 'p2', image: null, caption: 'Bulle', order: 1 },
    ]);

    const result = await service.getPages('lames-de-brume', 1);

    expect(prisma.planche.findMany).toHaveBeenCalledWith({ where: { chapterId: 'c1' }, orderBy: { order: 'asc' } });
    expect(result).toEqual({
      workSlug: 'lames-de-brume',
      chapterNumber: 1,
      readMode: 'pages',
      totalPages: 2,
      pages: [
        { index: 1, image: 'a.jpg', caption: null, double: false },
        { index: 2, image: null, caption: 'Bulle', double: false },
      ],
      prose: [],
    });
  });

  it('builds a roman payload: splits prose on "\\n\\n", totalPages via the shared constant, readMode "prose"', async () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraphe ${i + 1}`);
    prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Roman' }));
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW({ prose: paragraphs.join('\n\n') }));

    const result = await service.getPages('le-murmure', 1);

    expect(prisma.planche.findMany).not.toHaveBeenCalled();
    expect(result.readMode).toBe('prose');
    expect(result.pages).toEqual([]);
    expect(result.prose).toEqual(paragraphs);
    expect(result.totalPages).toBe(Math.ceil(paragraphs.length / PROSE_PARAGRAPHS_PER_PAGE));
  });

  it('increments Work.readCount by 1 on a successful accessible fetch', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW());
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());

    await service.getPages('lames-de-brume', 1);

    expect(prisma.work.update).toHaveBeenCalledTimes(1);
    expect(prisma.work.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { readCount: { increment: 1 } } });
  });
});
