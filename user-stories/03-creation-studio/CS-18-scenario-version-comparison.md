# CS-18 — Scenario version comparison "Comparer les versions"

**As a** co-author, **I want** to compare two versions of a scenario side by side with the changes highlighted (and delete a version I no longer want), **so that** I can see exactly what changed between revisions and keep the version history clean.

> Screen(s): the [[CS-3]] version history modal (`AssetVersionsModal`) + reused by the [[CS-5]] review · Priority: Should · Fidelity: **Inferred** (extends the drawn version-history modal; grade against the criteria)

## Concept
A **reusable scenario diff**: pick any two versions of a `scenario`/`texte` asset and see a GitHub-style change view. This is the **shared** comparison that [[CS-5]]'s scénario review surface reuses (same diff util) — built here as a general capability in the version history, not only inside a review round. Plus **version deletion** so the linear chain doesn't accumulate dead revisions.

## Frontend
- **From the version history modal** ([[CS-3]] `AssetVersionsModal`): each version row gains a **"Comparer"** affordance; selecting two versions (or "compare with previous"/"compare with active") opens the diff. Default pairing: **selected ↔ its previous** (override to any two).
- **Two-pane text diff (GitHub-style)**: left = the older version, right = the newer, with **line/paragraph** changes and **intra-line word** insert/delete highlighting (added = green-ish wash, removed = red-ish strike/wash — on-brand, and conveyed as text too, not colour-only). A **unified/inline** toggle is optional (side-by-side is the default; stacks on narrow widths).
- Version labels shown (e.g. "v2 ↔ v4"), with each version's note/date/author. Sync-scroll the panes where lengths allow.
- **Delete a version**: a **trash** affordance on a version row (SVG icon, never emoji), **member-gated to the version's author or a project leader**; opens `ConfirmDialog`. Optimistic removal + restore-on-error.
  - Guards: **cannot delete the only remaining version**; deleting the **active/current** version **repoints** `currentVersion`/`mediaId` to the nearest remaining version (per the [[CS-3]] active-version rule) before removal, so nothing downstream is left dangling.
- States: nothing-to-compare (single version → compare disabled with a hint); loading the two contents/diff; identical versions ("Aucune différence"); delete in progress / blocked (only version) / error.
- Accessibility: "Comparer"/trash buttons labelled; added/removed runs announced as text; diff panes navigable by keyboard; delete confirm focus-trapped.

## Backend
- **Diff source**: the two versions' contents come from the existing [[CS-3]] `GET /assets/{id}/versions` chain + each version's blob/text. The diff itself is a **shared, tested util in `packages/shared`** (line + intra-line word LCS) so FE/BE agree and [[CS-5]] reuses it; compute **client-side** from the two contents (no new endpoint, no heavy dependency) — **[decision, see Notes]**.
- **DELETE /assets/{id}/versions/{version}** — remove one `AssetVersion`. **Author-or-leader** only (server-side; never trust a client claim). **409** if it's the **only** version; if it's the **active** version, repoint `currentVersion`/`mediaId`/`size` to the nearest remaining version first (reuse the [[CS-3]] active-version repoint), then delete the row and its [[F-10]] media blob. **404** for an unknown version.
- Business rules: the version chain stays **linear** ([[CS-3]]); deleting never orphans the active pointer or a card's derived "⎘ vN" badge ([[CS-2]]); at least one version always remains.
- Authorization: project members to view/compare; **author or leader** to delete — server-side.
- Side effects: deleting the active version moves the card's derived version badge to the new head ([[CS-2]]); a linked scenario's editor ([[CS-4]]) reflects the repointed head.

## Acceptance criteria
- From the version history, a member can pick two versions and see a side-by-side diff with line + word-level insert/delete highlighting; identical versions show "Aucune différence"; a single-version asset disables compare.
- The same diff util powers [[CS-5]]'s scénario review surface (shared, not duplicated).
- A version's author or a project leader can delete a version (with confirm); a member who is neither sees no trash and a forged `DELETE` returns 403.
- Deleting the only version is rejected (409); deleting the active version repoints current to the nearest remaining version (card badge/preview/editor follow) and never leaves a dangling pointer.

## Dependencies
- [[CS-3]] — the `Asset`/`AssetVersion` chain, `AssetVersionsModal`, and the active-version repoint reused for delete.
- [[CS-4]] — a linked scenario's editor reflects a repointed head after a version delete.
- [[CS-5]] — reuses this comparison (the scénario review surface) and the shared diff util.
- [[CS-2]] — the derived "⎘ vN" card badge follows a version delete/repoint.
- [[F-10]] — the deleted version's media blob is removed.

## Notes
- **Decision (2026-07-15)**: the scenario diff is computed **client-side** from the two version contents using a **shared LCS-based util** in `packages/shared` (line + intra-line word) — no new endpoint and no heavy diff dependency; [[CS-5]] imports the same util so the review round and the history modal render identically. (Flag if you'd prefer a server-computed diff endpoint instead.)
- **Delete included** (per standing rule): version deletion with author/leader gating, only-version + active-version guards, and active-pointer repoint. This is the "keep the chain clean" half of the story.
- **Ponytail**: reuse `AssetVersionsModal`, `ConfirmDialog`, the [[CS-3]] active-version repoint, and one shared diff util; no duplicate diff logic across CS-5/CS-18.
