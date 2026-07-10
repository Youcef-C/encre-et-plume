# MC-14 — Call capacity: auto-close when full, reopen when a seat frees

**As a** call owner (and as an applicant browsing the board), **I want** a call to automatically stop accepting new applications once all its sought seats are filled — and to reopen automatically if a validated seat later frees — **so that** I don't over-recruit, the board never shows a full call as open, and a genuinely freed spot becomes applyable again.

> Screen(s): the board "Appels à projets" ([[MC-4]]) + the received-applicants view ([[MC-7]]) · Priority: Should · Fidelity: **Inferred** (no drawn frame — a lifecycle rule; grade against the criteria) · Epic: Matching & Collaboration

## Context
`ProjectCall.status` is `open` | `closed`, with a per-role seat model: `seats` (sought per role) and filled seats DERIVED from **accepted** applications grouped by `appliedAs` ([[MC-7]]). A helper **`CallsService.closeIfFilled(callId)`** already exists (unit-tested) that flips `status → 'closed'` when every sought seat is filled, but it is **not wired** — a fully-staffed call keeps accepting applications past capacity (QA-found gap). A naive wire (close on the last accept) was tried and **reverted** because it broke the [[MC-6]]/[[MC-7]] behavior "freeing a seat lets the call seek again": once auto-closed, removing/withdrawing a validated applicant left the call **stuck closed**. There is also a **manual** close (`Clôturer l'appel`, [[MC-4]] amendment) that must STAY closed regardless of freed seats. So the correct design needs an **auto vs. manual close distinction** plus a symmetric **reopen**.

## Backend
- **Close-reason model**: add a way to distinguish an **auto-close (full)** from an **owner manual close** — e.g. `ProjectCall.closedReason: 'full' | 'manual' | null` (null while open), or an equivalent flag. Migration + backfill (existing `closed` rows → `'manual'` conservatively; `open` → null).
- **Auto-close on fill**: after `ReceivedApplicationsService.decide(..., 'accepted')` commits, call **`closeIfFilled`** — when every sought seat is now filled, set `status='closed'`, `closedReason='full'`. Idempotent; only on accept; a partial fill leaves it open. Do NOT auto-close on a manual path.
- **Reopen on freed seat** (the symmetric half): after **[[MC-7]] remove-accepted** and **[[MC-6]] withdraw-accepted** free a seat, call a new **`reopenIfSeatFreed(callId)`** — if the call is `status='closed'` **AND `closedReason='full'`** AND now has ≥1 free seat, set `status='open'`, `closedReason=null`. A **manually** closed call (`closedReason='manual'`) is **never** auto-reopened.
- **Manual close** (`Clôturer l'appel`, [[MC-4]]) sets `status='closed'`, `closedReason='manual'` and stays closed (owner may reopen manually only if the story later adds that — out of scope here).
- **Application gate**: `POST /calls/:id/applications` on a `closed` call → 409 (unchanged). Board `GET /calls?status=open` excludes closed calls (unchanged). Accepting past a role's capacity is prevented by the closed state (and, defensively, a per-role seat check on `decide`).
- Authorization: owner resolved server-side; the auto transitions are system-driven, not client-claimed.

## Frontend
- The board card + detail already reflect `status` ([[MC-4]]/[[MC-7]]) — verify a call that auto-closes on the last accept immediately shows as closed (no "Candidater"), and one that reopens on a freed seat shows "Candidater" again, live/after refetch.
- No new controls required; this is a lifecycle/data-consistency story. If the owner view distinguishes "complet" (auto, reopenable) from "clôturé" (manual), surface that label (Inferred — optional).

## Acceptance criteria
- Accepting the **last** sought seat auto-closes the call (`status closed`, reason `full`); accepting a **non-final** seat leaves it open.
- **Removing** ([[MC-7]]) or the applicant **withdrawing** ([[MC-6]]) a validated (accepted) applicant on a **full/auto-closed** call **reopens** it (`open`) and it accepts applications again — the existing MC-6/MC-7 "seek again" e2e (`calls-batch-fixes` Item 2 / Item 6 expecting `status: 'open'`) passes WITH auto-close wired.
- An owner **manual** close (`Clôturer l'appel`) stays **closed** even if a seat later frees.
- `POST /applications` on a closed call → 409; the open board excludes closed calls; no accepting past role capacity.

## Dependencies
- [[MC-4]] — the call, board, `status`, manual `Clôturer l'appel`.
- [[MC-5]] — apply; the seat/`appliedAs` model.
- [[MC-6]] — withdraw an accepted application frees a seat (reopen trigger).
- [[MC-7]] — owner accept (`decide`) + remove an applicant (close/reopen triggers).

## Notes
- **History**: `closeIfFilled` exists + is unit-tested; wiring it alone (without reopen + the reason flag) was reverted (broke seat-freeing) — this story does it correctly: close **and** reopen, auto-only, manual-close preserved.
- **Ponytail**: reuse `closeIfFilled` and the derived seat counts; add the minimal `closedReason` flag + `reopenIfSeatFreed` + the two wire points (decide-accept, remove/withdraw). No new endpoints.
