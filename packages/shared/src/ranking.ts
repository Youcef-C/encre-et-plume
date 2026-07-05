// Shared contracts for DR-7 (Ranking "Classement" category tabs). Public, read-only endpoint.
// The prior GET /home/ranking/all-time + RankingRow (home.ts) stay the home sidebar's single-truth
// source — this is the unified cross-entity shape for the Classement page's 4 category tabs.

export const RANKING_CATEGORIES = ['mangas', 'romans', 'illustrations', 'createurs'] as const;
export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

/** Narrows an unknown query value to a valid category — reusable by both FE (URL parsing) and BE. */
export function isRankingCategory(value: string | undefined | null): value is RankingCategory {
  return typeof value === 'string' && (RANKING_CATEGORIES as readonly string[]).includes(value);
}

/** GET /ranking?category=... item — one ranked row, whatever the underlying entity (Work/Illustration/Profile). */
export interface RankingEntry {
  rank: number;
  id: string;
  title: string;
  meta: string;
  cover: string | null;
  href: string;
  /** DR-10: true for 18+-gated entries (always false for `createurs` — creator profiles aren't gated). */
  is18plus: boolean;
}
