import { NotFoundException } from '@nestjs/common';
import { ReadingProgressService } from './reading-progress.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReadingProgressService', () => {
  let service: ReadingProgressService;
  let prisma: {
    work: { findFirst: jest.Mock };
    chapter: { findFirst: jest.Mock };
    readingProgress: { upsert: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      work: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
      chapter: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', workId: 'w1' }) },
      readingProgress: { upsert: jest.fn().mockResolvedValue(undefined) },
    };
    service = new ReadingProgressService(prisma as unknown as PrismaService);
  });

  it('throws 404 when the work/chapter is unknown', async () => {
    prisma.chapter.findFirst.mockResolvedValue(null);

    await expect(service.save('acc-1', { workSlug: 'inconnu', chapterNumber: 99, page: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.readingProgress.upsert).not.toHaveBeenCalled();
  });

  it('upserts on [accountId, chapterId] with the given page', async () => {
    await service.save('acc-1', { workSlug: 'lames-de-brume', chapterNumber: 1, page: 12 });

    expect(prisma.readingProgress.upsert).toHaveBeenCalledWith({
      where: { accountId_chapterId: { accountId: 'acc-1', chapterId: 'c1' } },
      create: { accountId: 'acc-1', chapterId: 'c1', workId: 'w1', page: 12 },
      update: { page: 12 },
    });
  });
});
