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
  prose: string[]; // paragraphs, populated in 'prose' mode, [] in 'pages'
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
