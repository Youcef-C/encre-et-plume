# CS-1 — Create project wizard "Nouveau projet"

**As a** Creator, **I want** a guided "Nouveau projet" wizard that lets me pick a project type and configure its œuvre, collaborators, and support, **so that** I can start a new work set up for the kind of collaboration I need.

> Screen(s): "Nouveau projet" (`data-page="creer"`) + "Publier une illustration" (`data-page="creerillus"`) · Priority: Must · Fidelity: **Mixed** — the **Manga** and **Illustration** wizards are drawn (Explicit); the **Roman / Histoire** variant is not separately drawn (Inferred — adapt the manga wizard).

## Frontend

The Type step forks into **two distinct wizards** (both drawn in the prototype):

### Step "1 · Type de projet" (shared entry)
3 selectable type cards, single-select (Manga pre-selected ✓):
- **"Illustration(s)"** — "Galerie d'images, sans récit." → **selectable like the other cards** (single-select); it does **NOT** navigate away. Clicking **"Continuer →"** with Illustration(s) selected enters the **"Publier une illustration"** wizard **inline, within the same `/creer` shell** (step rail + footer), reusing the actual illustration publish flow **with the real Collection (série/ensemble → [[DR-12]]) implementation** — see B below. (Correction 2026-07-10: the earlier behavior navigated to the standalone `/creer/illustration` placeholder page on card click; instead, fit that page's real content into the wizard as the Illustration branch.)
- **"Histoire (illustrée)"** — "Texte, avec illustrations d'appui." → the manga wizard (A), Roman/Histoire variant.
- **"Manga"** — "Récit dessiné : planches & chapitres." → the manga wizard (A).

### A) Manga / Histoire wizard (`creer`) — 3 steps: **Type · Détails · Soutien**
Step dots are clickable; header "Nouveau projet" + "✕". Footer: "← Retour", "Annuler", "Configurer plus tard" (skips Soutien → create now), "Continuer →", "Créer le projet".

- **Step "2 · Détails"**:
  - **Titre du projet…** — required.
  - **Synopsis** — textarea ("Résumez votre œuvre en quelques phrases…").
  - **Hashtags** — free chips, "· séparés par un espace" (e.g. "thriller noir urbain"). NOT F-20 genres (freetext descriptive tags, like [[DR-6]]).
  - **Format** — toggle **Série / One Shot** (single-select).
  - **Lier à un concours** — an `OnBrandSelect` of open contests ("CONCOURS · Prix du jeune mangaka 2026 ▾"), optional → [[PUB-7]] / [[PE-6]].
  - **Genre** — single-select, on-brand `GenreChip` + `GenreSuggestInput` over the [[F-20]] vocabulary (the drawn preset chips Seinen/Shōnen/Josei/Shōjo + "＋ Ajouter" become the F-20 picker; never free text — [[F-20]] rule).
  - **Thèmes** — "· plusieurs", multi-select `GenreChip` + `GenreSuggestInput` over [[F-20]] themes.
  - **Public / Âge** — single-select chips **Tous publics / 12+ / 16+ / 18+** (`CATALOG_AUDIENCE_RATINGS`; feeds [[DR-10]] gating).
  - **Membres & invitations** — current member chips ("Vous ✒", invited members with removable "✕"); an invite search "⌕ Inviter par nom, rôle ou genre…" with suggestion rows + "＋ Ajouter" → seeds [[MC-3]] invitations.
  - **Je recherche** — per-role **counters** (not radios): "Scénariste(s) [− N +]", "Dessinateur·rice(s) [− N +]". All zero = solo.
  - **Visibilité** — single-select **Privé / Sur invitation / Public**.
  - **Couverture** (optional, induced — see Notes): a "Déposez la couverture" `image-slot` drop ([[CS-2]] INFOS mechanism) → [[F-10]] presigned upload; skippable, editable later in [[CS-2]] INFOS.
- **Step "3 · Soutien — Paliers & partage des revenus · optionnel"**:
  - **Paliers d'abonnement** — editable rows (name + €/mois), "＋ Ajouter un palier" → [[MR-1]].
  - **Autoriser les dons uniques** — checkbox → [[MR-1]].
  - **Objectifs de financement · optionnel** — goal rows (title + cible €/mois), "＋ Ajouter un objectif" → [[MR-2]].
  - **Partage des revenus · doit totaliser 100 %** — per-member split sliders/steppers; "Modifiable plus tard…" → [[CS-10]].

### B) Illustration wizard "Publier une illustration" (`creerillus`) — **Upload · Détails · Soutien · Publication**
Also reachable from the Galerie "＋ Publier une illustration" ([[DR-5]]); its detail is owned by [[DR-5]]/[[CS-3]]/[[DR-12]] — summarized here because it's the Illustration(s) branch of this wizard. The prototype draws 3 steps (Upload · Détails · Publication); a **Soutien** step is added per product owner (induced — see Notes):
- **Step 1 · Upload**: main `image-slot` "Déposez l'illustration principale" (PNG/JPEG/WebP, double-click to crop) + **"C'est une série / un ensemble"** toggle → reveals "PLANCHES / VARIANTES · optionnel" (extra image-slots). The série/ensemble toggle **is the [[DR-12]] collection at publish**.
- **Step 2 · Détails**: Titre, Catégorie (Couverture/Illustration/Personnage/Décor/Fan-art/Planche), Description, Hashtags, Outils, Licence (© Tous droits réservés / CC BY / CC BY-NC), Visibilité (Public / Abonnés / Privé). **+ "Lier à un concours"** (induced — see Notes).
- **Step 3 · Soutien · optionnel** (induced): same panel as the manga wizard's step 3 — paliers d'abonnement, autoriser les dons uniques, objectifs de financement, and (for a série/ensemble collection with co-authors) partage des revenus — scoped to the illustration/collection œuvre → [[MR-1]] / [[MR-2]] / [[CS-10]]. Skippable via "Configurer plus tard".
- **Step 4 · Publication**: aperçu card → "✓ Publier"; "sera ajoutée à la Galerie et visible sur votre profil".

### States / validation / a11y
- States: type-card selected/unselected; step navigation (dots, back/next); submit loading; validation error on empty title; contest/genre pickers loading.
- Validation: title required (blocks submit, inline error); type must be selected before step 2; revenue split must total 100 %; audience/format/visibility constrained to their enums.
- Empty/loading/error: "Créer le projet" / "✓ Publier" disabled until valid; submit spinner; error toast on failure (wizard stays open, values preserved).
- Accessibility: focus trap; focus returns to trigger on close; type cards a radiogroup; counters, chips, and toggles keyboard-operable with labels; step dots labelled.

## Backend
- **POST /projects** (manga / histoire) — create a project + seed its œuvre. Request (all beyond `type`/`title` optional so "Configurer plus tard" works):
  `{ type: "manga"|"story", title, cover?, synopsis?, hashtags[], format: "serie"|"oneshot", contestId?, genre, themes[], audienceRating, visibility: "prive"|"invitation"|"public", invites[]: accountId, seeking: { scenariste: n, dessinateur: n }, tiers[]?, allowDonations?, goals[]?, revenueSplit[]? }`. Response `{ id, slug, workId, ... }`.
- **Project ↔ Work seeding**: the œuvre-level fields (synopsis, hashtags, genre, themes, audienceRating, format, cover) seed the project's **Work/œuvre** (they render on the public [[DR-3]] page + catalog); the workspace/collab fields (members, visibility, seeking) stay on **Project**. See the open modeling question in Notes.
- **Illustration(s) type** → **POST /illustrations** ([[DR-5]]) instead of /projects; the "série / un ensemble" toggle also creates/links a **collection** ([[DR-12]]); optional `contestId`; optional Soutien (`tiers[]`, `allowDonations`, `goals[]`, `revenueSplit[]`) scoped to the illustration/collection œuvre → [[MR-1]]/[[MR-2]]/[[CS-10]].
- Entity **Project**: `{ id, slug, type, title, visibility, ownerId, workId, contestId?, createdAt }` (+ collab fields). Œuvre metadata on **Work** ([[DR-3]]).
- Business rules: `title` required; `slug` from title; owner added as first member (Creator role, [[CS-10]]); `revenueSplit` must total 100 %.
- Side effects: `seeking.*` > 0 seeds an "Appel à projets" call for those roles/counts → [[MC-4]]; `invites[]` create [[MC-3]] invitations; `tiers`/`allowDonations`/`goals` seed [[MR-1]]/[[MR-2]]; `revenueSplit` seeds [[CS-10]]; `contestId` links the œuvre to the contest ([[PUB-7]]/[[PE-6]]).
- Authorization: authenticated user only ([[F-1]]); creator becomes owner.
- Validation: reject empty title; constrain `type`, `format`, `visibility`, `audienceRating`, genre/themes (F-20 ids), `contestId` (must be an open contest) to valid values.

## Dependencies
- [[F-1]] — authenticated owner.
- [[CS-2]] — created project opens into the workspace; cover/info editable later in INFOS.
- [[CS-10]] — owner as first member; revenue split.
- [[MC-3]] — inline "Membres & invitations".
- [[MC-4]] — "Je recherche" counters seed an Appel à projets.
- [[F-10]] — optional cover uploads via presigned URLs.
- [[F-20]] / [[F-22]] — Genre / Thèmes picker & chips.
- [[DR-10]] — Public / Âge audience rating.
- [[MR-1]] / [[MR-2]] — Step 3 Soutien (paliers, dons, objectifs).
- [[PUB-7]] / [[PE-6]] — "Lier à un concours".
- [[DR-5]] / [[CS-3]] / [[DR-12]] — the Illustration(s) branch ("Publier une illustration" wizard + collections).
- [[DR-3]] — the seeded œuvre renders on the public "Œuvre" page.

## Notes
- **Fidelity**: the **Manga** wizard (`creer`, 3 steps) and the **Illustration** wizard (`creerillus`, 3 steps) are fully drawn → **Explicit**; the **Roman / Histoire (illustrée)** variant reuses the manga `creer` wizard and is **not separately drawn** → **Inferred** (adapt: drop planches-specific framing, allow a prose synopsis/excerpt per [[DR-3]]).
- **Unified entry (correction 2026-07-10)**: the Illustration branch lives **inline in the `/creer` wizard** (not a separate page). All entry points route to `/creer`: Découvrir "＋ Poster une œuvre" and the Galerie "＋ Publier une illustration" ([[DR-5]]) — the latter deep-links to `/creer` **with Illustration pre-selected** (e.g. `?type=illustration`). The old standalone `/creer/illustration` page is removed or becomes a thin redirect. This is an intended change, not a regression — the corresponding e2e/unit tests are rewritten to the new target.
- **Induced deviations** (not drawn, requested): (1) optional **Couverture** at creation (the wizard omits a cover field — cover otherwise added in [[CS-2]] INFOS); (2) **"Lier à un concours" on the Illustration wizard** — the prototype draws the contest link only on the manga wizard; per product owner, illustrations are also contest-linkable; (3) a **Soutien step on the Illustration wizard** — the prototype draws only Upload · Détails · Publication; per product owner, illustration/collection œuvres are also supportable (paliers, dons, objectifs, revenue split), so the manga wizard's step 3 is added to this flow too.
- **On-brand substitution**: the prototype's plain "＋ Ajouter" custom-genre chips are implemented with the [[F-20]] `GenreSuggestInput` + `GenreChip` (no free-text genre entry — CLAUDE.md rule).
- **Genre + Thèmes merged (approved 2026-07-10)**: since the [[F-20]] `genres.json` vocabulary is a single flat list (no demographic/theme split), the wizard uses ONE combined "Genres" picker instead of separate Genre + Thèmes controls — `genres[0]` maps to `body.genre` (primary), the rest to `body.themes[]` (backend contract unchanged). Product-owner-approved deviation from the two drawn controls.
- **Open (modeling)**: how a created Project seeds/links its **Work/œuvre** (same question flagged in [[DR-12]]) — the wizard collects œuvre-level metadata that lives on `Work`; the PM confirms the Project↔Work bridge. The **Format** "Série / One Shot" mapping to `Work.format` (`CATALOG_FORMATS` has "One-shot") is likewise confirmed at planning time.
