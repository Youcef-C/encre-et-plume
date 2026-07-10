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
  - **Card cards ergonomics** (extension 2026-07-11): cards are not forced compact — they grow with
    their data (Trello-style). A card shows, when present: color-label bars on top; title + "⎘ vN";
    file-type tags; and a meta footer with a due-date pill (accent/overdue styling when past due), a
    **checklist `(x/x)`** count, a comment count, and an assignee avatar stack.
  - **Card detail modal** (extension 2026-07-11 — improves the prototype's `[data-card-modal]`
    "Nouvelle carte"): clicking a card opens a modal that keeps the prototype's TITRE · COLONNE ·
    TYPE DE PAGE (Simple / ⇿ Double page) · FICHIERS LIÉS, and adds:
    - **DESCRIPTION** (textarea).
    - **ÉTIQUETTES** — user-created project labels (name ≤30 + a color from a fixed on-brand palette,
      no presets); toggle to apply/remove on the card; create/rename/recolor/delete from the picker;
      deleting a label removes it from every card.
    - **ÉCHÉANCE** — a deadline via native `<input type="date">` in an on-brand frame; clearable.
    - **CHECKLIST** — `OnBrandCheckbox` items (toggle done), add/delete rows, progress bar + `(x/x)`.
    - **ASSIGNÉ À** — assign/unassign project members; **both added and removed** assignees get an
      [[F-5]] notification.
    - **COMMENTAIRES** — refetch-on-open list (author, relative time, "modifié" when edited); author
      edits/deletes own, project owner deletes any; composer + "Commenter". The composer supports
      tagging a project member with `@name` (autocomplete from project members); each newly-mentioned
      member gets an [[F-5]] **mention** notification.
    Simple fields (title/description/deadline/labels) debounce-autosave with the "Enregistré ✓"
    indicator; checklist/comment/assignee actions are immediate with optimistic revert on error.
    Delete-card stays member-gated (the existing ⋯ menu); the menu z-index bug is fixed (the open
    card raises its stacking context) and the menu closes on outside click / Escape.
  - **Filter by label**: a label-filter chip row above the columns (auto-apply, on-brand) narrows the
    visible cards; combines with the chapter chips.
- **CHAPITRES**: per-chapter accordion → see [[CS-7]].
- **FICHIERS**: → [[CS-3]].
- **DISCUSSION**: → [[CS-8]].
- **SOUTIEN**: project monetization panel (cross-ref MR epic).
- **INFOS**: editable "COVER" / "TITRE" / "SYNOPSIS" / "HASHTAGS" with auto-save; "Demandes de collaboration" toggle; "Retours des lecteur·rices" reviews list ([[PUB-3]]) with admin moderation affordances ([[AD-5]]).
  - **STATUT (En cours / Terminé)** (user-specified 2026-07-10; induced — not drawn) → **now specced as its own story [[CS-14]]** (build with or after this one): a single-select toggle on the INFOS editor to mark the œuvre's completion, backed by the existing `Work.complete` boolean (`false` = "En cours", `true` = "Terminé" / "Œuvres complètes"). **Series only** — shown for `Manga` / `Roman` / `One-shot` `Work`s; **hidden for `Illustration(s)`** œuvres/collections (they have no completion axis). Auto-saves like the other INFOS fields; "Terminé" surfaces on the public "Œuvre" page ([[DR-3]]) and the STATUT catalog filter. Owner/member only; server rejects setting it on an `Illustration(s)` Work.
  - **COVER**: a "Déposez la couverture" drop slot — reuse the prototype's `image-slot` component (the same one drawn on the "Œuvre" hero, `id="oeuvre-cover"`, and the gallery hero: drag-drop or click-to-browse, fit `cover`, on-brand `3px solid var(--ink)` frame + hard offset shadow). Uploads go **direct-to-storage via F-10 presigned URLs** (the API never proxies bytes); on success the returned media URL is saved as the œuvre's cover and **propagates to the public "Œuvre" page hero ([[DR-3]]) and every catalog/ranking card**. Owner/member only. Allowed types + max size/dimensions per [[F-10]]; a pending/failed upload shows the placeholder + retry. Removing the cover falls back to the CSS halftone placeholder.
- States: per-tab loading skeletons; empty kanban column ("Aucune carte"); empty chapter list; drag-in-progress and drop-target highlight; auto-save "Enregistré ✓" indicator on Infos; error on failed stage transition (card reverts).
- Accessibility: tabs as ARIA tablist; kanban columns labelled; cards keyboard-movable between columns; icon buttons have accessible labels (édition, aperçu, corrections, plus).

## Backend

- **GET /projects/{slug}** — full workspace payload: project info, members, chapters, pages (with kanban `stage`, version, file-type tags, linked files).
- **PATCH /projects/{slug}** — update info fields (title, synopsis, hashtags, collaborationRequests toggle, **cover**); auto-save (debounced). The `cover` field takes the media URL/id produced by the [[F-10]] presigned upload (the endpoint stores the reference; it does not receive image bytes) and writes it to the œuvre's `coverImage` so [[DR-3]] and the catalog cards pick it up.
- **POST /projects/{slug}/pages** + **PATCH /pages/{id}** + **DELETE /pages/{id}** — page/card CRUD.
- **PATCH /pages/{id}/stage** — kanban stage transition (`scenario|nemu|corrections|propre|encrage|valide`).
- **GET /pages/{id}/versions** — version history for the "⎘ vN" badge.
- **Card detail + collaboration data** (extension 2026-07-11):
  - **GET /pages/{id}** — full card detail (description, dueDate, labels, assignees, checklist, comments with author, linked files, version summary) for the modal.
  - **PATCH /pages/{id}** — extended to also accept `description`, `dueDate`, `labelIds`, `assigneeIds`. Diffing `assigneeIds` notifies **both added and removed** members ([[F-5]] `project_activity`).
  - **Labels palette**: **GET/POST /projects/{slug}/labels**, **PATCH/DELETE /labels/{id}** — member-created labels (`name` ≤30 + `color` from a fixed on-brand palette; reject colors outside it). Deleting a label cascades off all cards.
  - **Checklist**: **POST /pages/{id}/checklist**, **PATCH /checklist/{itemId}**, **DELETE /checklist/{itemId}**.
  - **Comments**: **POST /pages/{id}/comments**; **PATCH /comments/{id}** (author only, sets `editedAt`); **DELETE /comments/{id}** (author or project owner). On create (and on edit for newly-added mentions), parse `@name` mentions of project members and notify each mentioned member ([[F-5]] mention).
- Entities: **Page** `{ id, projectId, chapterId, stage, version, fileTags[], linkedFileIds[], description?, dueDate? }`; **ProjectLabel** `{ id, projectId, name, color }` + **PageLabel** join; **PageAssignee** `{ pageId, userId }` join; **PageChecklistItem** `{ id, pageId, text, done, order }`; **PageComment** `{ id, pageId, authorId, body, createdAt, editedAt? }`; **Project** info fields (see [[CS-1]]).
- Business rules: stage values constrained to the 6 columns; version increments on new file revision; label `color` ∈ the fixed palette; a card's labels/assignees belong to the same project.
- Authorization: project members only (labels/checklist/comments/assignees/delete all member-gated); visibility rules from [[CS-1]] gate read access for non-members; comment edit = author only, comment delete = author or project owner.
- Side effects: stage change to "Corrections" / raising a correction notifies collaborators ([[F-5]], via [[CS-5]]); assigning/unassigning a member on a card notifies that member ([[F-5]]); `@name`-mentioning a member in a comment notifies that member ([[F-5]]).

## Dependencies

- [[CS-3]] [[CS-4]] [[CS-5]] [[CS-6]] [[CS-7]] [[CS-8]] [[CS-9]] [[CS-10]] — tabs/actions route into these.
- [[PUB-3]] — reviews shown in Infos; [[AD-5]] — moderation.
- [[F-10]] — the COVER control uploads via F-10 presigned URLs; the stored media URL becomes the œuvre cover.
- [[DR-3]] — the edited cover renders on the public "Œuvre" hero.

## Notes

- Explicit: header, tabs, kanban columns, card anatomy, Infos auto-save, reviews. Soutien detail deferred to MR epic.
- **Cover control reconciliation (2026-07-09)**: the prototype's INFOS view (`data-projview="infos"`) draws only TITRE / SYNOPSIS / HASHTAGS + the collaboration toggle + reviews — it does **not** draw a cover control there. The cover-drop *component* IS drawn in the prototype (the `image-slot` "Déposez la couverture" on the "Œuvre" hero `id="oeuvre-cover"`, and the gallery hero). This story reuses that drop component **inside the INFOS editor** (an **induced deviation** — the INFOS form gains the drawn cover-drop that the prototype places on the public hero), so a creator can add/replace the œuvre cover from the workspace. Covers apply to every œuvre type — Manga, Histoire/Roman, and Illustration collections ([[DR-12]]) — since all are `Work` rows with `coverImage`.
- **Card modal extension (2026-07-11, induced)**: the prototype draws a card modal (`[data-card-modal]` "Nouvelle carte": TITRE · DESCRIPTION · COLONNE · TYPE DE PAGE · FICHIERS LIÉS · ASSIGNÉ À) but the shipped CS-2 slice built only a lightweight inline "add card". This extension makes **clicking a card open that modal** and **improves it** with color labels, a deadline, a checklist, comments, and (added+removed) assignee notifications — grade the modal against the prototype base **plus** these additions, not the raw prototype. The bigger/richer mini cards and the label-filter row are induced ergonomics (the prototype is desktop-only and doesn't draw them). Design spec: `docs/superpowers/specs/2026-07-11-cs2-card-modal-design.md`.
- **Deferred (do not flag as gaps)**: realtime websocket push for comments/checklist (intentional refetch-on-open); per-checklist-item due dates / assignment; comment threading & reactions.
