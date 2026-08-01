# CS-6 — Page arrangement before publish "Réorganiser les pages"

**As an** Illustrator, **I want** to reorder a chapter's pages and set the cover before publishing, **so that** the chapter reads in the right order with the right opening image.

> Screen(s): "Réorganiser les pages" (wireframe) · Priority: Should · Fidelity: Explicit · **Status: shipped 2026-08-01** (PR #27)

> **Decisions taken while building — the criteria below are updated to match what shipped.** The cover
> is **positional**: whatever page opens the chapter *is* its cover, so reordering is how the cover
> changes; there is no per-page "designate this one" control and no `coverPageId`. What a chapter does
> store is a **`hasCover` toggle** — whether it opens on a cover at all — and a cover always shows
> **alone** in the reader, never paired into a 2-page spread. A hand-picked cover *image* belongs to the
> project ([[CS-1]] `Project.cover`), not to a chapter. This screen only **rearranges**: adding and
> deleting pages stay on the surfaces that already own them ([[CS-2]] board, [[CS-7]] Chapitres strip).

## Frontend
- **Header**: "Ch.2 · 18 planches" + "Aperçu" + split "Publier ▾" (the publish/cadence bar itself is [[CS-9]]'s screen; "Publier ▾" renders inert until then).
- **Chapter tabs**: "Ch.2 / Ch.1 / Prologue" with hint "↔ glisser pour réordonner".
- **Grid**: 6-column drag-drop grid of page thumbnails; each card has a drag handle "⠿" and a "P. n" label.
- First card flagged "COUVERTURE" — the cover is the first slot, so **reordering reassigns it**. A per-chapter **"Couverture" toggle**, in the tab panel above the grid, says whether the chapter opens on one at all; off ⇒ no badge and the reader treats page 1 as an ordinary page.
- Active insertion gap shows "déposer ici" during drag.
- ~~"＋ Ajouter" tile at end of grid~~ — **withdrawn**: this screen only rearranges. Create a page from the [[CS-2]] board or the [[CS-7]] strip.
- Note: reading direction (Pages / Webtoon) is set on the reader, not here.
- States: drag-in-progress with drop-target gap; reorder saving indicator; empty chapter ("Aucune page"); loading thumbnails; error (order reverts).
- Validation: at most one cover per chapter (it is the first slot — a second is not representable); order must remain contiguous.
- Accessibility: cards keyboard-reorderable — **arrow keys on the drag handle**, which is a real focusable control, so no separate move buttons are drawn; drag handles labelled "Réorganiser"; cover toggle has accessible label; "P. n" labels read.

## Backend
- **PATCH /chapters/{id}/page-order** — persist new page order `{ pageIds: [...] }`. The body is the chapter's **complete permutation**: a missing / duplicate / foreign id is a 400, which is what keeps positions contiguous against a stale client.
- ~~**PATCH /chapters/{id}/cover**~~ — **withdrawn** (the cover is positional). The **`hasCover` toggle** rides the ordinary **PATCH /chapters/{id}** — it is one more chapter field, not a resource.
- Entities: **Chapter** `{ id, hasCover }`; **Page** `{ position }` — dense `0..n-1`, and `position` *is* the page order (no parallel `pageOrder[]` column to drift from it).
- Business rules: the cover is the first slot; positions recomputed on reorder; a chapter with `hasCover` shows page 1 alone in the reader (never half of a spread).
- Authorization: project members with edit permission ([[CS-10]]).
- Side effects: feeds publish flow ([[CS-9]] / [[PUB-1]]); the reader consumes `hasCover` via the shared `readerPagesShown` rule.

## Dependencies
- [[CS-9]] [[PUB-1]] — leads into publish.
- [[CS-7]] — chapter/pages context; CS-6 reorders the same board cards, through the same `Page.position`.
- [[CS-10]] — edit permission.

## Notes
- Explicit: header, chapter tabs, 6-col drag grid, cover flag, insertion gap. Reading direction explicitly excluded (set on reader).
- The prototype's "＋ Ajouter" tile and its publish/cadence bar are drawn but deliberately not built here — see the decisions block above and [[CS-9]].
