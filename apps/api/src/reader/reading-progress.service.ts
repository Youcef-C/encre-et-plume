import { Injectable, NotFoundException } from '@nestjs/common';
import type { ReadingProgressInput } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

/** DR-4 — persists per-user/chapter reading position (B9). Feeds DR-8's "Ma liste" resume. */
@Injectable()
export class ReadingProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async save(accountId: string, input: ReadingProgressInput): Promise<void> {
    const work = await this.prisma.work.findFirst({ where: { slug: input.workSlug, publishedAt: { not: null } } });
    if (!work) throw new NotFoundException('Chapitre introuvable');

    const chapter = await this.prisma.chapter.findFirst({ where: { workId: work.id, number: input.chapterNumber } });
    if (!chapter) throw new NotFoundException('Chapitre introuvable');

    await this.prisma.readingProgress.upsert({
      where: { accountId_chapterId: { accountId, chapterId: chapter.id } },
      create: { accountId, chapterId: chapter.id, workId: work.id, page: input.page },
      update: { page: input.page },
    });
  }
}
