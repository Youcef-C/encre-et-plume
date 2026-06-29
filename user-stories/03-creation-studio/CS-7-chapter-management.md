# CS-7 — Chapter management

**As a** Creator, **I want** to add and edit chapters and link pages to them, **so that** my work is organized into structured, trackable chapters.

> Screen(s): "Espace projet" → "Chapitres" tab · Priority: Must · Fidelity: Explicit

## Frontend
- Per-chapter accordion item showing: chapter title; status ("✓ Publié" or "En cours · 42%"); planche count + likes ("♥ 2,1k"); a page-thumbnail strip + "＋ Lier une page".
- Inline edit form: "TITRE" / "N°" / "RÉSUMÉ" fields with "Annuler" / "Enregistrer".
- "＋ Ajouter un chapitre" at the bottom of the list.
- States: accordion expanded/collapsed; edit mode vs read mode; empty (no chapters yet); saving; empty page strip ("Aucune page liée"); error on save.
- Validation: title and number required; number unique within the project; warn on number collision.
- "＋ Lier une page" opens a page picker (project pages) to attach pages to this chapter.
- Accessibility: accordion headers are buttons with expanded state; edit form fields labelled; "＋ Lier une page" / "＋ Ajouter un chapitre" labelled; likes/status read as text.

## Backend
- **POST /projects/{slug}/chapters** — create `{ title, number, resume }`.
- **PATCH /chapters/{id}** — edit title/number/résumé.
- **POST /chapters/{id}/pages** — link page(s) `{ pageIds }`; **DELETE** to unlink.
- Entity **Chapter**: `{ id, projectId, title, number, resume, status: "en_cours"|"publie", progressPct, plancheCount, likeCount, pageIds[] }`.
- Business rules: number unique per project; `progressPct` and `plancheCount` derived from linked pages/stages; `likeCount` aggregated from reader likes.
- Authorization: project members with edit permission ([[CS-10]]).
- Side effects: chapter status set to "publie" on publish ([[PUB-1]]); chapters drive kanban chapter chips ([[CS-2]]).

## Dependencies
- [[CS-2]] — Chapitres tab lives in the workspace; chapters drive kanban chips.
- [[CS-6]] — page ordering within chapters.
- [[CS-10]] — edit permission.
- [[PUB-1]] — publish sets "✓ Publié".

## Notes
- Explicit: accordion fields, status/progress/likes, page-link strip, inline edit, add chapter.
