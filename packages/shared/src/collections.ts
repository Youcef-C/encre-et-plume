// DR-12: illustration collections "Collection". A collection is a Work with format
// 'Illustration(s)', owned via a WorkCreator row, with an ordered many-to-many join to Illustration.
// Public read of a collection; create/edit/delete/membership/reorder require auth + creator role +
// ownership. FE `null` cover -> CSS halftone placeholder (never a broken <img>).

import type { GalleryIllustrationCard } from './gallery.js';

/** The raw Work.format value that identifies a collection (added to CATALOG_FORMATS). */
export const WORK_FORMAT_ILLUSTRATIONS = 'Illustration(s)' as const;

/** Chip reference (DR-6 illustration detail, artist profile cards). */
export interface CollectionRef {
  id: string; // = Work.id (the Galerie filter passes this)
  slug: string; // = Work.slug (humans share this -> /oeuvre/:slug)
  title: string;
}

export interface CollectionSummary extends CollectionRef {
  cover: string | null; // Work.coverImage, null -> halftone fallback
  count: number; // membership row count
}

/** One member illustration of a collection, in `order`. */
export interface CollectionItemDto {
  id: string; // Illustration.id -> /illustration/:id (DR-6)
  title: string;
  thumbnail: string | null; // Illustration.image, null -> halftone
  likeCount: number;
  category: string; // GalleryCategoryKey
  categoryLabel: string; // French display label
  order: number;
  is18plus: boolean; // hasPlus18Genre(genres)
}

export interface SoutienTier {
  name: string;
  priceCents: number; // €/mois
}
export interface SoutienGoalInput {
  title: string;
  targetCents: number; // -> FundingGoal rows
}
export interface RevenueSplitEntry {
  accountId: string;
  pct: number; // Σ pct === 100 when non-empty
}
/** Raw Soutien config persisted on Work.soutien (MR-1/MR-2/CS-10 normalize later). */
export interface SoutienConfig {
  tiers: SoutienTier[];
  allowDonations: boolean;
  revenueSplit: RevenueSplitEntry[];
}

export type CollectionCoverInput = { mediaId: string } | { illustrationId: string };

export interface CreateCollectionRequest {
  title: string;
  description?: string;
  genres?: string[]; // F-20 vocabulary ids (genres[0] -> Work.genre, rest -> Work.themes)
  hashtags?: string[]; // F-22 freetext chips -> Work.hashtags (normalized server-side)
  cover?: CollectionCoverInput;
  contestId?: string;
  tiers?: SoutienTier[];
  allowDonations?: boolean;
  goals?: SoutienGoalInput[];
  revenueSplit?: RevenueSplitEntry[];
}

export interface UpdateCollectionRequest {
  // all optional; cover: null clears to the halftone fallback
  title?: string;
  description?: string | null;
  genres?: string[];
  hashtags?: string[]; // replace-all when present (normalized server-side)
  cover?: CollectionCoverInput | null;
  contestId?: string | null;
  tiers?: SoutienTier[];
  allowDonations?: boolean;
  goals?: SoutienGoalInput[];
  revenueSplit?: RevenueSplitEntry[];
}

export interface CollectionDetail extends CollectionSummary {
  description: string | null;
  genres: string[]; // fr labels (genre + themes)
  hashtags: string[]; // F-22 freetext chips (public — searchable by design; seeds the manage form)
  items: CollectionItemDto[]; // ordered
  owner: { id: string; name: string; slug: string | null };
  // owner-only fields (revenue split is sensitive) — omitted for public/other viewers
  contestId?: string | null;
  soutien?: SoutienConfig | null;
  fundingGoals?: { id: string; title: string; targetCents: number }[];
}

// iteration 2 — Galerie "Collections" facet (mirrors the DR-5 gallery query shape).
export interface CollectionsListQuery {
  q?: string; // free text, matches collection title OR artist displayName (insensitive contains)
  tags: string[]; // F-22 normalized hashtags, EXACT tokens AND-matched on Work.hashtags (hasEvery)
  genre: string[]; // F-20 vocabulary ids, OR-within (Work.genre OR themes)
  page: number; // 1-based, clamped >= 1
}
export interface CollectionCard extends CollectionSummary {
  artistName: string; // first creator's display name
}
export interface CollectionsListResponse {
  items: CollectionCard[];
  total: number;
  page: number;
  pageSize: number; // = GALLERY_PAGE_SIZE
  totalPages: number;
}

export interface AddCollectionIllustrationRequest {
  illustrationId: string;
}
export interface ReorderCollectionRequest {
  illustrationIds: string[];
}
export interface ProfileCollectionsResponse {
  collections: CollectionSummary[];
  illustrations: GalleryIllustrationCard[]; // standalone (uncollected) illustrations
}
