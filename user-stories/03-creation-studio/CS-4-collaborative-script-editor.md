# CS-4 — Real-time collaborative script editor "Éditeur"

**As a** Writer, **I want** a real-time collaborative editor structured by planche and case, **so that** my co-author and I can write a script together and feed it straight into publishing.

> Screen(s): "Éditeur" · Priority: Must · Fidelity: Explicit

## Frontend

- **Header**: back link "‹ Projet"; work title; chapter selector "Chapitre 2 — La rencontre ▾"; autosave indicator "Enregistré ✓"; collaborator avatars + "2 en ligne"; "Partager" button.
- **Toolbar**: "Style ▾", "B", "I", "U", "≣" (align), "• Liste", "📄 Ouvrir un fichier ▾", "＋ Commentaire".
- **File dropdown** ("📄 Ouvrir un fichier ▾"): scenario-ch5.docx, scenario-ch6.txt, notes-perso.txt, "＋ Importer un fichier…" ([[CS-3]]).
- **Create / edit a scenario from the editor** (2026-07-14): the editor must be reachable even when **no `.txt`/`.docx` scenario file is linked to the card yet** — opening it on such a card starts a **blank new scenario** which is materialized as a `scenario` asset ([[CS-3]], linked to the card) on the first save. Entry points:
  - the **✎ pen icon on the [[CS-2]] kanban card** (today a no-op placeholder) opens the editor on that card's scenario — its existing scenario file if one is linked, else a new blank one;
  - a button in the **card modal's FICHIERS → Scénario section** ([[CS-2]]): "Éditer" on a linked scenario file, or "＋ Nouveau scénario" when the section is empty.
- **Edit an existing scenario file**: opening a linked `.txt`/`.docx` scenario loads its current content into the editor for editing (a `.docx` opens as editable rich text). Saving writes back to that same asset (see the versioning rule below), it does not spawn a duplicate asset.
- **Canvas**: structured planche document — "Planche 5 / 40" header, with "CASE 1 / 2 / 3" blocks each holding a description + dialogue. Live named collaborator cursors (Yuki / Camille colored carets + selection highlights).
- **Right sidebar**: "En ligne" presence list; "Commentaires" anchored per-case; "Camille écrit…" typing indicator.
- **Comment on highlighted text** (2026-07-14, item 5): a comment can additionally anchor to a **selected text range**. When text is selected the composer switches to "Commenter la sélection" and previews the quoted range; posting stores the range (ProseMirror positions + the quoted snippet). The anchored run gets an **inline highlight mark** in the canvas (accent wash + underline, decoration only — never serialized), and the sidebar comment shows the quote « … » plus a **"voir dans le texte"** affordance that selects + scrolls to the run. Case-level comments (no selection) still work unchanged (range optional).
- **A4 pagination on overflow** (2026-07-14, item 24): when a case's content exceeds one A4 page height, visible **page-boundary separators** are drawn every page-height so long content reads as flowing onto successive A4 pages instead of one endless sheet. Implemented as a pure sibling overlay decoration inside each sheet (measured live from the sheet width × A4 ratio), so the caret and scroll stay put on Enter. **Partial/deferred**: this is a lightweight visual paginator, **not** a true content-reflow paginator — text still flows across the boundary rather than being pushed onto a separate sheet with a real gap (a full reflow needs a ProseMirror pagination plugin). The one-sheet-per-case model (item 11) plus these overflow separators is the delivered scope.
- **Autosave vs. versions** (2026-07-14): continuous **autosave persists the working draft in place** ("Enregistré ✓") and does **NOT** create a new file version on every save — that would explode the [[CS-3]] version history. A distinct, explicit **"Enregistrer une nouvelle version"** action in the editor snapshots the current draft as a new `AssetVersion` ([[CS-3]]) — the version count only grows when the author chooses to. Show the current version (e.g. "v3") and, on success, an "Nouvelle version enregistrée" confirmation. (Optional: auto-snapshot on first save / on close if the draft changed since the last version — coarse, not per-keystroke.)
- **Version note — split button** (2026-07-14, item 22): "Enregistrer une nouvelle version" is a **split control** — the primary button snapshots now; an attached **down-chevron** opens a small inline form (a "NOTE (optionnelle)" textarea + "Enregistrer") to attach a note to the new version, then snapshots WITH the note. Same note UX as the [[CS-3]] history modal (`AssetVersionsModal`). Errors are surfaced (toast), not swallowed.
- States: connecting / reconnecting banner; saving vs "Enregistré ✓"; presence join/leave; empty planche; read-only fallback if connection lost; conflict handled by merge (CRDT) not error.
- Validation: planche/case structure preserved on edit; comment requires non-empty text.
- Accessibility: toolbar buttons labelled; collaborator cursors announce author; comments navigable by keyboard; chapter/file dropdowns keyboard-operable.

## Backend

- **GET /pages/{id}/document** — structured planche document `{ plancheNo, total, cases: [{ no, description, dialogue, comments[] }] }`.
- **Real-time channel** (WebSocket / CRDT): broadcast presence, named cursors, selections, typing indicators; apply collaborative edits; periodic autosave.
- **PATCH /pages/{id}/document** — persist autosaved document state (the live editor draft) **in place**; this does NOT create a new [[CS-3]] `AssetVersion`.
- **Scenario ↔ asset binding** (2026-07-14): the editor's document is backed by a `scenario` asset ([[CS-3]]). 
  - **Create-when-none**: opening the editor on a card with no scenario file, then saving, **creates a `scenario` asset and links it to the card** (reuse [[CS-3]] create + `POST /assets/{id}/link`) — no upload needed; the content originates in-app.
  - **Edit-existing**: load the linked scenario asset's current content (`.txt` as text, `.docx` converted to editable rich text), edit, and autosave **in place** to the same asset's current working content.
  - **Explicit new version**: **POST /assets/{id}/versions** (reuse [[CS-3]]) snapshots the current draft as a new `AssetVersion` — called ONLY on the editor's "Enregistrer une nouvelle version" action, not on autosave, so version history stays meaningful.
- **GET /projects/{slug}/assets** — populate file dropdown (filter to texte/scenario) → [[CS-3]].
- **POST /pages/{id}/cases/{caseNo}/comments** — add a per-case comment. Optionally carries a highlighted-text anchor `{ anchorFrom, anchorTo, quote }` (item 5); a range needs both bounds with `from < to`, else it's stored as a plain case-level comment (null anchor). The `ScenarioComment` model + document response expose `anchorFrom`/`anchorTo`/`quote`.
- **POST /pages/{id}/document/versions** accepts an optional `note` (item 22) forwarded onto the new [[CS-3]] `AssetVersion`.
- **POST /pages/{id}/share** — share/grant edit access ("Partager").
- Entities: **Planche/Document** `{ pageId, plancheNo, total, cases[] }`; **Case** `{ no, description, dialogue }`; **Comment** `{ id, caseNo, authorId, text, createdAt, anchorFrom?, anchorTo?, quote? }` (the anchor trio is null for case-level comments — item 5).
- Business rules: structured planche→case→dialogue model is directly exploitable for publishing ([[PUB-1]]); autosave debounced; presence expires on disconnect; **autosave never bumps the version — only the explicit "new version" action does** (2026-07-14), so long editing sessions don't churn the [[CS-3]] version chain.
- Authorization: only members with edit permission ([[CS-10]]); share respects project visibility.
- Side effects: autosave persists the draft in place; the card's "⎘ vN" badge is a **derived rollup of its linked files' versions** ([[CS-2]]/[[CS-3]] — the interim per-card `Page.version` was removed), so it moves only when a new `AssetVersion` is snapshotted; linking a newly-created scenario surfaces a "scénario" file tag on the card.

## Dependencies

- [[CS-3]] — file dropdown / "＋ Importer un fichier…"; the editor's scenario is a `scenario` **asset** (create/link/edit) and "Enregistrer une nouvelle version" reuses CS-3's `AssetVersion` chain.
- [[CS-2]] — editor opened per page/chapter; autosave reflects in kanban.
- [[CS-10]] — edit permission.
- [[PUB-1]] — structured script consumed at publish.

## Notes

- Explicit: header, toolbar, file dropdown contents, planche/case canvas (but as a fullpage/full A4 ratio), live cursors, sidebar presence/comments/typing. CRDT vs OT left tech-agnostic.
- **Create/edit a scenario without an uploaded file + version churn (2026-07-14)**: the editor is the in-app way to author a scenario, not just to view uploaded ones. It opens from the [[CS-2]] card ✎ pen icon or the modal's Scénario section, creates a `scenario` [[CS-3]] asset on first save when none exists, and edits existing `.txt`/`.docx` scenarios in place. Because every autosave becoming a version would flood [[CS-3]]'s `AssetVersion` chain, **autosave writes the working draft in place and only the explicit "Enregistrer une nouvelle version" snapshots a version** — mirror this rule when building CS-4. This supersedes the old "autosave updates the page version badge" side effect (the per-card `Page.version` no longer exists; versioning is per file).
- Editing completeness (user-specified 2026-07-05): the "Éditeur" must be a **very complete** editor — at minimum matching the formatting the prototype demonstrates (and richer where it helps), and sharing the rich-text core with the article editor ([[AD-8]]) so both feel consistent and full-featured rather than two thin toolbars.
