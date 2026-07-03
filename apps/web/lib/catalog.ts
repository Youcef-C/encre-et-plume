// DR-2 — Catalog "Découvrir" URL <-> filter state + French labels.
// Types come from @encre-et-plume/shared; French copy lives here (see lib/home.ts convention).
// Genre labels are the ONE exception — they come from catalogGenreLabel()/GENRES (F-20 vocabulary),
// never a hand-written map here (per backend-notes.md "Genre facet semantics").
//
// Round 2 (2026-07-03, user-revised sidebar — see plan.md §8 R2-1/R2-5): GENRE is now the full F-20
// vocabulary (validated against `GENRES`, not a fixed 6-id list); THÈMES is gone entirely; LANGUE
// drops 'Traduit'.
// Round 2b: PUBLIC reverted to multi-select `('mature'|'18plus')[]`, OR-within like every other
// facet — 'tous' is not a wire value at all, just the sidebar's "nothing selected" display state.
import {
  GENRES,
  catalogGenreLabel,
  CATALOG_FORMATS,
  CATALOG_LANGUAGES,
  CATALOG_STATUTS,
  CATALOG_LONGUEURS,
  CATALOG_TRIS,
  CATALOG_PUBLICS,
  type CatalogQuery,
  type CatalogStatut,
  type CatalogLongueur,
  type CatalogTri,
  type CatalogPublic,
} from '@encre-et-plume/shared';

export const EMPTY_FILTERS: CatalogQuery = {
  genre: [],
  format: [],
  public: [],
  langue: [],
  tri: 'populaires',
  page: 1,
};

export const STATUT_LABELS: Record<CatalogStatut, string> = {
  complete: 'Œuvres complètes',
  'en-cours': 'En cours',
};

export const LONGUEUR_LABELS: Record<CatalogLongueur, string> = {
  oneshot: 'One-shot (1 ch.)',
  court: 'Court (2–15 ch.)',
  long: 'Long (15 ch. et +)',
};

export const TRI_LABELS: Record<CatalogTri, string> = {
  populaires: 'Populaires',
  nouveautes: 'Nouveautés',
  'mieux-notees': 'Mieux notées',
};

export const PUBLIC_LABELS: Record<CatalogPublic, string> = {
  mature: 'Mature',
  '18plus': '+18',
};

/** Display label for the "nothing selected" PUBLIC chip — not a wire value (round 2b). */
export const PUBLIC_ALL_LABEL = 'Tous public';

function keepKnown<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** Parse the URL query (or a raw URLSearchParams) into a validated CatalogQuery. */
export function parseFilters(params: URLSearchParams): CatalogQuery {
  const q = params.get('q')?.trim() || undefined;
  const statutRaw = params.get('statut');
  const statut = (CATALOG_STATUTS as readonly string[]).includes(statutRaw ?? '')
    ? (statutRaw as CatalogStatut)
    : undefined;
  const longueurRaw = params.get('longueur');
  const longueur = (CATALOG_LONGUEURS as readonly string[]).includes(longueurRaw ?? '')
    ? (longueurRaw as CatalogLongueur)
    : undefined;
  const triRaw = params.get('tri');
  const tri = (CATALOG_TRIS as readonly string[]).includes(triRaw ?? '') ? (triRaw as CatalogTri) : 'populaires';
  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    q,
    genre: params.getAll('genre').filter((id) => GENRES.some((g) => g.id === id)),
    statut,
    format: keepKnown(params.getAll('format'), CATALOG_FORMATS),
    public: keepKnown(params.getAll('public'), CATALOG_PUBLICS),
    longueur,
    langue: keepKnown(params.getAll('langue'), CATALOG_LANGUAGES),
    tri,
    page,
  };
}

/** Serialize a CatalogQuery back into a URLSearchParams — omits defaults so shared/empty URLs stay clean. */
export function filtersToQuery(filters: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  for (const g of filters.genre) params.append('genre', g);
  if (filters.statut) params.set('statut', filters.statut);
  for (const f of filters.format) params.append('format', f);
  for (const p of filters.public) params.append('public', p);
  if (filters.longueur) params.set('longueur', filters.longueur);
  for (const l of filters.langue) params.append('langue', l);
  if (filters.tri !== 'populaires') params.set('tri', filters.tri);
  if (filters.page !== 1) params.set('page', String(filters.page));
  return params;
}

export interface ActiveChip {
  key: string;
  label: string;
  ariaLabel: string;
  remove: (filters: CatalogQuery) => CatalogQuery;
}

/** Removable "FILTRES ACTIFS" chip descriptors — one per active facet value (statut/longueur count
 * as one each, since they're single-select; genre/format/public/langue are multi-select). */
export function activeFilterChips(filters: CatalogQuery): ActiveChip[] {
  const chips: ActiveChip[] = [];

  const multiFacets: { key: 'genre' | 'format' | 'public' | 'langue'; label: (v: string) => string }[] = [
    { key: 'genre', label: catalogGenreLabel },
    { key: 'format', label: (v) => v },
    { key: 'public', label: (v) => PUBLIC_LABELS[v as CatalogPublic] },
    { key: 'langue', label: (v) => v },
  ];
  for (const facet of multiFacets) {
    const values = filters[facet.key];
    for (const value of values) {
      const label = facet.label(value);
      chips.push({
        key: `${facet.key}:${value}`,
        label,
        ariaLabel: `Retirer le filtre ${label}`,
        remove: (f) => ({ ...f, [facet.key]: f[facet.key].filter((v) => v !== value) }),
      });
    }
  }

  if (filters.statut) {
    const label = STATUT_LABELS[filters.statut];
    chips.push({
      key: 'statut',
      label,
      ariaLabel: `Retirer le filtre ${label}`,
      remove: (f) => ({ ...f, statut: undefined }),
    });
  }

  if (filters.longueur) {
    const label = LONGUEUR_LABELS[filters.longueur];
    chips.push({
      key: 'longueur',
      label,
      ariaLabel: `Retirer le filtre ${label}`,
      remove: (f) => ({ ...f, longueur: undefined }),
    });
  }

  return chips;
}
