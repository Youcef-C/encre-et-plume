# CS-23 — Stable case references "Références de case stables"

**As a** co-author reviewing a drawing, **I want** a correction to point at an actual case of the script rather than at a typed string, **so that** the review pane can show me the text the box is about — and so the reference survives inserting a case above it.

> Screen(s): the [[CS-4]] editor (case scaffolding) · the [[CS-5]] review composer + correction list · Priority: Should · Fidelity: **Inferred** (extends drawn screens; grade against the criteria)

## Why this story exists

The manga template already produces **structured** cases — `caseBlock` / `caseDescription` / `caseDialogue`,
with `caseBlock` marked `isolating` so edits can never merge two cases (`planche-schema.ts`). The hard part
is done.

Then the structure dies at every boundary, because the only case identity is a **position**:

- `caseBlock` carries `no: { default: 1 }` — a display number, renumbered whenever a case is inserted or
  removed.
- `ScenarioComment.caseNo` is an `Int` keyed to that number.
- `Correction.caseRef` is **free text** ("case 3"), typed by a human.

So inserting a case at the top silently repoints every comment and every correction reference one case
down, and nothing in the review pane can resolve « case 4 » to the words in case 4.

## Frontend
- **`caseBlock` gains a stable `cid`** attribute — a UUID minted when the case is created, serialized as
  `data-case-cid`, never renumbered. `no` stays as the *display* number, derived from document order and
  free to change. Both round-trip through `parseHTML`/`renderHTML` so an imported or re-parsed document
  keeps its identities.
- **Backfill on open**: a document whose cases have no `cid` gets one minted per case on first load by a
  client holding « Écriture », written through the normal CRDT path (so it converges and needs no
  migration). A read-only viewer mints nothing.
- **The review composer** (`Composer.tsx`) replaces the free-text case field with an **`OnBrandSelect`** of
  the document's cases — « Case 3 — "Il se retourne…" » (number + a truncated snippet). Selecting one stores
  the `cid`. « Aucune case » stays available: a correction need not concern a case.
- **The review pane shows the script next to the image**: when a `dessin` correction carries a case
  reference, its row expands to show that case's description + dialogue, read-only — *« cette boîte concerne
  la case 4, qui dit : … »*. Sourced from the sanitized review payload, never from live editor HTML.
- Renumbering is live: if the scenarist inserts a case, an existing correction's row shows the **new**
  display number for the same `cid`, with no edit and no stale label.
- States: no scenario asset linked (the select is absent, not empty); a `cid` that no longer resolves (the
  case was deleted) → « Case supprimée » with the stored snippet, never a crash.
- Breakpoints ~375 / ~768 / ~1280: the script excerpt collapses under the correction row on mobile rather
  than sitting beside it.

## Backend
- **Schema** — add the reference, keep the string:
  ```prisma
  model Correction      { caseCid String? }   // stable caseBlock id; caseRef stays as the display fallback
  model ScenarioComment { caseCid String? }   // alongside the positional caseNo
  ```
  Migration `add_case_cid_references`. Additive; `caseRef` and `caseNo` are not dropped (legacy rows, and
  `caseNo` still drives the sidebar grouping).
- **POST /pages/{id}/corrections** accepts `caseCid`, validated as a UUID and **verified to exist** in the
  target document's `contentJson` projection — an unknown `cid` is a **400**, not a silently stored orphan.
- The review payload (`GET /pages/{id}/review`) resolves each correction's `caseCid` to
  `{ no, description, dialogue }` from `contentJson`, **server-side and sanitized**
  (`sanitizeScenarioHtml`), so the FE never reaches into a live document to render text.
- `contentJson` (the `PlancheDoc` projection written by every autosave) is the resolution source. It already
  exists and is already the "readable projection" — no new storage.
- No N+1: one document read per review payload resolves every correction's case.

## Acceptance criteria
- Creating a case mints a `cid` that survives reload, export/re-import of the document HTML, and a peer's concurrent edit.
- Inserting a case **above** an existing one changes its display `no` and leaves every `caseCid` reference intact — a correction filed on the old « case 3 » still resolves to the same words, now labelled « case 4 ».
- The review composer offers a case picker (an `OnBrandSelect`, never a bare native select, never free text) and « Aucune case » still works.
- A `dessin` correction with a case reference shows that case's script text in the review pane, server-sanitized.
- Deleting the referenced case shows « Case supprimée » with the stored snippet; nothing 500s and the correction stays listed.
- `POST /corrections` with an unknown `caseCid` returns **400** and stores nothing.
- Legacy corrections carrying only `caseRef` still render their string, unchanged.

## Dependencies
- [[CS-4]] — `planche-schema.ts`, the `caseBlock` node, `contentJson` / the `PlancheDoc` projection.
- [[CS-5]] — the review composer, the correction list, the sanitized review payload.
- [[CS-22]] — the sibling fix for the *text-range* anchor; land that first so both anchor kinds are durable before rows accumulate.
- [[F-20]] — `OnBrandSelect` (no native select may render anywhere in the app).

## Notes
- **This is the foundation for lettering.** Flowing dialogue from cases into lettering placeholders at
  **Encrage** is the feature that eventually justifies the whole structured editor, and it is impossible
  while a case's identity is its position. Case-linked corrections alone justify the change now; the
  lettering step is explicitly **out of scope** here.
- **Do not renumber `no` in the CRDT.** Display numbers are derived at render from document order. Writing
  them back through Yjs would make every insert a document-wide write and a merge conflict generator.
- Out of scope: migrating `ScenarioComment.caseNo` off positions (the column stays and keeps working),
  cross-planche case references, and any lettering/placeholder work.
