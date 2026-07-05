# PE-6 — Contests "Lancer un concours" (branded + platform)

**As a** Publisher/Editor, **I want** to launch a branded, themed contest under my house's banner, **so that** I can attract submissions and scout entries. **And as** Editorial staff (`maintainer`) or an **Admin**, **I want** to launch a platform-run contest (no sponsoring house), **so that** the platform can run its own events (e.g. "Prix du jeune mangaka") — created by staff, no editor approval needed. *(Contest creators, 2026-07-05: verified editors, maintainers, and admins.)*

> Screen(s): "Lancer un concours" — contest modal (prototype `data-contest-modal`) · Priority: Could · Fidelity: Inferred

## Frontend
- "Lancer un concours" button opens the contest modal (`data-contest-modal`), extended (user-specified 2026-07-05) to capture as complete a brief as possible. On-brand controls throughout ([[F-20]] rule: `OnBrandSelect`/`OnBrandCheckbox`, `GenreChip`/`GenreSuggestInput` for genres, never bare native selects/free-text-for-categorized-fields). Fields:
  - **Titre** + **thème / description** (the pitch).
  - **Type de contenu jugé** (multi-select): `Manga` / `Roman` / `Illustration` — which entry kinds the contest accepts (reuses the [[DR-2]] `format` + `Illustration` vocabulary).
  - **Format / longueur** (multi-select, contextual to the content types): `One-shot` / `Court (2–15 ch.)` / `Long (15+ ch.)` / `Histoire complète` for works (reuses the [[DR-2]] `longueur` facet), `Illustration seule` / `Série` for illustrations.
  - **Genre(s)** — [[F-20]] vocabulary picker (`GenreChip` + `GenreSuggestInput`), multi-select; may be left as « Tous genres ».
  - **Niveau des participant·es** (single-select): `Débutant` / `Intermédiaire` / `Confirmé` / `Expert` / `Ouvert à tou·te·s` — a small shared vocabulary (`packages/shared`), default « Ouvert à tou·te·s ».
  - **Participation** (single-select): `Solo` / `En équipe autorisée` — when teams are allowed, an optional **taille maximale d'équipe**.
  - **Dates** (on-brand date inputs, `color-scheme` light): **date limite de soumission** (required, future), optional **date de début** and **date d'annonce des résultats** — with `startAt ≤ deadline ≤ resultsAt` when present.
  - **Récompenses** — a repeatable list (add/remove rows): `1re place`, `2e place`, … each with a label + description, matching the article "Récompenses" sidebar. At least one required.
  - **Article d'annonce** — a choice: **« Rédiger l'article »** opens the [[AD-8]] rich editor inline (body pre-linked to this contest), **or** **« Lier un article existant »** selects one from the author's articles. (Editor-authored inline articles still follow the [[AD-8]] approval rules.)
  - **Règlement / conditions** (rich text or link) and **nombre de gagnant·es**; branding (editor) / platform banner (staff) as before.
- A contest detail view for the owner showing engagement (e.g. "+800 participations", "30 j de visibilité") and the list of entries to scout, filterable by the contest's declared content type / level.
- States: multi-step or scrollable form (empty / validating / submitting), live contest, closed contest. Empty entries: "Aucune participation pour l'instant."
- Loading/error: spinner on submit; inline field errors + a submit-level error on failure ("Échec de la création du concours.").
- Accessibility: modal focus-trapped and labelled; every select/date/genre control labelled; the récompenses list is keyboard add/remove; engagement figures labelled as text; responsive 375/768/1280.

## Backend
- `POST /editeur/contests` (verified editor, branded) / `POST /admin/contests` (`maintainer`/`admin`, platform) — shared body: `{ title, theme, contentTypes[], lengthTypes[], genres[], level, participation ('solo'|'teams'), maxTeamSize?, deadline, startAt?, resultsAt?, prizes[] ({ rank, label, description? }), winnerCount, rules?, article ({ mode:'inline', draft:{…} } | { mode:'link', articleId } | null), branding? }`. The editor route sets `sponsorEditorOrgId` from the authenticated org; the admin route leaves it null (platform-run) and ignores `branding`.
- `GET /editeur/contests/{id}/entries` — list submissions for scouting (filterable by the contest's content type / level).
- **Entity `Contest`**: `id, sponsorEditorOrgId? (null = platform-run), createdByAccountId, title, theme, contentTypes String[] (manga|roman|illustration), lengthTypes String[], genres String[] (F-20 vocab), level (debutant|intermediaire|confirme|expert|ouvert), participation (solo|teams), maxTeamSize?, deadline, startAt?, resultsAt?, winnerCount, rules?, articleId? (linked/created announcement), branding?, status (draft|pending|live|closed), createdAt`. **Prize** `{ id, contestId, rank, label, description? }`; **Entry** `{ id, contestId, creatorId, workRef, submittedAt }`.
- Shared vocabularies: `contentTypes` reuse [[DR-2]] format + `illustration`; `genres` reuse the [[F-20]] `genres.json`; `level` is a new small allowlist in `packages/shared`. Validate every enum/vocabulary server-side (allowlist), like the catalog parsers.
- Business rules: community submits via the existing contest participation flow ([[PUB-7]]); a branding marks the contest as sponsored by a house, a platform contest carries the Encre & Plume banner; visibility window tied to the deadline. **Editor-created** contests may require admin approval (`pending` → `live`, per [[AD-9]]); **staff-created** go live directly. The **`article`** part either creates a linked article via [[AD-8]] (inline draft) or attaches an existing `articleId` the author owns — a linked article renders the "CONCOURS LIÉ" sidebar on the article page.
- Validation: `title`/`theme` required; ≥1 `contentType`; ≥1 `prize`; `winnerCount ≥ 1`; `deadline` in the future and `startAt ≤ deadline ≤ resultsAt` when present; `maxTeamSize` only when `participation = teams`; genres/level/format against their allowlists; a linked `articleId` must belong to the caller; a house branding is restricted to the caller's verified org (editors only).
- Authorization: **create** = verified editor ([[PE-1]], branded) **or** `maintainer` / `admin` ([[F-2]], platform). Admin oversight/approval per [[AD-9]].
- Side effects: publishes the contest to the community; may notify followers ([[F-5]]).

## Dependencies
- [[PE-1]] — access gate (editor / branded path).
- [[F-2]] — role gating for the `maintainer` / `admin` platform-contest creation path.
- [[DR-2]] — reuses the content-type (format) + longueur vocabularies for the entry constraints.
- [[F-20]] — genre vocabulary picker for the contest's genres.
- [[PUB-7]] — community submits participations.
- [[AD-9]] — admin contest administration/oversight + the staff creation surface.

- [[AD-8]] — the announcement article: rédigé inline (rich editor) or an existing article linked; editor-authored inline articles follow AD-8's approval rules.

## Notes
- The prototype only draws the `data-contest-modal` hook + the "concours sponsorisé · présenté par [votre maison]" pitch; the full brief field set (content type / longueur / genre / niveau / solo-équipe / récompenses / article lié) is user-specified (2026-07-05) — Inferred, built on-brand with the shared vocabularies rather than a drawn frame.
- Reuse over reinvent: content types = [[DR-2]] formats + illustration; longueur = [[DR-2]] facet; genres = [[F-20]]; only `level` (Débutant…Ouvert) is a new small vocabulary. Keep the modal usable — a multi-step or clearly-sectioned single form, not one overwhelming wall of inputs.
