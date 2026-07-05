# PE-6 — Contests "Lancer un concours" (branded + platform)

**As a** Publisher/Editor, **I want** to launch a branded, themed contest under my house's banner, **so that** I can attract submissions and scout entries. **And as** Editorial staff (`maintainer`) or an **Admin**, **I want** to launch a platform-run contest (no sponsoring house), **so that** the platform can run its own events (e.g. "Prix du jeune mangaka") — created by staff, no editor approval needed. *(Contest creators, 2026-07-05: verified editors, maintainers, and admins.)*

> Screen(s): "Lancer un concours" — contest modal (prototype `data-contest-modal`) · Priority: Could · Fidelity: Inferred

## Frontend
- "Lancer un concours" button opens the contest modal (`data-contest-modal`).
- Modal fields (inferred): theme, prize, deadline ("date limite"), and branding (the house name / logo). The contest is presented as "concours sponsorisé · présenté par [votre maison]".
- A contest detail view for the editor showing engagement (e.g. "+800 participations", "30 j de visibilité") and the list of entries to scout.
- States: form (empty/validating/submitting), live contest, closed contest. Empty entries: "Aucune participation pour l'instant."
- Loading/error: spinner on submit; inline error on failure ("Échec de la création du concours.").
- Accessibility: modal focus-trapped and labelled; deadline uses a native date input; engagement figures labelled as text.

## Backend
- `POST /editeur/contests` — verified editor creates a **branded** contest: body `{ theme, prize, deadline, branding }`; `sponsorEditorOrgId` taken from the authenticated org.
- `POST /admin/contests` — a `maintainer`/`admin` creates a **platform** contest: same body minus a house branding; `sponsorEditorOrgId` is null and it's marked platform-run. (See [[AD-9]] for the admin creation surface.)
- `GET /editeur/contests/{id}/entries` — list submissions for scouting.
- Entities: Contest { id, **sponsorEditorOrgId? (null = platform-run)**, **createdByAccountId**, theme, prize, deadline, branding?, status (draft|pending|live|closed), createdAt }; Entry { id, contestId, creatorId, workRef, submittedAt }.
- Business rules: community submits via the existing contest participation flow ([[PUB-7]]); a branding marks the contest as sponsored by a house, a platform contest carries the Encre & Plume banner instead; visibility window (e.g. 30 days) tied to the deadline. **Editor-created** contests may require admin approval before going live (`pending` → `live`, per [[AD-9]]); **staff-created** (maintainer/admin) contests are self-approved and go live directly.
- Validation: deadline in the future; theme and prize required; a house branding is restricted to the caller's verified org (editors); platform contests carry no house branding.
- Authorization: **create** = verified editor ([[PE-1]], branded) **or** `maintainer` / `admin` ([[F-2]], platform). Admin oversight/approval per [[AD-9]].
- Side effects: publishes the contest to the community; may notify followers ([[F-5]]).

## Dependencies
- [[PE-1]] — access gate (editor / branded path).
- [[F-2]] — role gating for the `maintainer` / `admin` platform-contest creation path.
- [[PUB-7]] — community submits participations.
- [[AD-9]] — admin contest administration/oversight + the staff creation surface.

- [[AD-8]] — the contest owner may draft a linked "Actualités" article for the contest (published only after admin approval).

## Notes
- Inferred: only the `data-contest-modal` hook and the pitch line "concours sponsorisé · présenté par [votre maison]" exist; engagement figures ("+800 participations", "30 j de visibilité") are illustrative. Field set and moderation flow must be confirmed with design.
