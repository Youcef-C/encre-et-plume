# PE-6 — Branded contests "Lancer un concours"

**As a** Publisher/Editor, **I want** to launch a branded, themed contest, **so that** I can attract submissions and scout entries under my house's banner.

> Screen(s): "Lancer un concours" — contest modal (prototype `data-contest-modal`) · Priority: Could · Fidelity: Inferred

## Frontend
- "Lancer un concours" button opens the contest modal (`data-contest-modal`).
- Modal fields (inferred): theme, prize, deadline ("date limite"), and branding (the house name / logo). The contest is presented as "concours sponsorisé · présenté par [votre maison]".
- A contest detail view for the editor showing engagement (e.g. "+800 participations", "30 j de visibilité") and the list of entries to scout.
- States: form (empty/validating/submitting), live contest, closed contest. Empty entries: "Aucune participation pour l'instant."
- Loading/error: spinner on submit; inline error on failure ("Échec de la création du concours.").
- Accessibility: modal focus-trapped and labelled; deadline uses a native date input; engagement figures labelled as text.

## Backend
- `POST /editeur/contests` — body `{ theme, prize, deadline, branding }`; `sponsorEditorId` taken from the authenticated org.
- `GET /editeur/contests/{id}/entries` — list submissions for scouting.
- Entities: Contest { id, sponsorEditorOrgId, theme, prize, deadline, branding, status (draft|live|closed), createdAt }; Entry { id, contestId, creatorId, workRef, submittedAt }.
- Business rules: community submits via the existing contest participation flow ([[PUB-7]]); branding marks the contest as sponsored by the house; visibility window (e.g. 30 days) tied to the deadline. Relates to admin contest oversight ([[AD-9]]).
- Validation: deadline in the future; theme and prize required; branding restricted to the caller's verified org.
- Authorization: verified editors only ([[PE-1]]). Admin moderation/approval may apply per [[AD-9]].
- Side effects: publishes the contest to the community; may notify followers ([[F-5]]).

## Dependencies
- [[PE-1]] — access gate.
- [[PUB-7]] — community submits participations.
- [[AD-9]] — admin contest administration/oversight.

- [[AD-8]] — the contest owner may draft a linked "Actualités" article for the contest (published only after admin approval).

## Notes
- Inferred: only the `data-contest-modal` hook and the pitch line "concours sponsorisé · présenté par [votre maison]" exist; engagement figures ("+800 participations", "30 j de visibilité") are illustrative. Field set and moderation flow must be confirmed with design.
