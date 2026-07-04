import type { RankingRow } from '@encre-et-plume/shared';

/** Bounded top-N; the prototype draws no pager for the all-time ranking (YAGNI). */
export const RANKING_LIMIT = 50;

/** Deterministic order with a stable tiebreak — single source shared by RankingService and HomeService. */
export const RANKING_ORDER_BY = [{ likeCount: 'desc' as const }, { id: 'asc' as const }];

// ponytail: score = likeCount today; DR-9 makes it likeCount + readCount + favoriteCount in THIS one place.
export function rankingScore(w: { likeCount: number }): number {
  return w.likeCount;
}

/** "Tout" = no genre filter (empty/undefined genre → {}). */
export function rankingWhere(genre?: string): { genre?: string } {
  return genre && genre.trim() ? { genre } : {};
}

export function toRankingRow(w: { id: string; slug: string; title: string; coverImage: string | null; meta: string }, index: number): RankingRow {
  return { id: w.id, slug: w.slug, rank: index + 1, title: w.title, cover: w.coverImage, meta: w.meta };
}
