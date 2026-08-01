// CS-7 — chapter management ("Espace projet" → Chapitres tab).
//
// The DB enum `ChapterStatus = draft | scheduled | published` is owned by the DR/PUB reader side;
// CS-7 never adds a parallel enum. The tab's vocabulary is a VIEW MODEL mapped from it:
// `published` → "✓ Publié", everything else → "En cours · N%".

import type { PageFileTag } from './projects.js';

export type ChapterStatusLabel = 'en_cours' | 'publie';

/**
 * R3-2 — every chapter has a planned length. 20 planches is the standard manga chapter and the
 * column default, so a chapter nobody planned by hand still shows a real percentage and a real bar.
 */
export const DEFAULT_TARGET_PAGES = 20;

/**
 * R3-3 — the ONE progress formula. Used by the API derivation *and* by the kanban board, which
 * recomputes it locally from the pages it already holds (so the chip's bar reacts to a stage change
 * or a move without a refetch). Both call this so the two can never drift.
 *
 * `done` = the chapter's linked cards at the terminal `PageStage`. Clamped to 100: a chapter may
 * overshoot its plan, and a 150 % bar is nonsense.
 */
export function chapterProgressPct(done: number, targetPages: number): number {
  if (targetPages <= 0) return 0;
  return Math.min(100, Math.round((100 * done) / targetPages));
}

/**
 * R5-6 — the ONE chapter label. « Prologue » for chapter 0, « Ch. N » otherwise. Shared so the
 * board's chip row, the Fichiers card filter and the « Lier à une carte » rows cannot drift.
 */
export function chapterChipLabel(chapter: { number: number }): string {
  return chapter.number === 0 ? 'Prologue' : `Ch. ${chapter.number}`;
}

/**
 * One board card (CS-2 `Page`) linked to a chapter — feeds the chapter's thumbnail strip.
 *
 * R6-1a: this ref carries what a caller needs to DRAW the tile, not just name it. Three rounds asked
 * it for one more field each time (T-B7's chapterId, R5-4, now the image), so it holds the card's own
 * shape once and for all: its tags and its artwork.
 */
export interface ChapterPageRef {
  id: string;
  title: string;
  stage: string; // PageStage value
  /**
   * R6-1b — the linked `page` asset's thumbnail: the CDN URL for public media, a short-lived SIGNED
   * URL for private (F-10: bytes never come from the API). `null` when the card links no page asset
   * or the media has no `thumb` variant yet → the strip draws its halftone placeholder.
   */
  thumbnailUrl: string | null;
  /** The card's file-type tags. `double` = a two-page spread → the strip tile is 2× wide (R6-2). */
  fileTags: PageFileTag[];
}

export interface ChapterDto {
  id: string;
  projectId: string;
  title: string | null;
  number: number;
  resume: string | null;
  status: ChapterStatusLabel;
  /**
   * 0..100, `chapterProgressPct(done, targetPages)` where `done` = linked cards at the terminal
   * PageStage. Derived, never stored. **R3-2: never null** — every chapter has a target.
   */
  progressPct: number;
  /** « PLANCHES PRÉVUES » — the chapter's planned length. R3-2: NOT NULL, defaults to 20. */
  targetPages: number;
  plancheCount: number; // derived — count of linked board cards
  likeCount: number; // denormalized; DR-9 owns the writes
  pages: ChapterPageRef[]; // creation order (ordering WITHIN a chapter is CS-6)
}

/** GET /projects/{slug}/chapters */
export interface ChapterListResponse {
  chapters: ChapterDto[];
  canWrite: boolean;
}

/**
 * POST /projects/{slug}/chapters
 *
 * R2-2 — `number` and `title` are OPTIONAL so the Tableau "＋" chip can quick-create in one click.
 * Omitting `number` makes the server assign `max(number) + 1` inside the insert transaction (two
 * collaborators clicking at the same moment must not race into a 409); omitting `title` defaults it
 * to « Chapitre {n} ». The inline Chapitres form still sends both — a *blank* title is still a 400.
 */
export interface CreateChapterRequest {
  title?: string;
  number?: number;
  resume?: string;
  /** R3-2 — a positive integer; omitted means the default 20, never "no planned length". */
  targetPages?: number;
}

/** PATCH /chapters/{id} */
export interface UpdateChapterRequest {
  title?: string;
  number?: number;
  resume?: string;
  /** R3-2 — a positive integer. It can no longer be CLEARED: the column is NOT NULL. */
  targetPages?: number;
}
