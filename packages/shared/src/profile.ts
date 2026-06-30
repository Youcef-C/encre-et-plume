// Shared profile contracts for F-3 (creator profile & portfolio).

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
}
