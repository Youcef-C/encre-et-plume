import { GALLERY_CATEGORY_KEYS, GALLERY_TRIS, GENRES, type GalleryQuery } from '@encre-et-plume/shared';

/** Raw Express/Nest query object — every value may be a string, a string[], or undefined. */
type RawQuery = Record<string, unknown>;

// Round 2: genre facet, same full-vocabulary validation DR-2's catalog uses (not a fixed subset).
const GENRE_IDS = new Set(GENRES.map((g) => g.id));

/**
 * Parses the raw `GET /illustrations` query into a validated `GalleryQuery`. Unknown values are
 * silently dropped (not rejected — public read endpoint, no 400s): an unknown/absent `category`
 * falls back to `undefined` ("Tout" — no filter); `tri` defaults to `'tendance'`; `page` clamps to
 * >= 1 (non-numeric or <1 input -> 1); `genre` is multi-select (OR-within), validated against the
 * full F-20 vocabulary; `q` is free text, passed through untouched (empty string -> undefined).
 */
export function parseGalleryQuery(raw: RawQuery): GalleryQuery {
  return {
    q: typeof raw['q'] === 'string' && raw['q'] !== '' ? raw['q'].slice(0, 100) : undefined, // L: cap length
    genre: toArray(raw['genre']).filter((v): v is string => typeof v === 'string' && GENRE_IDS.has(v)),
    category: allowlistScalar(raw['category'], GALLERY_CATEGORY_KEYS),
    tri: allowlistScalar(raw['tri'], GALLERY_TRIS) ?? 'tendance',
    page: clampPage(raw['page']),
  };
}

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Only accepts a scalar (a single string) — an array value (wrong shape) is treated as unknown. */
function allowlistScalar<T extends string>(value: unknown, vocabulary: readonly T[]): T | undefined {
  return typeof value === 'string' && (vocabulary as readonly string[]).includes(value) ? (value as T) : undefined;
}

function clampPage(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
