// Shared contracts for DR-11 (reading history & resume "Reprendre la lecture"). Reuses DR-4's
// ReadingProgress model — no new columns; totalPages is derived at read time so the resume bar
// never disagrees with the reader (see apps/api/src/reader/chapter-pagination.ts).

export const READING_HISTORY_PAGE_SIZE = 20;

export interface ReadingHistoryEntry {
  workSlug: string;
  workTitle: string;
  chapterNumber: number;
  chapterTitle: string | null; // null when the chapter has no title
  page: number;
  totalPages: number; // chapter page count (manga=planches, roman=ceil(paras/5)) — matches the reader
  updatedAt: string; // ISO
}

export interface ReadingHistoryResponse {
  items: ReadingHistoryEntry[];
  total: number; // count AFTER per-work dedupe
  page: number;
  pageSize: number; // = READING_HISTORY_PAGE_SIZE
  totalPages: number; // pagination pages (distinct from entry.totalPages)
}
