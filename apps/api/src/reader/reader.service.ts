import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChapterPagesResponse, ReaderPageDto } from '@encre-et-plume/shared';
import { isWork18Plus } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { RedisService } from '../redis/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { chapterTotalPages } from './chapter-pagination';

/** F-23 B10: one read per visitor per chapter per 30 minutes. */
const READ_DEDUPE_S = 1800;

/**
 * DR-4 reader "Lecteur". Public, no guard — mirrors WorksController (anonymous visitors read
 * unlocked chapters freely). Unlike WorksService this route WRITES a read-count bump on every
 * accessible open, so it is never Redis-cached (see works.service.ts's `cached()` for contrast).
 */
@Injectable()
export class ReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ageGate: AgeGateService,
    private readonly redis: RedisService,
    private readonly analytics: AnalyticsService,
  ) {}

  async getPages(
    slug: string,
    chapterNumber: number,
    accountId?: string,
    client?: { ip?: string; userAgent?: string; identityDegraded?: boolean },
  ): Promise<ChapterPagesResponse> {
    const work = await this.prisma.work.findFirst({ where: { slug, publishedAt: { not: null } } });
    if (!work) throw new NotFoundException('Chapitre introuvable');

    const chapter = await this.prisma.chapter.findFirst({
      where: { workId: work.id, number: chapterNumber, status: 'published', publishAt: { lte: new Date() } },
    });
    if (!chapter) throw new NotFoundException('Chapitre introuvable');

    // DR-10 BE-6: age gate runs BEFORE the premium check and the readCount bump.
    if (isWork18Plus(work.audienceRating)) {
      await this.ageGate.assertMayView18Plus(accountId, client?.identityDegraded);
    }

    // B7: premium chapters are locked for everyone until an access/subscription system exists.
    if (chapter.premium) {
      throw new ForbiddenException({ statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' });
    }

    // B8 side effect: bump the denormalized read counter once per accessible open (FE fetches
    // pages once per chapter open, paginates client-side — one bump per open, not per page).
    //
    // F-23 B10: that bump is now WRAPPED in a 30-minute per-(visitor, chapter) dedupe, which is
    // also what emits the `read` event. One window, one decision — two independent windows would
    // drift, and the counter's refresh-inflation is fixed at its single writer as a by-product.
    // No visitorId (Redis down, or no salt) → today's behaviour: bump, no dedupe, no event. A
    // Redis outage must not silently stop the counter.
    const visitorId = await this.analytics.visitorId(client?.ip, client?.userAgent);
    const firstReadInWindow =
      visitorId === null ||
      (await this.redis.setNx(`read:${visitorId}:${chapter.id}`, '1', READ_DEDUPE_S));

    if (firstReadInWindow) {
      await this.prisma.work.update({ where: { id: work.id }, data: { readCount: { increment: 1 } } });
      if (visitorId !== null) {
        await this.analytics.track({
          kind: 'read',
          visitorId,
          accountId: accountId ?? null,
          targetType: 'work', // PE-5 reads this series as metric='reads', dim=<workId>
          targetId: work.id,
        });
      }
    }

    if (work.format === 'Roman') {
      const prose = chapter.prose ? chapter.prose.split('\n\n') : [];
      return {
        workSlug: slug,
        chapterNumber,
        readMode: 'prose',
        totalPages: chapterTotalPages(true, chapter.prose, 0),
        pages: [],
        prose,
        hasCover: false, // prose has no cover page to stand alone

      };
    }

    const planches = await this.prisma.planche.findMany({ where: { chapterId: chapter.id }, orderBy: { order: 'asc' } });
    // ponytail: `double` defaults false — richer spread-layout metadata is YAGNI until the studio
    // (CS-*) produces real double-page panels; a dedicated column can replace this later.
    const pages: ReaderPageDto[] = planches.map((p, i) => ({ index: i + 1, image: p.image, caption: p.caption, double: false }));

    // CS-6 — a chapter that opens on a cover must show page 1 ALONE, never paired into a spread.
    return {
      workSlug: slug,
      chapterNumber,
      readMode: 'pages',
      totalPages: chapterTotalPages(false, null, pages.length),
      pages,
      prose: [],
      hasCover: chapter.hasCover,
    };
  }
}
