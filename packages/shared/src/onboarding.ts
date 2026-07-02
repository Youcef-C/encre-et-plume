// F-17: onboarding first-run wizard. Writes onto existing F-3 profile fields;
// no new entity beyond Account.onboardedAt.

/** Step 1 creator sub-roles → Profile.creatorRoles (NOT the authz role, F-2). */
export const CREATOR_ROLES = ['scenariste', 'dessinateur'] as const;
export type CreatorRole = (typeof CREATOR_ROLES)[number];

/** Step 3 availability signal → mapped server-side onto Profile.seekingActive/seekingTargetRole (F-3). */
export const LOOKING_FOR_STATUSES = [
  'cherche_dessinateur', // "Je cherche un·e dessinateur·rice"
  'cherche_scenariste',  // "Je cherche un·e scénariste"
  'ouvert',              // "Ouvert·e aux propositions"
  'regarde',             // "Je regarde seulement"
] as const;
export type LookingForStatus = (typeof LOOKING_FOR_STATUSES)[number];

/** Step 2 curated "Genres & affinités" vocabulary (canonical set from DR-2); written to Profile.tags. */
export const ONBOARDING_GENRE_TAGS = [
  'Seinen', 'Shōnen', 'Josei', 'Shōjo', 'Fantastique', 'Tranche de vie',
  'Action', 'Thriller', 'Romance', 'Aventure', 'Horreur', 'Comédie', 'SF', 'École',
] as const;

/** POST /me/onboarding body. All fields optional; omitting all = stamp onboardedAt, no profile writes. */
export interface OnboardingRequest {
  creatorRoles?: CreatorRole[];
  tags?: string[];
  lookingFor?: LookingForStatus;
}
