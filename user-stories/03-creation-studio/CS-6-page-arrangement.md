# CS-6 — Page arrangement before publish "Réorganiser les pages"

**As an** Illustrator, **I want** to reorder a chapter's pages and set the cover before publishing, **so that** the chapter reads in the right order with the right opening image.

> Screen(s): "Réorganiser les pages" (wireframe) · Priority: Should · Fidelity: Explicit

## Frontend
- **Header**: "Ch.2 : préparer la publication · 18 planches" + "Aperçu" + split "Publier ▾".
- **Chapter tabs**: "Ch.2 / Ch.1 / Prologue" with hint "↔ glisser pour réordonner".
- **Grid**: 6-column drag-drop grid of page thumbnails; each card has a drag handle "⠿" and a "P. n" label.
- First card flagged "COUVERTURE" (designates the cover); cover can be reassigned.
- Active insertion gap shows "déposer ici" during drag.
- "＋ Ajouter" tile at end of grid.
- Note: reading direction (Pages / Webtoon) is set on the reader, not here.
- States: drag-in-progress with drop-target gap; reorder saving indicator; empty chapter ("Aucune page"); loading thumbnails; error (order reverts).
- Validation: at most one cover per chapter; order must remain contiguous.
- Accessibility: cards keyboard-reorderable (move up/down) as drag alternative; drag handles labelled "Réorganiser"; cover toggle has accessible label; "P. n" labels read.

## Backend
- **PATCH /chapters/{id}/page-order** — persist new page order `{ pageIds: [...] }`.
- **PATCH /chapters/{id}/cover** — set cover `{ pageId }` (or upload/assign cover image).
- Entities: **Chapter** `{ id, pageOrder[], coverPageId }`; **Page** `{ position }`.
- Business rules: single cover per chapter; positions recomputed on reorder.
- Authorization: project members with edit permission ([[CS-10]]).
- Side effects: feeds publish flow ([[CS-9]] / [[PUB-1]]); cover used on reader/work pages.

## Dependencies
- [[CS-9]] [[PUB-1]] — leads into publish.
- [[CS-7]] — chapter/pages context.
- [[CS-10]] — edit permission.

## Notes
- Explicit: header, chapter tabs, 6-col drag grid, cover flag, insertion gap, "＋ Ajouter". Reading direction explicitly excluded (set on reader).
