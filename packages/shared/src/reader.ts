// Shared contracts for DR-4 (chapter reader "Lecteur"). Extends DR-3's Work/Chapter/Planche models.
// Manga chapters return page-image payloads; roman chapters return prose paragraph payloads —
// `readMode` tells the FE which branch is populated.

export const PROSE_PARAGRAPHS_PER_PAGE = 5;

export interface ReaderPageDto {
  index: number; // 1-based page number within the chapter
  image: string | null; // manga page image URL; null -> FE halftone placeholder
  caption: string | null; // optional speech-bubble/caption overlay
  double: boolean; // spread metadata: true = full double-page panel
}

export type ReaderMode = 'pages' | 'prose';

export interface ChapterPagesResponse {
  workSlug: string;
  chapterNumber: number;
  readMode: ReaderMode; // 'prose' for Roman, 'pages' otherwise
  totalPages: number; // manga: pages.length; prose: ceil(prose.length / PROSE_PARAGRAPHS_PER_PAGE)
  pages: ReaderPageDto[]; // populated in 'pages' mode, [] in 'prose'
  /** CS-6 — the chapter opens on a cover. A cover is a standalone recto: page 1 must NOT be paired
   *  into a 2-page spread, whatever the reader's spread mode. */
  hasCover: boolean;
  prose: string[]; // paragraphs, populated in 'prose' mode, [] in 'pages'
}

/**
 * CS-6 — how many pages the reader shows at `page`. The ONE rule, because two callers must agree:
 * the stage draws that many, and the pager STEPS by that many. Split them and a standalone cover
 * would be drawn alone but skipped over (1 → 3), swallowing page 2.
 *
 * A spread shows two, except where a page must stand alone:
 *  · a `double` panel ALREADY spans both pages — shown alone, whether it is the current page or the
 *    one that would be paired with it (half a spread beside an unrelated page is not a reading);
 *  · a COVER is a standalone recto (that is what the toggle means);
 *  · the last page has no partner.
 */
export function readerPagesShown(
  page: number,
  totalPages: number,
  spreadMode: 'single' | 'double',
  opts: { hasCover?: boolean; currentIsDouble?: boolean; nextIsDouble?: boolean } = {},
): 1 | 2 {
  if (spreadMode !== 'double') return 1;
  if (opts.currentIsDouble || opts.nextIsDouble) return 1;
  if (opts.hasCover && page === 1) return 1;
  return page < totalPages ? 2 : 1;
}

export interface FavoriteWorkDto {
  slug: string;
  title: string;
  cover: string | null;
  meta: string; // e.g. "Camille R. × Yuki M. · 20 ch."
}

export interface ReadingProgressInput {
  workSlug: string;
  chapterNumber: number;
  page: number; // 1-based
}
