import { PROSE_PARAGRAPHS_PER_PAGE } from '@encre-et-plume/shared';

// Single source of truth for a chapter's page count — used by the reader (ChapterPagesResponse.totalPages)
// AND reading-history (ReadingHistoryEntry.totalPages) so the resume bar never disagrees with the reader.
export function chapterTotalPages(isRoman: boolean, prose: string | null, pageCount: number): number {
  if (isRoman) return Math.ceil((prose ? prose.split('\n\n').length : 0) / PROSE_PARAGRAPHS_PER_PAGE);
  return pageCount;
}
