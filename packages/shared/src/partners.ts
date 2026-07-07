// MC-1 — partner directory "Trouver un·e partenaire". Shared FE/BE contract for
// GET /partners (paginated portfolios) and the embedded GET /calls preview block.
import type { CreatorRole } from './onboarding.js'; // 'scenariste' | 'dessinateur' — reused, NOT redefined

// The 18 French régions — the FR-only optional sub-level of the location model. Non-French profiles
// carry a country code with NO région (the old 'Hors France' bucket is retired — see locations.ts).
export const PARTNER_REGIONS = [
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Corse',
  'Grand Est',
  'Guadeloupe',
  'Guyane',
  'Hauts-de-France',
  'Île-de-France',
  'La Réunion',
  'Martinique',
  'Mayotte',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  'Provence-Alpes-Côte d\'Azur',
] as const;
export type PartnerRegion = (typeof PARTNER_REGIONS)[number];

/** key → French label for the "Dispo ▾" dropdown. */
export const PARTNER_AVAILABILITIES = [
  { key: 'disponible', fr: 'Disponible' },
  { key: 'ouvert', fr: 'Ouvert·e aux propositions' },
  { key: 'indisponible', fr: 'Indisponible' },
] as const;
export type PartnerAvailability = (typeof PARTNER_AVAILABILITIES)[number]['key'];
export const PARTNER_AVAILABILITY_KEYS = PARTNER_AVAILABILITIES.map((a) => a.key) as PartnerAvailability[];

export const PARTNERS_PAGE_SIZE = 12;
export const PARTNERS_MAX_PAGE_SIZE = 48;

/** GET /partners item — story contract + slug (Profil link target). */
export interface PartnerCard {
  userId: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  role: CreatorRole;
  location: string | null; // composed via formatLocationFr(country, region); null when no country
  styleTags: string[]; // Profile.tags NOT in the F-20 vocabulary
  genreTags: string[]; // Profile.tags that ARE F-20 fr labels
  portfolioThumbs: string[]; // up to 2 image URLs
  availability: PartnerAvailability;
}

/**
 * GET /partners query (all optional). Arrays are sent as repeated query keys
 * (`?genres=josei&genres=seinen`). No viewer-role bias (feedback §1); no location default (empty = all).
 */
export interface PartnersQuery {
  role?: CreatorRole;
  genres?: string[]; // F-20 vocabulary ids (DR-2 precedent); OR within the facet
  locations?: string[]; // mixed continent-name | ISO alpha-2 country code | French région tokens (see locations.ts)
  availability?: PartnerAvailability;
  page?: number;
  pageSize?: number;
}

export interface PartnersResponse {
  items: PartnerCard[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /calls item (MC-1 preview; MC-4 extends the module, not this shape's meaning). */
export interface CallPreview {
  id: string;
  heading: string; // "SCÉNARISTE CHERCHE DESSINATEUR·RICE" (server-composed)
  title: string;
  tags: string[];
  authorName: string;
  closesInDays: number | null; // FE meta: "Clôture N j" when non-null
  applicationCount: number; // FE meta fallback: "N candidatures"
}

export interface CallsResponse {
  items: CallPreview[];
}
