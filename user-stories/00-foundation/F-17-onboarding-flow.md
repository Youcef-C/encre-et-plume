# F-17 — Onboarding flow (first run)

**As a** newly signed-up user, **I want** a short first-run flow to say who I am (lecteur·rice, scénariste, dessinateur·rice), pick my genres, and state what I'm looking for, **so that** my profile and the matching engine start useful instead of empty.

> Screen(s): none drawn (post-signup steps — to be designed) · Priority: Should · Fidelity: Inferred

## Frontend
- Triggered once right after **e-mail confirmation** — the [[F-11]] landing redirects here with the fresh session (signup itself ends on the link-sent page, not in the app); skippable at every step ("Passer") — onboarding never blocks the app.
- Step 1 — **"Qui êtes-vous ?"**: pick one or both creator roles ("Scénariste", "Dessinateur·rice") or "Je suis là pour lire" (reader). Sets the profile's creator sub-roles ([[F-3]]) — NOT the authz role, which stays `utilisateur` ([[F-2]]).
- Step 2 — **"Vos genres & affinités"**: multi-select genre/affinity tags (same vocabulary as the profile's "Genres & affinités", [[F-3]]).
- Step 3 (creators only) — **"Que cherchez-vous ?"**: looking-for status (e.g. "Je cherche un·e dessinateur·rice", "Je cherche un·e scénariste", "Ouvert·e aux propositions", "Je regarde seulement") — the availability signal [[MC-1]]/[[MC-2]] surface.
- Completion: "C'est parti !" → home; a dismissible profile-completion hint may point to the full profile editor ([[F-3]]).
- States: per-step selection state; skip; saving; error (toast, selections preserved); already-onboarded users never see it again.
- Accessibility: steps are a labelled dialog/wizard with progress announced; choices are labelled toggle groups; fully keyboard-navigable.
- Responsive: wizard usable at 375/768/1280 px; tap targets ≥ 44 px.

## Backend
- `Account.onboardedAt?` timestamp (null = show onboarding once).
- **POST /me/onboarding** — `{ creatorRoles?: ("scenariste"|"dessinateur")[], tags?: string[], lookingFor?: LookingForStatus }` — writes onto the existing profile fields ([[F-3]]: sub-roles, "Genres & affinités" tags, availability/looking-for) and sets `onboardedAt`. Skipping sets `onboardedAt` with no profile writes.
- Business rules: idempotent — replays overwrite the same fields; never creates a second profile; no new entity beyond the timestamp (data lives on the [[F-3]] profile).
- Validation: roles/tags/status from allowed vocabularies (shared contracts).
- Authorization: authenticated; strictly self ([[F-2]]).
- Side effects: profile fields immediately feed matching ([[MC-2]]) and the partner directory ([[MC-1]]); `ActionLogService.record()` emits `profile_update` ([[AD-10]]).
- Shared contracts in `packages/shared/src/onboarding.ts` (vocabularies + DTO) + barrel export.

## Dependencies
- [[F-1]] — runs once after signup (its "no onboarding screen" note is addressed by this story).
- [[F-3]] — the profile fields onboarding writes.
- [[MC-1]] / [[MC-2]] — consumers of the seeded tags + looking-for status.

## Notes
- Inferred: no prototype frame — the wizard reuses the drawn modal/chip patterns ("Genres & affinités" chips exist on the profile) and manga-zine tokens.
- Deliberately thin: three steps, all skippable, no new data model — it front-loads existing [[F-3]] fields rather than inventing new ones.
