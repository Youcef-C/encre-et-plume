# AD-9 — Contest administration

**As an** Admin, **I want** to oversee contests created by editors, **so that** entries are monitored, winners are designated, and contests are approved and closed cleanly.

> Screen(s): admin/editor "concours" tab (prototype CSS; only entry points drawn) · Priority: Could · Fidelity: Inferred

## Frontend
- Contest list in the admin console: each contest with title, owning editor, status (e.g. en attente / actif / clôturé), entry count, and dates.
- Actions per contest: "Approuver" (approve a contest submitted by an editor, [[PE-6]]), view/monitor entries ([[PUB-7]]), designate winner(s), and "Clôturer".
- Entries view: list of participant entries with the ability to mark "Gagnant·e".
- States:
  - Empty: "Aucun concours".
  - Loading: skeleton list / entries; spinner on status changes.
  - Error: toast on failure; status unchanged.
- Validation: confirm approve/close; winners can be designated only on a contest with entries; closing is confirmed.
- Accessibility: list and entries have headers/labels; status has text label; action buttons named with contest context.

## Backend
- **GET /admin/contests?status=** — list contests with status + entry counts.
- **GET /admin/contests/{id}/entries** — participant entries (from [[PUB-7]]).
- **PATCH /admin/contests/{id}** — `{ status: "approve"|"close" }`.
- **PATCH /admin/contests/{id}/entries/{entryId}** — `{ winner: true|false }`.
- Entities **Contest**: `id, title, editorId, status (pending|active|closed), startAt, endAt`; **ContestEntry**: `id, contestId, participantId, submissionRef, isWinner`.
- Business rules: contests are created by editors ([[PE-6]]); admin approval moves `pending → active`; closing freezes entries; winners flagged on entries.
- Validation: `status`/`winner` flags; cannot pick winners before entries exist or after invalid transitions.
- Authorization: `admin` ([[F-2]]) (editors manage their own per [[PE-6]]).
- Side effects: approval/closure and winner designation notify the editor and participants ([[F-5]]); closed contests + winners may surface in the feed ([[PUB-8]]).

## Dependencies
- [[PE-6]] — contests are created by editors and overseen here.
- [[PUB-7]] — reader entries being monitored.
- [[AD-1]] — host console.
- [[F-2]] — authorization; [[F-5]] — notifications; [[PUB-8]] — winner/feed surfacing.

## Notes
- Inferred: derived from prototype `concours` admin/editor tab CSS; only entry points are drawn. Approval/winner/close flows and entity fields are conservative placeholders pending design.
