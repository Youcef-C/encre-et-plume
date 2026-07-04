// F-20 — shared genre vocabulary: single source of truth for tag/genre pickers
// (profile tag cloud, "recherche active" genres) and downstream consumers
// (MC-2 matching, DR-2 catalog facets, DR-10 18+ gating).
import genresData from './genres.json';

export interface Genre {
  id: string;
  fr: string;
  en: string;
  mature: boolean;
  /** DR-10: hard 18+ gate signal (distinct from `mature`, which is warning-only). */
  plus18: boolean;
}

export const GENRES: Genre[] = genresData;

/** DR-10: fr labels of vocabulary entries carrying the hard 18+ gate flag. */
export const PLUS18_GENRE_LABELS: string[] = GENRES.filter((g) => g.plus18).map((g) => g.fr);

/** DR-10: true when any of the given fr labels (e.g. Illustration.genres) is a plus18 entry. */
export function hasPlus18Genre(frLabels: string[]): boolean {
  return frLabels.some((label) => PLUS18_GENRE_LABELS.includes(label));
}

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

/**
 * Returns the canonical vocabulary **`id`** for an input matching any genre's `fr` OR `en`
 * (case- & diacritics-insensitive, mirrors `resolveGenre`), else null. Used by DR-2's genre picker
 * to convert a user-facing fr label into the id stored in the catalog URL/query.
 */
export function resolveGenreId(input: string): string | null {
  const key = foldGenre(input);
  if (!key) return null;
  const match = GENRES.find((g) => foldGenre(g.fr) === key || foldGenre(g.en) === key);
  return match ? match.id : null;
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
