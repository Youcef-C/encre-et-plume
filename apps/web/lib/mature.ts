// DR-10 — "Contenu mature" warning tag signal, genre-derived only (no new trigger-warning
// taxonomy, ponytail). Distinct from `is18plus`: mature content is a warning tag, never blurred.
import { GENRES, resolveGenre } from '@encre-et-plume/shared';

function isMatureLabel(raw: string): boolean {
  const fr = resolveGenre(raw);
  return fr !== null && GENRES.some((g) => g.fr === fr && g.mature);
}

/** True when the work's genre or any hashtag resolves to a mature-flagged vocabulary entry. */
export function isMatureContent(genre: string, hashtags: string[]): boolean {
  return [genre, ...hashtags].some(isMatureLabel);
}
