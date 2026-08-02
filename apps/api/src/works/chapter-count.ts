import type { PrismaService } from '../prisma/prisma.service';

/**
 * The ONE writer of `Work.chapterCount`.
 *
 * `chapterCount` is the second denormalized lie the seed-coherence pass found: works advertised
 * 15-20 chapters while owning ZERO `Chapter` rows, because nothing ever wrote the column after the
 * seed hardcoded it. Unlike `Work.meta` (dropped — see work-meta.ts) the column CANNOT simply be
 * derived away: DR-2's LONGUEUR facet filters on it (`chapterCount: { gte: 16 }`) and Prisma has no
 * way to filter or sort on a relation count. So it stays denormalized WITH a writer, and this is it.
 *
 * The rule is exactly the one `WorksService.getWork` reads live, so the œuvre page's chapter list,
 * the DÉTAILS sidebar and the catalog card can no longer disagree: published AND already due.
 */
export async function syncWorkChapterCount(
  prisma: Pick<PrismaService, 'chapter' | 'work'>,
  workId: string,
): Promise<number> {
  const chapterCount = await prisma.chapter.count({
    where: { workId, status: 'published', publishAt: { lte: new Date() } },
  });
  await prisma.work.update({ where: { id: workId }, data: { chapterCount } });
  return chapterCount;
}
