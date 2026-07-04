// Shared contracts for DR-2 (Catalogue "Découvrir"). Public, read-only endpoints.
// French labels for statut/longueur/tri live in apps/web/lib/catalog.ts (per existing convention
// — see home.ts). Genre facet labels come from the F-20 shared vocabulary (./genres.js) instead.

import { GENRES } from './genres.js';

// GENRE facet — the FULL F-20 vocabulary (packages/shared/src/genres.json), not a curated subset
// (round-2 change: the sidebar's GenreSuggestInput lets a visitor pick ANY vocabulary entry). Facet
// KEYS (query param values, URL-encoded) are vocabulary `id`s (stable); DISPLAY labels are the
// vocabulary `fr` field (see catalogGenreLabel below). Do NOT invent a separate genre list/enum.
// Validity is checked against `GENRES` directly (see parse-catalog-query.ts), not a fixed const
// array, since any of the ~193 entries is now acceptable.

/** Display label for a genre facet id (falls back to the id itself if somehow unknown). */
export function catalogGenreLabel(id: string): string {
  return GENRES.find((g) => g.id === id)?.fr ?? id;
}

export const CATALOG_FORMATS = ['Manga', 'One-shot', 'Roman'] as const;
// audienceRating vocabulary — the Work column's own vocabulary (also read by DR-10 for 18+ gating).
// No longer a query facet on its own (see CATALOG_PUBLICS below); kept so the column's valid values
// stay documented in one place.
export const CATALOG_AUDIENCE_RATINGS = ['Tous publics', '12+', '16+', '18+'] as const;

// ── DR-10: 18+ gating contracts ───────────────────────────────────────────────
export const AUDIENCE_RATING_18PLUS = '18+' as const;
/** A work hard-gates iff its `audienceRating` is exactly '18+' (authoritative, creator-set at publish). */
export function isWork18Plus(audienceRating: string): boolean {
  return audienceRating === AUDIENCE_RATING_18PLUS;
}
/** Typed `ApiError.error` code for the logged-in-minor 403 (see AgeGateService). */
export const AGE_RESTRICTED = 'AGE_RESTRICTED';
// PUBLIC facet (round-2b: multi-select, OR-within like the other facets — 'tous' is NOT part of
// the wire format, it's just the empty/default state). 'mature' = genre/themes include a
// vocabulary entry with mature:true; '18plus' = Work.audienceRating === '18+'. Selecting both
// ORs the two conditions together; selecting none applies no filter. See
// catalog.service.ts::buildWhere.
export const CATALOG_PUBLICS = ['mature', '18plus'] as const;
export type CatalogPublic = (typeof CATALOG_PUBLICS)[number];
// « Traduit » removed round-2 (not a real language, and unused now that 'English' has a seed fixture).
export const CATALOG_LANGUAGES = ['Français', 'English', '日本語'] as const;
export const CATALOG_STATUTS = ['complete', 'en-cours'] as const; // "Œuvres complètes" / "En cours"
export const CATALOG_LONGUEURS = ['oneshot', 'court', 'long'] as const; // 1 ch. / 2-15 ch. / 15+
export const CATALOG_TRIS = ['populaires', 'nouveautes', 'mieux-notees'] as const;
export const CATALOG_PAGE_SIZE = 12; // 3-col grid x 4 rows

export type CatalogFormat = (typeof CATALOG_FORMATS)[number];
export type CatalogAudienceRating = (typeof CATALOG_AUDIENCE_RATINGS)[number];
export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[number];
export type CatalogStatut = (typeof CATALOG_STATUTS)[number];
export type CatalogLongueur = (typeof CATALOG_LONGUEURS)[number];
export type CatalogTri = (typeof CATALOG_TRIS)[number];

/** Parsed, validated query (BE input after allowlist filtering). `genre` holds vocabulary ids. */
export interface CatalogQuery {
  q?: string;
  genre: string[]; // any GENRES id, validated against the full vocabulary (not a fixed subset)
  statut?: CatalogStatut;
  format: CatalogFormat[];
  public: CatalogPublic[]; // multi-select, OR-within; empty = no filter ("Tous public")
  longueur?: CatalogLongueur;
  langue: CatalogLanguage[];
  tri: CatalogTri; // default 'populaires'
  page: number; // 1-based, clamped >= 1
}

/** One catalog card. `genre` is the display fr label (not the facet id). */
export interface CatalogWorkCard {
  id: string;
  slug: string; // -> /oeuvre/${slug}
  title: string;
  genre: string;
  chapterCount: number; // rendered "12 ch."
  likeCount: number; // formatted client-side "3,4k"
  complete: boolean; // -> "Complet" badge
  format: CatalogFormat; // 'Roman' -> Roman badge
  cover: string | null; // null -> CSS halftone placeholder
  /** DR-10: isWork18Plus(audienceRating) — client blurs + "18+" badges until the viewer is age-cleared. */
  is18plus: boolean;
}

export interface CatalogResponse {
  items: CatalogWorkCard[];
  total: number; // matches the same filter set as items
  page: number;
  pageSize: number; // = CATALOG_PAGE_SIZE
  totalPages: number;
}

/** GET /contests/active -> nullable (null = no active contest). */
export interface ActiveContest {
  id: string;
  category: string; // e.g. "CONCOURS"
  title: string; // "Prix du jeune mangaka 2026"
  subtitle: string; // "Doté par un éditeur · clôture 30 j"
  ctaLabel: string; // "Participer"
  href: string; // PUB-7 route target (link/banner only for now)
}

/** GET /catalog/editor-pick item. */
export interface EditorPickItem {
  id: string;
  workSlug: string;
  blurb: string; // "« Encre Blanche » repéré par une maison partenaire"
}

// GET /catalog/trending reuses home.ts's TrendingWork (top-3, rank 1-3, growthPct) — import it
// directly from '@encre-et-plume/shared' (already re-exported via home.js); no re-declaration here.
