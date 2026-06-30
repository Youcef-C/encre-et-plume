// French labels and helpers for F-7 global search.
// Language-neutral types live in @encre-et-plume/shared; French copy lives here.
import type { SearchResponse, SearchResultType } from '@encre-et-plume/shared';

export { search as fetchSearch } from './api';

/** French group headings — single source of truth for the overlay. */
export const SEARCH_GROUP_LABEL: Record<SearchResultType, string> = {
  works: 'Œuvres',
  creators: 'Créateur·rices',
  illustrations: 'Illustrations',
};

/** Render order matches the prototype grouping. */
export const GROUP_ORDER: SearchResultType[] = ['works', 'creators', 'illustrations'];

/** Total hits across all groups — used for empty-state detection. */
export function totalResults(res: SearchResponse): number {
  return res.works.length + res.creators.length + res.illustrations.length;
}
