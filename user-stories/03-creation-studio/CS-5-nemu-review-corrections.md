# CS-5 — Review & corrections "Révision & corrections"

**As a** co-author (Writer or Illustrator), **I want** to review a page's scenario and drawing across versions and file precise, tracked correction requests, **so that** scenario and drawing fixes are resolved — and visibly _addressed in a new version_ — before the page goes clean.

> Screen(s): "Révision · corrections" (prototype `data-page="nemu"`) · Priority: Must · Fidelity: **Explicit** (screen drawn) with **induced deviations** (the version-diff review workflow below extends what the prototype sketches — see Notes)

## Concept — a version-based review round (PR-style)

A correction is filed **against a specific file version** and considered addressed when a **newer version** resolves it. The review screen is a **two-version compare**: the reviewed version (with the correction notes anchored) beside the new version (with the changes highlighted). This replaces the old flat "pin → resolve" model (the interim `Pin` + `CorrectionRequest` split is removed; unify into one **`Correction`** with a polymorphic anchor). The status lifecycle is unchanged — **à corriger → en cours → corrigé** — and a page only leaves "Corrections" for "Propre" ([[CS-2]]) once its corrections are `corrigé` and the reviewer **validates**.

## Unified `Correction` model

One entity, one lifecycle, two **anchor** kinds:

- **`scenario`** — anchored to **script text**: `{ documentId, from, to, quote }` (the exact [[CS-4]] comment anchor — reuse it, don't reinvent). Created **from inside the editor** ([[CS-4]]): select text → "Demander une correction" (a sibling of "Commenter").
- **`dessin`** — anchored to a **region of the nemu**: `{ assetId, region: { x, y, w, h } }` normalized 0–1 (survives scaling); optionally tagged with the `caseRef` the box falls in. Created **on this review screen**: drag a box on the image.
- **Shared**: `type`, `description` ("what specifically" to change — required), `status`, `authorId`, `assigneeId?`, **`filedAgainstVersion`** (the asset version reviewed), **`resolvedInVersion?`** (set when marked corrigé), `createdAt`. The anchor answers **which area**; the description answers **what specifically** — both required.

## Frontend

- **Header** (prototype-verbatim): "‹ Projet" · "Révision · corrections" · status pill "En révision" · a **Scénario / Dessin** segmented toggle (switches the review surface) · a **"Fichier : … ▾"** picker (choose the file under review) · a green **"✓ Valider les modifications"** button (right-aligned). Collaborator avatars.
- **Version compare — auto-picked, override-able**: by default compare **`filedAgainstVersion` ↔ current head**; the `Fichier ▾` picker (and a version dropdown beside it) lets the reviewer override either side. Show the two version labels (e.g. "v2 ↔ v3").
- **Scénario surface — two-pane text diff (GitHub-style)**:
  - **Left**: the reviewed version's text with the **correction notes highlighted** in place (the same per-correction coloured anchor wash as [[CS-4]]); each highlight ties to its list row.
  - **Right**: the new version's text with the **change diff highlighted** — line/paragraph level with **intra-line word** insert/delete highlighting (added / removed). No auto re-anchoring across versions: each pane shows its own version.
  - Panes scroll together (synchronised) where lengths allow; on narrow widths they stack (old above new).
- **Dessin surface — region-annotated nemu**:
  - The nemu page on the left with **numbered boxes** drawn over the corrected areas; box colour by status (red "à corriger", green "corrigé"). Draw-a-box mode to place a new one.
  - On validate / when a newer version exists, a **side-by-side compare**: old image (with boxes) ↔ new image. **No automatic pixel-diff** (unreliable on arbitrary art) — the reviewer eyeballs whether the area was addressed.
- **Right — "Demandes de correction"** (unifies both types):
  - Autofilters with the Scenario / Dessin toggle (+ optional status filter), auto-applied (no "Appliquer").
  - List rows: number, author, **case/anchor reference**, type chip ("Dessin" / "Scénario"), status ("À corriger / En cours / ✓ Corrigé"), description, and the target version. Clicking a **scénario** row **deep-links into the editor** at that text; a **dessin** row highlights/scrolls to its box. Selecting a row highlights its anchor and vice-versa.
- **Composer** (dessin surface): "Décrire la correction…" + the drawn region + "Demander". (Scénario corrections are composed in the editor, not here.)
- Entry points: kanban card "⚑ corrections" / "Voir les corrections →" ([[CS-2]]); the editor's "Demander une correction" ([[CS-4]]) for scenario.
- States: empty ("Aucune demande"); drawing-a-box mode; submitting; status-change in progress; loading versions/diff; **no newer version yet** (right pane shows "Aucune nouvelle version — en attente des corrections"); error on save. Read-only fallback for non-members.
- Validation: description required; a dessin correction needs a drawn region; a scenario correction needs a text range (`from < to`). "Valider les modifications" is enabled only when **every** correction on the page is `corrigé`.
- Accessibility: boxes/anchors are focusable buttons announcing status + number; the Scénario/Dessin toggle is a radiogroup; diff added/removed runs are conveyed as text (not colour-only); list rows link to their anchor; composer labelled with current type.

## Backend

- **GET /pages/{id}/review?file=&from=&to=** — the review payload: the file(s) under review, available versions, both selected versions' content (scenario → text/HTML of each version; dessin → the two image URLs), and the page's corrections (both types). Auto-selects `filedAgainstVersion ↔ head` when `from`/`to` omitted.
- **Scenario text diff**: computed from the two version contents — a shared, tested diff util in `packages/shared` (line + intra-line word LCS) so FE/BE agree; the API may return the precomputed diff or the two contents for the client to diff (pick one, record it). No new heavyweight dependency for a small diff.
- **POST /pages/{id}/corrections** — create a `Correction`. Body carries `type` + the matching anchor (`scenario`: `{ documentId, from, to, quote }`; `dessin`: `{ assetId, region }`) + `description`, and stamps `filedAgainstVersion` from the current head of that file. Reuse this for the editor's "Demander une correction" (scenario) and the review screen (dessin).
- **PATCH /corrections/{id}** — update status (`a_corriger|en_cours|corrige`); marking `corrige` stamps `resolvedInVersion = current head`.
- **GET /pages/{id}/corrections?type=&status=** — filter; **paginated**.
- **POST /pages/{id}/review/validate** — the reviewer validates: requires **all** corrections `corrige`; performs the [[CS-2]] Corrections → Propre transition (or returns 409 if any is unresolved). Idempotent.
- Entities: **`Correction`** `{ id, pageId, type, anchor (polymorphic: scenario text-anchor | dessin region), description, status, authorId, assigneeId?, filedAgainstVersion, resolvedInVersion?, createdAt }`. Migrate/replace the interim `Pin`/`CorrectionRequest`.
- Business rules: anchor colour/box colour derives from status; a correction is "addressed" only when `resolvedInVersion > filedAgainstVersion`; validate is gated on all-corrigé.
- Authorization: project members ([[CS-10]]); **author and assignee** change a correction's status; the reviewer/owner validates. Server-side only — never trust a client role/authorship claim.
- Side effects: new correction / status change / resubmit (new version) notifies the relevant collaborator ([[F-5]]); validating unblocks the kanban "Corrections → PROPRE" transition ([[CS-2]]); each version referenced is a [[CS-3]] `AssetVersion`.

## Acceptance criteria

- A scenario correction created in the editor ([[CS-4]] "Demander une correction") appears in the CS-5 list with a scénario chip and deep-links back to its text; a dessin correction drawn on the nemu appears with a dessin chip and highlights its box.
- The Scénario surface shows the reviewed version (notes highlighted) on the left and the new version with the change diff (word-level insert/delete) on the right; versions default to `filedAgainstVersion ↔ head` and can be overridden via the file/version picker.
- A correction records both an **area** (text range or image region) and **what specifically** (description); both are required to submit.
- Marking a correction `corrigé` stamps the resolving version; "Valider les modifications" is blocked (409 / disabled) until **all** corrections are `corrigé`, then transitions the card Corrections → Propre.
- A forged status change by a non-author/non-assignee, or a validate by a non-member, is rejected server-side.
- Filters (Toutes/Scénario/Dessin, status) compose and auto-apply; empty and "no newer version yet" states render.

## Dependencies

- [[CS-2]] — reached via "⚑ corrections"; validate feeds the kanban Corrections → Propre gate.
- [[CS-3]] — corrections are filed against / resolved in `AssetVersion`s; the file/version picker and the compare read the version chain.
- [[CS-4]] — scenario corrections **reuse the comment text-anchor** and are **created from the editor** ("Demander une correction"); deep-link back into the editor. (This adds a correction-creation entry point to CS-4 — record when building.)
- [[F-5]] — collaborator notifications on new/changed/resubmitted corrections.
- [[CS-10]] — membership / who may change status and validate.

## Notes

- **Design decisions (2026-07-15, brainstormed & approved)**: (1) version comparison **auto-picks** `filedAgainstVersion ↔ head`, with a picker override; (2) scenario diff is **line/paragraph with intra-line word** highlighting (GitHub-like); (3) dessin uses **side-by-side old(with boxes) ↔ new**, **no auto pixel-diff**. Lifecycle (à corriger→en cours→corrigé→valider→Propre) kept as-is per the reviewer's preference.
- **Induced deviation from the prototype**: the prototype draws the screen (header toggle, file picker, "Valider les modifications", pinned nemu, list, composer) but not the full two-version diff nor the scenario-in-editor anchoring. We **keep the prototype's look/controls** and extend behaviour to the review-round model above; graded against this spec, not the raw wireframe. Reason: the flat pin-and-resolve model conflated two different targets (script text vs artwork) and lacked a before/after, making "was this actually fixed?" invisible.
- **Unification**: `scenario` corrections are the [[CS-4]] comment anchor with a `type=correction`/status flavour (reuse), NOT a parallel system; `dessin` corrections are the spatial half. One `Correction` entity, one list, one lifecycle.
- **Ponytail**: reuse the CS-4 anchor + highlight, CS-3 version chain, CS-2 kanban transition, the design-system compare/toggle controls; a small shared text-diff util rather than a heavy dep; no auto pixel-diff.
- **Delete**: Do not forget to implement a way to delete a review note.
