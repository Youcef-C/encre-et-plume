# CS-1 — Create project wizard "Nouveau projet"

**As a** Creator, **I want** a guided "Nouveau projet" modal that lets me pick a project type and set its details, **so that** I can start a new work configured for the kind of collaboration I need.

> Screen(s): "Nouveau projet" (modal) · Priority: Must · Fidelity: Explicit

## Frontend
- Modal launched from a "Nouveau projet" action; dismissible via "Annuler", backdrop, and Escape.
- Two-step flow (prototype also supports a 3-step variant with step dots and "Plus tard" / "Créer" on the last step — treat extra step as optional metadata).
- **Step "1 · Type de projet"**: 3 selectable type cards, single-select:
  - "Illustration(s)" — sub "Galerie d'images, sans récit."
  - "Histoire (illustrée)" — sub "Récit en texte, avec illustrations d'appui (optionnel)."
  - "Manga" — sub "Récit dessiné : planches & chapitres."
  - Selected card shows active state; "Suivant" advances (or next step dot).
- **Step "2 · Détails"**:
  - "Titre du projet…" text field — required.
  - "Genres" tag selector: preset tags (Seinen pre-checked ✓, Shōnen, Thriller, Fantastique) toggle on/off, plus "＋ Ajouter" to add a custom genre. Multi-select.
  - "Je cherche" radios: "Scénariste" / "Dessinateur·rice" / "Je travaille seul·e" (single-select).
  - "Visibilité" radios: "Privé" / "Sur invitation" / "Public" (single-select).
  - Footer: "Annuler" (closes, discards) + "Créer le projet" (submits).
- States: type-card selected/unselected; step navigation (next/back, step dots); submit loading; field validation error on empty "Titre du projet…".
- Validation: title required (block submit, inline error); a type must be selected before reaching step 2.
- Empty/loading/error: disabled "Créer le projet" until valid; submit spinner; error toast if create fails (modal stays open, values preserved).
- Accessibility: focus trap in modal, focus returns to trigger on close; radios/checkboxes keyboard-navigable with labels; type cards reachable as a radiogroup; step dots labelled.

## Backend
- **POST /projects** — create project. Request: `{ type: "illustration"|"story"|"manga", title, genres[], lookingFor: "scenariste"|"dessinateur"|"solo", visibility: "private"|"invite"|"public", ownerId }`. Response: `{ id, slug, ... }`.
- Entity **Project**: `id, slug, type, title, genres[], lookingFor, visibility, ownerId, createdAt`.
- Business rules: `title` required; `slug` generated from title; owner added as first member (Creator role) — see [[CS-10]].
- Side effect: if `lookingFor` is "scenariste" or "dessinateur", seed an "Appel à projets" call → [[MC-4]].
- Authorization: authenticated user only ([[F-1]]); creator becomes owner.
- Validation: reject empty title; constrain `type`, `lookingFor`, `visibility` to enum values.

## Dependencies
- [[MC-4]] — "Je cherche" a collaborator seeds an Appel à projets.
- [[F-1]] — authenticated owner.
- [[CS-2]] — created project opens into the workspace.

## Notes
- Explicit: 2-step modal, type cards, fields, radios, footer buttons. The 3-step variant with "Plus tard"/"Créer" and step dots is a prototype alternative — captured as optional, not a separate story.
