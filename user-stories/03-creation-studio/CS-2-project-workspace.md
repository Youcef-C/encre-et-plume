# CS-2 — Project workspace "Espace projet"

**As a** Creator, **I want** a tabbed project workspace with a production kanban, **so that** I and my collaborators can track every page from script to validated art in one place.

> Screen(s): "Espace projet" (Tableau · Chapitres · Fichiers · Discussion · Soutien · Infos) · Priority: Must · Fidelity: Explicit

## Frontend

- **Header**: back link "‹ Projets"; project title; collaborator avatars + label "Camille ✒ & Yuki 🖌"; buttons "Gérer le groupe" ([[CS-10]]), "Éditeur" ([[CS-4]]), and a split "Publier ▾" ([[CS-6]]/[[CS-9]]).
- **Tab bar**: "Tableau · Chapitres · Fichiers · Discussion · Soutien · Infos" (active-tab state, deep-linkable).
- **TABLEAU (kanban)**:
  - Chapter selector chips: "Prologue", "Ch.1"–"Ch.6", "＋" (add chapter → [[CS-7]]). Selecting a chip filters the board to that chapter.
  - Production columns: "Scénario ✒ · Nemu · Corrections · PROPRE · Encrage 🖌 · VALIDÉ ✓".
  - Page cards: version badge ("⎘ v3"), file-type tags ("📄 scénario", "🖼 réf", "🖼 nemu", "⇿ Double page"); per-card icons "✎ éditer" / "👁 aperçu" / "⚑ corrections" ([[CS-5]]) / "⋯".
  - "＋ Ajouter une carte" per column. Cards drag between columns to change production stage.
- **CHAPITRES**: per-chapter accordion → see [[CS-7]].
- **FICHIERS**: → [[CS-3]].
- **DISCUSSION**: → [[CS-8]].
- **SOUTIEN**: project monetization panel (cross-ref MR epic).
- **INFOS**: editable "COVER" / "TITRE" / "SYNOPSIS" / "HASHTAGS" with auto-save; "Demandes de collaboration" toggle; "Retours des lecteur·rices" reviews list ([[PUB-3]]) with admin moderation affordances ([[AD-5]]).
  - **COVER**: a "Déposez la couverture" drop slot — reuse the prototype's `image-slot` component (the same one drawn on the "Œuvre" hero, `id="oeuvre-cover"`, and the gallery hero: drag-drop or click-to-browse, fit `cover`, on-brand `3px solid var(--ink)` frame + hard offset shadow). Uploads go **direct-to-storage via F-10 presigned URLs** (the API never proxies bytes); on success the returned media URL is saved as the œuvre's cover and **propagates to the public "Œuvre" page hero ([[DR-3]]) and every catalog/ranking card**. Owner/member only. Allowed types + max size/dimensions per [[F-10]]; a pending/failed upload shows the placeholder + retry. Removing the cover falls back to the CSS halftone placeholder.
- States: per-tab loading skeletons; empty kanban column ("Aucune carte"); empty chapter list; drag-in-progress and drop-target highlight; auto-save "Enregistré ✓" indicator on Infos; error on failed stage transition (card reverts).
- Accessibility: tabs as ARIA tablist; kanban columns labelled; cards keyboard-movable between columns; icon buttons have accessible labels (édition, aperçu, corrections, plus).

## Backend

- **GET /projects/{slug}** — full workspace payload: project info, members, chapters, pages (with kanban `stage`, version, file-type tags, linked files).
- **PATCH /projects/{slug}** — update info fields (title, synopsis, hashtags, collaborationRequests toggle, **cover**); auto-save (debounced). The `cover` field takes the media URL/id produced by the [[F-10]] presigned upload (the endpoint stores the reference; it does not receive image bytes) and writes it to the œuvre's `coverImage` so [[DR-3]] and the catalog cards pick it up.
- **POST /projects/{slug}/pages** + **PATCH /pages/{id}** + **DELETE /pages/{id}** — page/card CRUD.
- **PATCH /pages/{id}/stage** — kanban stage transition (`scenario|nemu|corrections|propre|encrage|valide`).
- **GET /pages/{id}/versions** — version history for the "⎘ vN" badge.
- Entities: **Page** `{ id, projectId, chapterId, stage, version, fileTags[], linkedFileIds[] }`; **Project** info fields (see [[CS-1]]).
- Business rules: stage values constrained to the 6 columns; version increments on new file revision.
- Authorization: project members only; visibility rules from [[CS-1]] gate read access for non-members.
- Side effects: stage change to "Corrections" / raising a correction notifies collaborators ([[F-5]], via [[CS-5]]).

## Dependencies

- [[CS-3]] [[CS-4]] [[CS-5]] [[CS-6]] [[CS-7]] [[CS-8]] [[CS-9]] [[CS-10]] — tabs/actions route into these.
- [[PUB-3]] — reviews shown in Infos; [[AD-5]] — moderation.
- [[F-10]] — the COVER control uploads via F-10 presigned URLs; the stored media URL becomes the œuvre cover.
- [[DR-3]] — the edited cover renders on the public "Œuvre" hero.

## Notes

- Explicit: header, tabs, kanban columns, card anatomy, Infos auto-save, reviews. Soutien detail deferred to MR epic.
- **Cover control reconciliation (2026-07-09)**: the prototype's INFOS view (`data-projview="infos"`) draws only TITRE / SYNOPSIS / HASHTAGS + the collaboration toggle + reviews — it does **not** draw a cover control there. The cover-drop *component* IS drawn in the prototype (the `image-slot` "Déposez la couverture" on the "Œuvre" hero `id="oeuvre-cover"`, and the gallery hero). This story reuses that drop component **inside the INFOS editor** (an **induced deviation** — the INFOS form gains the drawn cover-drop that the prototype places on the public hero), so a creator can add/replace the œuvre cover from the workspace. Covers apply to every œuvre type — Manga, Histoire/Roman, and Illustration collections ([[DR-12]]) — since all are `Work` rows with `coverImage`.
