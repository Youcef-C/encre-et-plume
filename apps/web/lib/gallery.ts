// DR-5 FE-1 — Gallery "Galerie" URL <-> filter state + French labels. Mirrors lib/catalog.ts, but
// category is a single-select scalar (not multi-select) — see plan §FE-1.
// Category labels come from galleryCategoryLabel()/GALLERY_CATEGORIES (shared F-20-style
// vocabulary) — only the sort labels are hand-written here, per the home.ts/catalog.ts convention.
//
// Round 2 (backend-notes.md "Round 2"): `q` (free text) + `genre` (F-20 vocabulary ids, OR-within)
// added to GET /illustrations. `q`/`genre` parsing mirrors lib/catalog.ts's parseFilters exactly
// (GENRES full-vocabulary validation, not a fixed subset).
import {
  GALLERY_CATEGORIES,
  GALLERY_CATEGORY_KEYS,
  GALLERY_TRIS,
  GENRES,
  normalizeHashtag,
  type GalleryQuery,
  type GalleryCategoryKey,
  type GalleryTri,
} from '@encre-et-plume/shared';

export const EMPTY_GALLERY_FILTERS: GalleryQuery = {
  q: undefined,
  tags: [],
  genre: [],
  category: undefined,
  tri: 'tendance',
  page: 1,
};

/** Chip row order: "Tout" (undefined = no filter) then the 5 canonical categories. */
export const CATEGORY_CHIPS: { key: GalleryCategoryKey | undefined; label: string }[] = [
  { key: undefined, label: 'Tout' },
  ...GALLERY_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
];

export const TRI_LABELS: Record<GalleryTri, string> = {
  tendance: 'Tendance',
  nouveautes: 'Nouveautés',
  populaires: 'Populaires',
};

/** Parse the URL query (or a raw URLSearchParams) into a validated GalleryQuery. */
export function parseGalleryFilters(params: URLSearchParams): GalleryQuery {
  const q = params.get('q')?.trim() || undefined;
  // F-22: freetext hashtags, each normalized through the shared helper so chip labels / query
  // params always agree with the BE `tags` filter; empties are dropped and duplicates deduped.
  const tags = [...new Set(params.getAll('tags').map((t) => normalizeHashtag(t)).filter(Boolean))];
  const genre = params.getAll('genre').filter((id) => GENRES.some((g) => g.id === id));
  const categoryRaw = params.get('category');
  const category = (GALLERY_CATEGORY_KEYS as readonly string[]).includes(categoryRaw ?? '')
    ? (categoryRaw as GalleryCategoryKey)
    : undefined;
  const triRaw = params.get('tri');
  const tri = (GALLERY_TRIS as readonly string[]).includes(triRaw ?? '') ? (triRaw as GalleryTri) : 'tendance';
  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { q, tags, genre, category, tri, page };
}

/** Serialize a GalleryQuery back into a URLSearchParams — omits defaults so shared/empty URLs stay clean. */
export function filtersToGalleryQuery(filters: GalleryQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  for (const t of filters.tags) params.append('tags', t);
  for (const g of filters.genre) params.append('genre', g);
  if (filters.category) params.set('category', filters.category);
  if (filters.tri !== 'tendance') params.set('tri', filters.tri);
  if (filters.page !== 1) params.set('page', String(filters.page));
  return params;
}
