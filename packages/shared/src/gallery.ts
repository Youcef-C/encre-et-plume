// Shared contracts for DR-5 (Illustration gallery "Galerie"). Public, read-only endpoints.
// Category vocabulary is the chip list (authoritative per plan §BE-2) — NOT the prototype's
// decorative `data-illus-cat` card labels ("Planche"/"Illustration"), which predate this facet set.

export const GALLERY_CATEGORIES = [
  { key: 'personnages', label: 'Personnages' },
  { key: 'couvertures', label: 'Couvertures' },
  { key: 'decors', label: 'Décors' },
  { key: 'fanart', label: 'Fan-art' },
  { key: 'process', label: 'Process' },
] as const;

export const GALLERY_CATEGORY_KEYS = ['personnages', 'couvertures', 'decors', 'fanart', 'process'] as const;
export type GalleryCategoryKey = (typeof GALLERY_CATEGORY_KEYS)[number];

/** Display label for a category key (falls back to the key itself if somehow unknown). */
export function galleryCategoryLabel(key: string): string {
  return GALLERY_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// CS-13 (R3): canonical licence vocabulary (prototype line 3534). A PATCH `license` must be one of
// these (or null). Both FE (OnBrandSelect options) and BE (validation) consume this single source.
export const ILLUSTRATION_LICENSES = ['© Tous droits réservés', 'CC BY', 'CC BY-NC'] as const;
export type IllustrationLicense = (typeof ILLUSTRATION_LICENSES)[number];

export const GALLERY_TRIS = ['tendance', 'nouveautes', 'populaires'] as const;
export type GalleryTri = (typeof GALLERY_TRIS)[number];
export const GALLERY_PAGE_SIZE = 12;

/** Parsed, validated query (BE input after allowlist filtering). */
export interface GalleryQuery {
  q?: string; // free text, matches title OR artistName (case/diacritics-insensitive contains)
  tags: string[]; // F-22: freetext hashtags, each normalized (normalizeHashtag) — EXACT tokens AND-matched on Illustration.hashtags (`hasEvery`)
  genre: string[]; // F-20 vocabulary ids, OR-within, AND with other facets; validated against the full vocabulary
  category?: GalleryCategoryKey; // undefined = "Tout" (all categories)
  tri: GalleryTri; // default 'tendance'
  page: number; // 1-based, clamped >= 1
  collection?: string; // DR-12: filter to a collection Work id (opaque, no vocabulary check)
  artist?: string; // CS-13 (R1): Account.profileSlug — filter to one artist's illustrations ("Voir tout")
}

export interface GalleryIllustrationCard {
  id: string; // -> /illustration/:id (DR-6)
  title: string;
  artistName: string;
  artistSlug: string | null; // -> /:artistSlug (F-3 profile) when linked, else null
  category: GalleryCategoryKey;
  categoryLabel: string; // French display label
  likeCount: number; // formatted client-side ("3,4k")
  thumbnail: string | null; // null -> CSS halftone placeholder
  /** DR-10: true iff any of `genres` is a plus18 vocabulary entry (hasPlus18Genre) — client blurs + badges. */
  is18plus: boolean;
}

export interface GalleryFeatureCard extends GalleryIllustrationCard {
  rank: number; // 1 | 2 -> "TENDANCE #1/#2"
}

export interface GallerySummary {
  illustrationCount: number;
  artistCount: number;
}

export interface GalleryListResponse {
  items: GalleryIllustrationCard[];
  total: number; // filtered set
  page: number;
  pageSize: number; // = GALLERY_PAGE_SIZE
  totalPages: number;
  summary: GallerySummary; // global, unfiltered (header — derived counts)
}

/** GET /illustrations/:id/preview */
export interface GalleryPreview {
  id: string;
  title: string;
  artistName: string;
  artistSlug: string | null;
  category: GalleryCategoryKey;
  categoryLabel: string;
  likeCount: number;
  image: string | null; // larger image (null -> halftone placeholder)
  /** DR-10: same signal as GalleryIllustrationCard.is18plus. */
  is18plus: boolean;
}

// DR-6: illustration detail screen ("/illustration/:id"). Additive — nothing above changes.

import type { CollectionChip } from './collections.js';

/** DR-12: minimal publish endpoint (POST /illustrations) — the interim CS-3 stand-in. */
export interface PublishIllustrationRequest {
  title: string;
  category: GalleryCategoryKey;
  mediaId?: string; // F-10 media (kind 'illustration', ready) -> Illustration.image; omitted -> halftone
  genres?: string[]; // F-20 vocabulary ids, stored as fr labels
  hashtags?: string[]; // F-22 freetext chips -> Illustration.hashtags (normalized server-side)
  description?: string;
  collectionIds?: string[]; // collection Work ids owned by the caller (assign-at-publish)
}
export interface PublishIllustrationResponse {
  id: string;
}

/** DR-6/DR-12 (SC-3): visibility maps to the existing `publishedAt` convention (null = not public). */
export type IllustrationVisibility = 'public' | 'private';

/**
 * PATCH /illustrations/:id — owner-only partial edit of the illustration itself. Every key is
 * optional; an absent key leaves that field untouched. Response is the full `IllustrationDetail`.
 */
export interface UpdateIllustrationRequest {
  title?: string; // trimmed; empty -> 400 "Un titre est requis"
  category?: GalleryCategoryKey; // 400 "Catégorie invalide" otherwise
  description?: string | null; // ''/null -> null
  hashtags?: string[]; // normalizeHashtags, replace-all (iteration-2 semantics)
  tools?: string | null; // ''/null -> null
  license?: string | null; // null -> BE display default "© Tous droits réservés"; non-null must be in ILLUSTRATION_LICENSES (400 otherwise)
  visibility?: IllustrationVisibility; // 'private' -> publishedAt=null; 'public' -> republish (D21)
  image?: string; // CS-13 (R2): F-10 Media.id (kind 'illustration', ready, caller-owned) -> replaces Illustration.image + width/height
}

/** Artist block on the illustration detail response. */
export interface IllustrationArtist {
  id: string | null; // Account id, null when the fixture has no linked Account
  name: string; // always present (denormalized artistName)
  slug: string | null; // Account.profileSlug -> /:slug (F-3), null -> plain text
  role: string; // French role label, e.g. "Dessinateur·rice" (default when unlinked)
  city: string | null; // Account/Profile city, else null
  avatar: string | null; // null -> CSS halftone placeholder
}

/** GET /illustrations/:id */
export interface IllustrationDetail {
  id: string;
  title: string;
  description: string | null;
  category: GalleryCategoryKey;
  categoryLabel: string; // galleryCategoryLabel()
  genres: string[]; // F-22: F-20 vocabulary fr labels — clickable genre chips -> /galerie?genre=<id> (was server-side-only for is18plus)
  hashtags: string[]; // rendered as "#{tag}" chips
  image: string | null; // large artwork (null -> halftone)
  dimensionsLabel: string | null; // "2480 × 3508" when both width & height set, else null
  tools: string | null;
  license: string | null; // BE default applied server-side: "© Tous droits réservés" when null
  likeCount: number;
  publishedAt: string | null; // ISO 8601
  artist: IllustrationArtist;
  /** DR-10: true iff any genre is a plus18 entry — hard-gates the read via AgeGateService. */
  is18plus: boolean;
  /** DR-12: collections this illustration belongs to (chips -> /oeuvre/:slug). */
  collections: CollectionChip[];
}
