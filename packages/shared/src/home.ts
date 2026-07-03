// Shared contracts for DR-1 (Accueil showroom landing). Public, read-only endpoints.
// French labels live in apps/web/lib/home.ts, not here (per existing convention).

import type { CreatorRole } from './onboarding.js';

export const ANNOUNCEMENT_TYPES = ['concours', 'a_chaud', 'evenement'] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

/** GET /home/featured item — "À LA UNE" hero carousel slide. */
export interface FeaturedWork {
  id: string;
  slug: string;
  title: string;
  cover: string | null;
  meta: string;
  genre: string;
}

/** GET /home/trending-this-week item — "Populaires à chaud · cette semaine" card. */
export interface TrendingWork {
  id: string;
  slug: string;
  rank: number;
  title: string;
  cover: string | null;
  genre: string;
  likeCount: number;
  growthPct: number;
}

/** One creator card ("Top artiste"/"Top scénariste du moment"). */
export interface TopCreator {
  id: string;
  name: string;
  slug: string;
  avatar: string | null;
  role: CreatorRole;
}

/** GET /home/top-creators response. Either side may be null if no profile has that role. */
export interface TopCreatorsResponse {
  artist: TopCreator | null;
  scenarist: TopCreator | null;
}

/** GET /home/scheduled-releases item — "Sorties programmées" card. */
export interface ScheduledRelease {
  id: string;
  workId: string;
  workSlug: string;
  workTitle: string;
  chapterNumber: number;
  genre: string;
  releaseAt: string;
}

/** GET /home/ranking/all-time item — sidebar "Populaire · Classement de tous les temps" row. */
export interface RankingRow {
  id: string;
  slug: string;
  rank: number;
  title: string;
  cover: string | null;
  meta: string;
}

/** GET /home/announcements item — "ANNONCES" ribbon tag. */
export interface Announcement {
  id: string;
  type: AnnouncementType;
  label: string;
  href: string;
}
