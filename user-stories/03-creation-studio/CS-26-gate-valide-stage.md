# CS-26 — Gate the VALIDÉ stage "Verrou de la colonne VALIDÉ"

**As a** project leader, **I want** a card to refuse to enter VALIDÉ while corrections are still open against its current files, **so that** the terminal column means the same thing the PROPRE transition already means.

> Screen(s): the [[CS-2]] board (drag + the card `⋯` menu) · Priority: Should · Fidelity: **Inferred** (a rule on a drawn screen; grade against the criteria)

## Why this story exists

The flow has exactly one invariant-checked transition, and it is the best-designed part of it:
**Corrections → PROPRE** requires zero unresolved corrections, returns `409` « Corrections non résolues »
with the count, and is idempotent (`corrections.service.ts:243-255`).

**Encrage → VALIDÉ** — the terminal move, the one chapter progress counts as done
(`KanbanBoard.tsx:41`) — is an unchecked drag. A card can reach the column that means *finished* carrying
open corrections filed against the very files it ships.

The asymmetry is the whole story. The machinery already exists; this applies it symmetrically.

## Frontend
- **Blocked move**: dragging (or `⋯`-menu-moving) a card into **VALIDÉ** while corrections are open against
  its current asset versions fails with the existing optimistic-revert path and a toast — « Corrections non
  résolues (n) » — plus a link to the card's review screen. Same shape as the existing PROPRE `409`, so no
  new error UI is introduced.
- **Pre-empt the failure**: a card with open corrections shows the count on its face (it already shows a
  comment count — reuse that row's treatment), so the block is predictable rather than surprising.
- Moving a card **out** of VALIDÉ, or between any other pair of stages, is unchanged and unguarded.
- States: card with no linked assets (no corrections possible → moves freely); corrections open but all
  filed against **superseded** versions (allowed — see Backend); block in flight; block failed for another
  reason (the generic toast).
- Breakpoints ~375 / ~768 / ~1280: the toast is reachable and dismissible at every width; the card-face
  count does not widen the card.

## Backend
- **PATCH /pages/{id}/stage** gains one rule, and only for the terminal stage: entering `valide` requires
  zero corrections in a non-`corrige` status **whose `filedAgainstVersion` equals the current
  `currentVersion` of the asset they were filed against**. Otherwise `409`, body shaped exactly like the
  existing validate conflict — `{ message: 'Corrections non résolues', unresolved: n }`.
- **The version qualifier is the point.** A correction filed against v2 of a file now at v5 has been
  superseded by two versions; blocking on it would make the column unreachable for any long-lived page.
  Blocking on corrections against the **current** version is the honest reading of "this file still has
  known problems". The `@@index([assetId, status])` on `Correction` already supports the query.
- Reuse, do not duplicate: extract the unresolved-count check that `CorrectionsService.validate` performs
  into one shared helper both call sites use, so the rule cannot drift between PROPRE and VALIDÉ. This is
  the same reasoning that put `assertCanWrite` in one place after it was wired per-route twice.
- Gate unchanged: moving a card is « Écriture », as today. No new permission, no leadership requirement.
- No schema change.

## Acceptance criteria
- Moving a card to VALIDÉ with an open correction filed against a file's **current** version returns **409** with the count; the card stays in Encrage and the board reverts the optimistic move.
- The same move **succeeds** when every open correction was filed against a **superseded** version.
- The same move succeeds when all corrections are `corrigé`, and when the card has no linked assets.
- Moving a card **out** of VALIDÉ, and every non-terminal transition, is unaffected — asserted, so the guard cannot creep into other columns.
- The Corrections → PROPRE validate route behaves exactly as before (its spec passes unmodified).
- Both call sites resolve the count through **one** helper — a grep shows no second implementation of the unresolved-count rule.
- A member without « Écriture » still gets **403**, and the 403 takes precedence over the 409.

## Dependencies
- [[CS-2]] — the board, `PATCH /pages/{id}/stage`, the optimistic-revert path, the toast stack.
- [[CS-5]] — `Correction`, `filedAgainstVersion`, and the `validate` check being generalised.
- [[CS-3]] — `Asset.currentVersion`, the comparison the qualifier reads.
- [[CS-10]] — « Écriture » still gates the move.

## Notes
- **This is the only Kanban-side change worth making.** The six columns are right; resist adding per-stage
  review rounds or further gates until real usage demands them. One symmetric rule on the terminal column,
  and stop.
- **Idempotence**: a card already in `valide` that is "moved" to `valide` must stay a no-op, not a `409` —
  mirror the PROPRE route's idempotent branch exactly.
- Out of scope: gating any other transition, blocking publish, and any notification on a blocked move (the
  toast is the feedback).
