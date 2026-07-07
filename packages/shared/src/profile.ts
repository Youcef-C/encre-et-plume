// Shared profile contracts for F-3 (creator profile & portfolio).
import type { PartnerRegion, PartnerAvailability } from './partners.js'; // MC-1 directory columns
import type { CreatorRole } from './onboarding.js'; // F-2/F-17 creator sub-roles

/** Creator crafts a profile may seek to pair with (seeking.targetRole). MC-2 matching input. */
export const SEEKING_TARGET_ROLES = ['scénariste', 'dessinateur·rice'] as const;
export type SeekingTargetRole = (typeof SEEKING_TARGET_ROLES)[number];

/** "Looking for / recherche" status. active=false → no banner shown. */
export interface ProfileSeeking {
  active: boolean;
  targetRole: SeekingTargetRole | null;
  genres: string[];
  projectLength: string | null;
  /** Server-composed French banner, e.g. "Cherche actuellement un·e scénariste — Seinen / Thriller, projet long". Null when inactive. */
  text: string | null;
}

/** Aggregate counters. Sourced from PUB-4/DR-9/DR-3/MR-1; 0 until those epics land (plan D4). */
export interface ProfileCounters {
  followers: number;
  likes: number;
  works: number;
  supporters: number;
}

export interface PortfolioItemResponse {
  id: string;
  image: string;
  caption: string | null;
  order: number;
}

/** GET /profiles/{slug} response. displayName/avatar/slug come from Account; rest from Profile. */
export interface ProfileResponse {
  slug: string;
  displayName: string;
  avatar: string | null;
  coverImage: string | null;
  /** Composed: [specialty, city].filter(Boolean).join(' · '). Craft prefix deferred (plan D2). */
  roleLine: string | null;
  specialty: string | null;
  city: string | null;
  bio: string | null;
  seeking: ProfileSeeking;
  tags: string[];
  counters: ProfileCounters;
  /** F-2/F-17 creator sub-roles the user self-declares (MC-1 §9: editable + shown on the profile). */
  creatorRoles: CreatorRole[];
  /** MC-1 location model: country = ISO alpha-2 (null if unset); region = FR-only sub-level (null off France). */
  country: string | null;
  region: PartnerRegion | null;
  availability: PartnerAvailability;
}

/** PATCH /profiles/me body. All fields optional; only provided fields change. */
export interface UpdateProfileRequest {
  tags?: string[];
  seeking?: {
    active?: boolean;
    targetRole?: SeekingTargetRole | null;
    genres?: string[];
    projectLength?: string | null;
  };
  bio?: string | null;
  city?: string | null;
  specialty?: string | null;
  creatorRoles?: CreatorRole[]; // MC-1 §9: user-defined creator type(s)
  country?: string | null; // MC-1: ISO alpha-2
  region?: PartnerRegion | null; // MC-1: FR-only sub-level
  availability?: PartnerAvailability; // MC-1
}
