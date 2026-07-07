// MC-2 — algorithmic match suggestions. Shared FE/BE contract for the authenticated
// GET /matches/suggestions endpoint that feeds the "Trouver un·e partenaire" sidebar.
import type { CreatorRole } from './onboarding.js'; // 'scenariste' | 'dessinateur' — reused, NOT redefined

/** GET /matches/suggestions item — story fields + `slug` (Profil link target, PartnerCard convention). */
export interface MatchSuggestion {
  userId: string; // Account id
  slug: string; // profile link target → /{slug} (ADDITION: required by "cards link to the partner profile")
  name: string;
  avatarUrl: string | null;
  role: CreatorRole; // candidate creatorRoles[0]
  genre: string | null; // first shared F-20 genre fr-label, else candidate's first genre tag, else null
  affinityScore: number; // integer 0–100
  reason: string; // localized French, e.g. "même genre · rythme compatible"
}

export interface MatchSuggestionsResponse {
  items: MatchSuggestion[]; // ordered by affinityScore desc
  incompleteProfile: boolean; // ADDITION: true = minimum-data guard fired → FE shows "Complétez votre profil…"
}

export const MATCH_SUGGESTIONS_DEFAULT_LIMIT = 4;
export const MATCH_SUGGESTIONS_MAX_LIMIT = 8;
