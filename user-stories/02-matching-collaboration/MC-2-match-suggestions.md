# MC-2 — Algorithmic match suggestions

**As a** Creator, **I want** the platform to suggest partners by style and genre affinity, **so that** I can discover strong matches without manually filtering.

> Screen(s): "Trouver un·e partenaire" (sidebar "Suggestions — par affinité de style & genre") · Priority: Should · Fidelity: Explicit

## Frontend
- Sidebar panel on the partner directory titled "Suggestions — par affinité de style & genre".
- Suggestion cards, each with: avatar, name, role · genre line, an affinity score as a percentage (e.g. "94%", "88%"), and a human-readable match-reason line (e.g. "même genre · rythme compatible", "style proche de vos refs").
- Cards link to the partner profile ([[F-3]]) and expose a way to propose a collab ([[MC-3]]) consistent with directory cards.
- States: loading skeleton; empty state when no suggestions yet (e.g. "Complétez votre profil pour recevoir des suggestions." when profile tags are sparse); error state with retry.
- Interactions: suggestions reflect the viewer's self-role and may refresh when profile/filters change.
- Accessibility: affinity percentage announced with context (e.g. "affinité 94%"); reason line readable as text; cards keyboard-navigable.

## Backend
- `GET /matches/suggestions` — match suggestions for the current creator.
  - Query params: optional `limit`, `viewerRole`.
  - Response: `{ items: [{ userId, name, avatarUrl, role, genre, affinityScore (0–100), reason (localized string) }] }`, ordered by descending score.
- Inputs to scoring: current user's profile tags ([[F-3]]) — genre, style, rhythm/cadence preferences — compared against candidate creators' tags.
- Output: a numeric `affinityScore` and a human-readable `reason` string explaining the top contributing factors.
- Business rules: heuristic scoring (formula left open / tunable); exclude the viewer, existing close connections if desired, and banned users ([[AD-6]]); prefer complementary roles relative to the viewer's self-role; minimum-data guard returns empty when the viewer's profile lacks tags.
- Validation: clamp `limit` to a max.
- Authorization: authenticated creators only; scoped to the requesting user.
- Side effects: none (read-only). May log impressions for future tuning (optional, out of scope).

## Dependencies
- [[F-3]] — profile tags (genre, style, rhythm) are the scoring inputs.
- [[MC-1]] — rendered as the sidebar of the partner directory.
- [[MC-3]] — propose a collab from a suggestion card.

## Notes
- Explicit: sidebar title, card fields (avatar, name, role·genre, % score, reason line), example scores/reasons, and that suggestions come from style/genre affinity.
- Inferred: empty/error states and the optional impression logging. Scoring is intentionally heuristic — inputs and outputs are specified; the exact formula is left open per the design.
