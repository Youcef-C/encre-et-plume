// Shared contracts for DR-3 (Work page "Œuvre"). Public, read-only endpoints, extending the DR-1/DR-2
// Work/Chapter models. FE `null` cover/avatar/image -> CSS halftone placeholder (never a broken <img>).
// Dates are ISO 8601 strings; all counters are plain integers formatted client-side.

import type { CollectionItemDto } from './collections.js';
import { WORK_FORMAT_ILLUSTRATIONS } from './collections.js';

export const WORK_CHAPTER_PAGE_SIZE = 10;
export const WORK_CHAPTER_PREVIEW = 3; // FE collapse threshold (prototype shows 3 then "Voir les N…")

export interface WorkCreatorDto {
  id: string; // Account id
  name: string; // Account.displayName
  slug: string; // Account.profileSlug -> /{slug} (F-3 profile, works today)
  role: string; // "scenariste" | "dessinateur" | …
  city: string | null;
  avatar: string | null;
}

/**
 * The ONE hero/ranking/card meta line, e.g. `Camille Roux × Yuki Moreau · 12 ch.`
 *
 * Derived from the work's real `WorkCreator` rows and its real chapter count — it is NEVER stored.
 * It used to be a `Work.meta` String column that nothing kept in sync, and it drifted from BOTH the
 * creators and the chapter count on 7 of 9 seeded works (see `_seed-coherence-notes.md`). Same idiom
 * as `chapterChipLabel` / `chapterPageNumbers`: one formatter so two callers cannot disagree.
 *
 * A collection work (`format === 'Illustration(s)'`) has no chapters — its line counts members.
 */
export function workMetaLine(work: {
  format?: string | null;
  creatorNames: string[];
  chapterCount: number;
  /** Collection member count; only read when `format === 'Illustration(s)'`. */
  itemCount?: number;
}): string {
  if (work.format === WORK_FORMAT_ILLUSTRATIONS) return collectionMetaLine(work.itemCount ?? 0);
  const names = work.creatorNames.filter((n) => n && n.trim()).join(' × ');
  const chapters = `${work.chapterCount} ch.`;
  return names ? `${names} · ${chapters}` : chapters;
}

/** The collection variant of the line, on its own — the cards/grids that only ever show a count. */
export function collectionMetaLine(count: number): string {
  return `${count} illustration${count === 1 ? '' : 's'} · collection`;
}

export interface FundingGoalDto {
  id: string;
  title: string;
  currentCents: number;
  targetCents: number;
  pct: number; // min(100, round(current/target*100))
}

export interface WorkReviewDto {
  id: string;
  authorId: string | null; // MC-10: null for seed/legacy fixtures; used for per-viewer mute filtering
  authorName: string;
  storyRating: number; // 0..5
  artRating: number; // 0..5
  text: string; // '' when hidden
  hidden: boolean;
}

export interface WorkDetail {
  id: string;
  slug: string;
  title: string;
  cover: string | null;
  genre: string; // fr display label
  themes: string[]; // F-22: F-20 vocabulary fr labels (Work.themes) — Œuvre tag row = genre + themes, clickable -> /decouvrir?genre=<id>
  format: string; // "Manga" | "One-shot" | "Roman" (type badge / DÉTAILS Type)
  complete: boolean; // "✓ Complet" badge + DÉTAILS Statut
  audienceRating: string; // DÉTAILS Public, e.g. "16+"
  meta: string; // author line — DERIVED server-side via workMetaLine(), never a stored column
  publishedAt: string | null; // ISO — FE derives "Sortie" year (releaseDate)
  synopsis: string | null;
  hashtags: string[];
  proseExcerpt: string | null; // non-null ONLY when format === 'Roman'
  // stats
  likeCount: number;
  readCount: number;
  favoriteCount: number;
  ratingAvg: number; // computed from reviews (overall)
  ratingStoryAvg: number;
  ratingArtAvg: number;
  reviewCount: number;
  chapterCount: number; // published chapters
  // relations
  team: WorkCreatorDto[];
  fundingGoals: FundingGoalDto[];
  reviews: WorkReviewDto[]; // read-only preview list (PUB-3 owns write)
  // DR-12: ordered member illustrations when format === 'Illustration(s)' (a collection); null otherwise.
  collectionItems: CollectionItemDto[] | null;
}

export interface WorkChapterDto {
  id: string;
  number: number;
  title: string | null;
  plancheCount: number;
  publishedAt: string; // ISO of Chapter.publishAt
  likeCount: number;
  locked: boolean; // DR-4: premium tier lock (no access system yet -> premium === locked for all viewers)
  lockReason: string | null; // DR-4: 'premium' | null
}

export interface WorkChaptersResponse {
  items: WorkChapterDto[];
  total: number; // published chapters matching the same where
  page: number;
  pageSize: number; // = WORK_CHAPTER_PAGE_SIZE
  totalPages: number;
}

export interface PlancheDto {
  id: string;
  image: string | null;
  caption: string | null;
}
