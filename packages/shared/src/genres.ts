// F-20 — shared genre vocabulary: single source of truth for tag/genre pickers
// (profile tag cloud, "recherche active" genres) and downstream consumers
// (MC-2 matching, DR-2 catalog facets, DR-10 18+ gating).
import genresData from './genres.json';

export interface Genre {
  id: string;
  fr: string;
  en: string;
  mature: boolean;
}

export const GENRES: Genre[] = genresData;

/** NFD fold: strips diacritics (incl. the ō macron), lowercases, trims. */
function foldGenre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Returns the canonical `fr` label for an input matching any genre's `fr` OR
 * `en` (case- & diacritics-insensitive), else null.
 */
export function resolveGenre(input: string): string | null {
  const key = foldGenre(input);
  if (!key) return null;
  const match = GENRES.find((g) => foldGenre(g.fr) === key || foldGenre(g.en) === key);
  return match ? match.fr : null;
}

/** Canonicalize a list to fr labels, drop unknowns, dedupe (order preserved). */
export function normalizeGenres(inputs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of inputs) {
    const fr = resolveGenre(raw);
    if (fr && !seen.has(fr)) {
      seen.add(fr);
      out.push(fr);
    }
  }
  return out;
}
