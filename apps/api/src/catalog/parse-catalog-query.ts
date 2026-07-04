import {
  CATALOG_FORMATS,
  CATALOG_LANGUAGES,
  CATALOG_LONGUEURS,
  CATALOG_PUBLICS,
  CATALOG_STATUTS,
  CATALOG_TRIS,
  GENRES,
  type CatalogQuery,
} from '@encre-et-plume/shared';

/** Raw Express/Nest query object — every value may be a string, a string[], or undefined. */
type RawQuery = Record<string, unknown>;

const GENRE_IDS = new Set(GENRES.map((g) => g.id));

/**
 * Parses the raw `GET /catalog` query into a validated `CatalogQuery`. Unknown facet values are
 * silently dropped (not rejected); `tri` defaults to 'populaires'; `public` is multi-select
 * (OR-within, like `genre`/`format`/`langue`) and defaults to an empty array — 'tous' is not part
 * of the wire format, so it's dropped like any other unknown value (empty = no filter); `page`
 * clamps to >= 1 (non-numeric or <1 input → 1). Public read endpoint — no auth here, this is input
 * sanitization only.
 */
export function parseCatalogQuery(raw: RawQuery): CatalogQuery {
  return {
    q: typeof raw['q'] === 'string' && raw['q'] !== '' ? raw['q'].slice(0, 100) : undefined, // L: cap length
    genre: toArray(raw['genre']).filter((v): v is string => typeof v === 'string' && GENRE_IDS.has(v)),
    statut: allowlistScalar(raw['statut'], CATALOG_STATUTS),
    format: allowlist(raw['format'], CATALOG_FORMATS),
    public: allowlist(raw['public'], CATALOG_PUBLICS),
    longueur: allowlistScalar(raw['longueur'], CATALOG_LONGUEURS),
    langue: allowlist(raw['langue'], CATALOG_LANGUAGES),
    tri: allowlistScalar(raw['tri'], CATALOG_TRIS) ?? 'populaires',
    page: clampPage(raw['page']),
  };
}

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function allowlist<T extends string>(value: unknown, vocabulary: readonly T[]): T[] {
  return toArray(value).filter((v): v is T => typeof v === 'string' && (vocabulary as readonly string[]).includes(v));
}

/** Only accepts a scalar (a single string) — an array value (wrong shape) is treated as unknown. */
function allowlistScalar<T extends string>(value: unknown, vocabulary: readonly T[]): T | undefined {
  return typeof value === 'string' && (vocabulary as readonly string[]).includes(value) ? (value as T) : undefined;
}

function clampPage(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
