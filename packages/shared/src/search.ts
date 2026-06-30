// Shared search contracts for F-7 (global search).
// Language-neutral: French group labels live in apps/web/lib/search.ts, not here.

export const SEARCH_RESULT_TYPES = ['works', 'creators', 'illustrations'] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

/** Minimum query length before the endpoint fires (shared by FE debounce-gate and BE validation). */
export const SEARCH_MIN_QUERY_LENGTH = 2;

/** One search hit — shape is corpus-agnostic so FE renders all groups uniformly. */
export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  /** displayName for creators, title for works/illustrations. */
  title: string;
  /** avatar for creators, cover image for works/illustrations. null when not set. */
  thumbnail: string | null;
  /** Client-side route, e.g. `/${slug}` or `/works/${slug}`. */
  route: string;
}

/** GET /search response — always contains all three groups (empty arrays when no corpus or below-min query). */
export interface SearchResponse {
  works: SearchResultItem[];
  creators: SearchResultItem[];
  illustrations: SearchResultItem[];
}
