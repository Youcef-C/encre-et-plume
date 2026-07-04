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

export const GALLERY_TRIS = ['tendance', 'nouveautes', 'populaires'] as const;
export type GalleryTri = (typeof GALLERY_TRIS)[number];
export const GALLERY_PAGE_SIZE = 12;

/** Parsed, validated query (BE input after allowlist filtering). */
export interface GalleryQuery {
  q?: string; // free text, matches title OR artistName (case/diacritics-insensitive contains)
  genre: string[]; // F-20 vocabulary ids, OR-within, AND with other facets; validated against the full vocabulary
  category?: GalleryCategoryKey; // undefined = "Tout" (all categories)
  tri: GalleryTri; // default 'tendance'
  page: number; // 1-based, clamped >= 1
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
}
