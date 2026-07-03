import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChapterPagesResponse, ReaderPageDto } from '@encre-et-plume/shared';
import { PROSE_PARAGRAPHS_PER_PAGE } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DR-4 reader "Lecteur". Public, no guard — mirrors WorksController (anonymous visitors read
 * unlocked chapters freely). Unlike WorksService this route WRITES a read-count bump on every
 * accessible open, so it is never Redis-cached (see works.service.ts's `cached()` for contrast).
 */
@Injectable()
export class ReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async getPages(slug: string, chapterNumber: number): Promise<ChapterPagesResponse> {
    const work = await this.prisma.work.findFirst({ where: { slug, publishedAt: { not: null } } });
    if (!work) throw new NotFoundException('Chapitre introuvable');

    const chapter = await this.prisma.chapter.findFirst({
      where: { workId: work.id, number: chapterNumber, status: 'published', publishAt: { lte: new Date() } },
    });
    if (!chapter) throw new NotFoundException('Chapitre introuvable');

    // B7: premium chapters are locked for everyone until an access/subscription system exists.
    if (chapter.premium) {
      throw new ForbiddenException({ statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' });
    }

    // B8 side effect: bump the denormalized read counter once per accessible open (FE fetches
    // pages once per chapter open, paginates client-side — one bump per open, not per page).
    await this.prisma.work.update({ where: { id: work.id }, data: { readCount: { increment: 1 } } });

    if (work.format === 'Roman') {
      const prose = chapter.prose ? chapter.prose.split('\n\n') : [];
      return {
        workSlug: slug,
        chapterNumber,
        readMode: 'prose',
        totalPages: Math.ceil(prose.length / PROSE_PARAGRAPHS_PER_PAGE),
        pages: [],
        prose,
      };
    }

    const planches = await this.prisma.planche.findMany({ where: { chapterId: chapter.id }, orderBy: { order: 'asc' } });
    // ponytail: `double` defaults false — richer spread-layout metadata is YAGNI until the studio
    // (CS-*) produces real double-page panels; a dedicated column can replace this later.
    const pages: ReaderPageDto[] = planches.map((p, i) => ({ index: i + 1, image: p.image, caption: p.caption, double: false }));

    return { workSlug: slug, chapterNumber, readMode: 'pages', totalPages: pages.length, pages, prose: [] };
  }
}
