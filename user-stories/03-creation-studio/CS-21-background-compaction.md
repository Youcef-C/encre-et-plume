# CS-21 — Background compaction "Enregistrement continu"

**As a** co-author writing in the shared editor, **I want** my work to persist itself, **so that** I stop believing there is such a thing as an unsaved edit in a real-time document.

> Screen(s): the [[CS-4]] editor header (« Enregistrer » disappears; « Enregistrer une nouvelle version » stays) · Priority: Should · Fidelity: **Inferred** (behavioural change to a drawn screen; grade against the criteria)

## Why this story exists

The editor currently has **three** persistence tiers:

1. live CRDT updates — already durable, appended as `ScenarioUpdate` rows by the `/editor` gateway;
2. **explicit « Enregistrer » / `Ctrl+S`** — compacts those rows into `ScenarioDocument.ydocState` and
   refreshes the `contentJson` projection (`scenario-documents.service.ts:169-207`);
3. explicit « Enregistrer une nouvelle version » — a real `AssetVersion` snapshot.

Tier 2 is a **lie in a collaborative editor**. The edits are already shared and already persisted before
the button is pressed; what the button does is compaction, which is housekeeping, not intent. Worse, it
teaches users that unsaved means private — which Yjs makes false, and which no amount of copy fixes.

The mechanism to keep is already correct and already transactional. Only the **trigger** changes.

## Frontend
- **Remove « Enregistrer » and the `Ctrl+S` binding** from the editor header (`EditorClient.tsx`). Remove
  the `dirty` state and its warning affordances.
- **Replace with a passive status**, in the same header slot: « Enregistré » / « Enregistrement… » /
  « Hors ligne — les modifications reprendront à la reconnexion ». It reports, it is never a button. Reuse
  the existing collab status (`CollabStatus` from `editor-collab.ts`) rather than inventing a second
  indicator: connection state and persistence state are one story to the user.
- **The client triggers compaction on idle**, debounced ~5 s after the last local change and flushed on
  `visibilitychange` → hidden and on unmount, so a closing tab compacts rather than leaving a long update
  log. Reuse the existing autosave call — the payload is unchanged.
- **« Enregistrer une nouvelle version » stays exactly as it is** and now carries all the ceremony. It keeps
  its dedupe guard (a re-click with no edits must not clone the head) and its optional note.
- States: compaction in flight, compaction failed (retry silently on the next tick; surface a toast only
  after two consecutive failures — a failed compaction loses nothing, the updates are still in Postgres),
  offline.
- Breakpoints ~375 / ~768 / ~1280: the status text truncates rather than wrapping the header.

## Backend
- **No contract change.** `PATCH /pages/{id}/document` already does the right thing: it writes
  `ydocState` + `contentJson` and deletes that document's `ScenarioUpdate` rows **in one transaction**
  (`scenario-documents.service.ts:181-187`). It stays « Écriture »-gated and keeps never touching
  `AssetVersion`.
- **Server-side safety net**: compaction must not depend on a browser being open. Add a
  `scenario-compaction` job to the [[F-8]] queue that compacts any `ScenarioDocument` whose pending
  `ScenarioUpdate` count exceeds a threshold (or whose oldest pending row is older than ~10 min).
  A crashed tab must not leave an unbounded append-only log — [[F-25]] already sweeps *superseded*
  updates, which is a different job and stays.
- The empty-document guard stays: a blank autosave must never materialize an empty v1 and shift the real
  first content to v2 (`scenario-documents.service.ts:194-198`).
- No schema change.

## Acceptance criteria
- The editor header shows no « Enregistrer » button and `Ctrl+S` does not save (it may fall through to the browser).
- Typing, then going idle ~5 s, compacts: `ScenarioUpdate` rows for that document drop to zero and `ydocState`/`contentJson` reflect the edit — asserted against the real service, not a mock.
- Closing the tab mid-edit compacts (or leaves the updates recoverable): reopening the document restores the same content either way, with no lost characters.
- Two clients editing concurrently both converge and both end compacted; no update is dropped by a compaction racing an inbound update.
- « Enregistrer une nouvelle version » still creates exactly one `AssetVersion`, still refuses to clone the head with no edits, and still carries its note.
- The queue job compacts a document abandoned with pending updates and no client connected.
- A member without « Écriture » still gets **403** on the autosave route.

## Dependencies
- [[CS-4]] — the editor, the autosave route, `ScenarioDocument` / `ScenarioUpdate`.
- [[F-8]] — the BullMQ queue the safety-net job runs on.
- [[F-25]] — the existing nightly superseded-update sweep (adjacent, unchanged).
- [[CS-10]] — « Écriture » gates the write.

## Notes
- **The race is the whole risk.** Compaction deletes the update rows it just merged; an update arriving
  between the merge and the delete must not be lost. The existing transaction is the seam — scope the
  `deleteMany` to rows at or before the compacted state (by `createdAt`/id), never a blanket
  `deleteMany({ documentId })`, which is what today's button-triggered path can get away with only because
  the user pressed it in a quiet moment. This is the one behavioural detail to get right.
- **Do not add a "saved" badge per case or per paragraph.** One status in the header. YAGNI.
- Ordering: land this **after** [[CS-20]] — that story makes the version snapshot meaningful, which is what
  justifies removing the weaker save affordance rather than leaving users with nothing deliberate to press.
