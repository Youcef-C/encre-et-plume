import { workMetaLine } from '@encre-et-plume/shared';

/**
 * The ONE way to read a Work's meta line.
 *
 * `Work.meta` used to be a stored String duplicating the creators and the chapter count, with
 * nothing keeping it in sync: 7 of 9 seeded works named someone who was not a creator, and its
 * chapter count disagreed with `Work.chapterCount` on 6 of 9. The column is gone — the line is
 * DERIVED, here, from the relation and the counter, and the FE keeps rendering `meta` unchanged.
 *
 * `chapterCount` stays a stored counter on purpose (see `syncWorkChapterCount`): Prisma cannot
 * filter or sort on a relation count, and DR-2's LONGUEUR facet does exactly that.
 */
export const WORK_META_INCLUDE = {
  creators: { orderBy: { order: 'asc' as const }, select: { account: { select: { displayName: true } } } },
  _count: { select: { collectionItems: true } },
};

/** The minimum a row must carry for `workMeta` — exactly what `WORK_META_INCLUDE` adds. */
export interface WorkMetaRow {
  format?: string | null;
  chapterCount?: number;
  creators: { account: { displayName: string } }[];
  _count?: { collectionItems: number };
}

/**
 * Builds the meta line for a work row loaded with `WORK_META_INCLUDE`.
 * `chapterCount` overrides the stored counter where a caller already counted live (WorksService).
 */
export function workMeta(w: WorkMetaRow, chapterCount?: number): string {
  return workMetaLine({
    format: w.format ?? undefined,
    creatorNames: w.creators.map((c) => c.account.displayName),
    chapterCount: chapterCount ?? w.chapterCount ?? 0,
    itemCount: w._count?.collectionItems,
  });
}
