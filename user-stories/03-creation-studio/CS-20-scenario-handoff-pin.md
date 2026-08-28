# CS-20 — Scenario handoff pin "Passation du scénario"

**As an** illustrator, **I want** the card to record which scenario version I started drawing against and tell me when the scenarist has changed it since, **so that** I never ink a page against a script that was quietly rewritten last Tuesday.

> Screen(s): the [[CS-2]] board card + card modal · the [[CS-4]] editor header · Priority: **Must** · Fidelity: **Inferred** (no drawn frame — a coordination layer over the drawn board; grade against the criteria)

## Why this story exists

Today the scenario→drawing handoff is a card dragged from **Scénario** to **Nemu**. Nothing records
*which* scenario version the artist is drawing against, so the classic failure is silent: the artist inks
page 7, the scenarist rewrote case 3 after the handoff, and nobody finds out until review.

Both halves of the fix already exist and are unconnected:
- [[CS-3]] gives a linear, explicit version chain per asset (`AssetVersion`, `@@unique([assetId, version])`).
- [[CS-5]] already pins corrections to a version (`filedAgainstVersion` / `resolvedInVersion`) — the same
  idea, applied to a correction instead of a card.
- The **comparison view is already built**: `CompareVersionsModal` (shipped in the CS-5 iter-5 pass) renders
  any two versions side by side on the A4 sheet with word/line diff annotation (`version-compare.ts`),
  synchronised scrolling, and server-sanitized HTML from `GET /pages/:id/review`.

This story is the missing wire: pin the version onto the card, and point the existing modal at the pin.

## Frontend
- **On leaving Scénario**: moving a card out of the `scenario` stage stamps the handoff. If the card's
  linked scenario asset has unsaved editor changes, offer « Créer une version puis passer en Nemu »
  (reusing the [[CS-4]] snapshot action) — otherwise pin the current head silently. A card with no linked
  scenario asset moves with no pin and no prompt.
- **The staleness banner**: when the pinned version is behind the asset's head, the card (board face and
  card modal) shows a quiet, non-blocking marker — « Le scénario a changé depuis la passation » — plus the
  version pair (e.g. « v2 → v5 »). Never a modal, never blocking: it is information, not a gate.
- **Clicking the banner opens `CompareVersionsModal`** pre-set to `from` = the pinned version, `to` = head.
  Do **not** build a second diff view — pass the pin in as the default pairing.
- **Acknowledge**: the modal gains one action, « J'ai pris connaissance » (`.ep-btn-success`), which re-pins
  the card to head and clears the banner. Available to anyone holding « Écriture ».
- The pin is visible on the card modal's file row even when current (« dessiné d'après v5 »), so the state
  is legible before it goes stale.
- States: no pin (older cards, or no scenario asset) → no banner, no marker; pin == head → the quiet
  current label; pin < head → the banner; asset deleted → the pin is dropped and the banner hides.
- Breakpoints ~375 / ~768 / ~1280: the banner wraps under the card title on mobile and never widens the
  card; the compare modal already stacks its panes on narrow widths.

## Backend
- **Schema** — pin the pair, not just the number (a card can link several scenario assets):
  ```prisma
  model Page {
    drawnAgainstAssetId String? @db.Uuid
    drawnAgainstAsset   Asset?  @relation("PageHandoffPin", fields: [drawnAgainstAssetId], references: [id], onDelete: SetNull)
    drawnAgainstVersion Int?
    @@index([drawnAgainstAssetId])
  }
  ```
  Migration `add_page_handoff_pin`. Both nullable — existing cards have no pin and must not be back-filled
  with a guess. `SetNull` on asset delete drops the pin cleanly, and the FK carries its own index
  (repo DB rule: every FK is indexed).
- **PATCH /pages/{id}/stage** (existing) additionally stamps `drawnAgainstAssetId` + `drawnAgainstVersion`
  from the card's linked scenario asset when the card leaves `scenario` and no pin exists. « Écriture »,
  as today. Never overwrites an existing pin — re-pinning is the explicit acknowledge below.
- **POST /pages/{id}/handoff/acknowledge** — re-pin to the asset's current head. « Écriture ». `409` if the
  card has no pin; idempotent when already at head (returns the pin unchanged, no error).
- **DELETE /pages/{id}/handoff** — drop the pin (the card is no longer drawn against a fixed script).
  « Écriture »; `404` when there is no pin. FE affordance sits in the card modal's file row behind a
  `ConfirmDialog`.
- The workspace payload (`WorkspacePage`) grows `handoff: { assetId, version, headVersion, stale } | null`
  — `stale` derived server-side so the board never recomputes it per card (no N+1: one grouped read of the
  linked assets' `currentVersion` for the whole board query).
- No new diff endpoint: the modal already sources both panes from `GET /pages/:id/review`.

## Acceptance criteria
- Dragging a card out of Scénario stamps `drawnAgainstAssetId`/`drawnAgainstVersion` from its linked scenario asset; a card with no scenario asset moves with no pin and no error.
- Saving a **new version** of that scenario makes the card show the staleness banner with the correct version pair, on the board face and in the card modal.
- Clicking the banner opens the existing compare modal pre-set to pinned ↔ head — not a newly built diff.
- « J'ai pris connaissance » re-pins to head, clears the banner, and is reflected for another member without a reload of the board (refetch is enough — no WS requirement).
- A member without « Écriture » sees the banner but gets **403** on acknowledge and on delete.
- Deleting the pinned asset drops the pin (`SetNull`) and hides the banner rather than 500-ing.
- The board list query issues no per-card version lookup (asserted in the service spec).

## Dependencies
- [[CS-2]] — the board, the card modal, `PATCH /pages/{id}/stage`.
- [[CS-3]] — `Asset` / `AssetVersion`, the linear chain, `AssetPageLink`.
- [[CS-4]] — the editor's snapshot action ("Enregistrer une nouvelle version").
- [[CS-5]] — `CompareVersionsModal` + `version-compare.ts` + the review endpoint that sanitizes both panes.
- [[CS-10]] — « Écriture » gates the stamp, the acknowledge and the delete.

## Notes
- **Reuse, do not rebuild.** The comparison UI, the diff util (`packages/shared/src/textdiff.ts`), the
  sanitized two-pane payload and the A4 `VersionSheet` all exist. If this story grows a second diff
  renderer, it has gone wrong.
- **Security invariant (inherited, non-negotiable):** scenario HTML is attacker-controlled — any member can
  POST arbitrary version content. Both panes MUST come from the review endpoint's `sanitizeScenarioHtml`
  output. Never pass live `editor.getHTML()` or raw Yjs content into the sheet's `innerHTML` sink.
- The pin is deliberately **per card**, not per chapter: a chapter's pages are drawn at different times.
- Out of scope: blocking a stage move on staleness (this is information, not a gate), and any automatic
  re-pin on version save — acknowledgement is a human act.
