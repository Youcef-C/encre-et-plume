# CS-19 — Version merge validation "Fusion des versions"

**As a** project leader (or a co-author holding the « Fusion » right), **I want** new drawing and scenario
versions from members without that right to arrive as _proposed_ versions I validate before they become the
project's active version, **so that** what the œuvre officially shows is what the rights-holders approved —
and the « Fusion » permission the group screen already advertises actually means something.
At the moment, "Enregistrer une nouvelle version" saves a new file version. It must change to something like
"Proposer une nouvelle version", which then needs to be validated by whoever has the fusion rights.

> Screen(s): the [[CS-3]] version history modal (`AssetVersionsModal`) + the [[CS-4]] editor's "Enregistrer une nouvelle version" + the [[CS-10]] "Gérer le groupe" permission row · Priority: **Must** · Fidelity: **Inferred** (no drawn frame — extends the drawn version-history modal; grade against the criteria)

## Why this story exists (defect, not just a feature)

[[CS-10]] ships a per-member **Fusion** toggle and tells the user, verbatim in
`GroupMembersCard.tsx`: _« Autorisation de fusion (merge) : seuls les membres avec le droit « Fusion »
peuvent valider et intégrer une nouvelle version dans la branche principale du projet. »_

That promise is currently false. `hasGroupPermission(…, 'fusion')` is never called anywhere in
`apps/api/src`; only `ecriture` and `corrections` are enforced. Today `appendVersion()` creates the version
**and promotes it to head in the same transaction**, and `setActiveVersion()` (`POST
/assets/{id}/active-version`) repoints the head to any version — both gated on `ecriture` alone. A member
with Écriture ON / Fusion OFF can do exactly what that paragraph says only Fusion-holders can. This story
closes the gap between the advertised permission and the enforced one.

## Concept — a proposed version, then an explicit integration

The [[CS-3]] chain stays **linear** (v1…vN, no branching) — this adds a _state_ to a version, not a branch.

- A member **with** `fusion` (leaders and co-leaders always have it) versions exactly as today: the new
  version is created **and** becomes the head. Nothing changes for them.
- A member **without** `fusion` creates a version with status **`proposee`**; `Asset.currentVersion` /
  `mediaId` / `size` are **left untouched**. The work is saved and visible, but the œuvre still shows the
  last integrated version.
- A `fusion` holder then **integrates** it (becomes head, status `integree`) or **rejects** it.

One chokepoint covers both file kinds: `assets.service.ts appendVersion()` is reached by the drawing upload
route _and_ by the [[CS-4]] editor snapshot (`scenario-documents.service.ts snapshotVersion` →
`addVersion`). Gate it once; do not add a parallel path for scenarios.

## Frontend

- **Version history modal** ([[CS-3]] `AssetVersionsModal`) — each row gains its state:
  - `proposee` → an on-brand "En attente de fusion" chip, the proposer's name/date/note, and — **for
    `fusion` holders only** — **"Intégrer"** (`.ep-btn-success`) and **"Rejeter"** (`.ep-btn-danger-outline`,
    two-step via `ConfirmDialog`).
  - `integree` → as today, with the existing active/head marker unchanged.
  - A non-holder sees the chip and the proposer, but no action buttons.
- **After saving a version without the right** ([[CS-4]] editor and the [[CS-3]] upload): confirmation reads
  _« Version proposée — en attente de validation »_ rather than implying it went live. The editor's head/
  "⎘ vN" badge ([[CS-2]]) keeps pointing at the last **integrated** version.
- **Pending count**: the Fichiers grid ([[CS-3]]) marks an asset that has proposed versions waiting, so a
  leader doesn't have to open each file to find them.
- States: no proposed versions (today's list, unchanged); integrating / rejecting in progress; rejected
  (row struck or removed per the delete rule below); conflict — the version was integrated by someone else
  first (refetch, no error toast); error on integrate/reject (row reverts); read-only for non-members.
- Validation: only a `proposee` version can be integrated or rejected; the buttons are absent (not merely
  disabled) for members without `fusion`.
- Accessibility: the state chip is text, not colour-only; Intégrer/Rejeter labelled with the version
  ("Intégrer la version 4"); the confirm dialog is focus-trapped; the pending marker reads as text.

## Backend

- **`AssetVersion.status`**: `proposee | integree`, default `integree`. Migration backfills every existing
  row to `integree` — the chain as it stands today is entirely integrated.
- **`appendVersion()` (the single chokepoint)** — after creating the version row:
  - caller holds `fusion` → status `integree` **and** repoint `Asset.currentVersion/mediaId/size` (today's
    behaviour, unchanged);
  - caller does not → status `proposee`, **no repoint**. Same transaction either way.
- **POST /assets/{id}/versions/{n}/integrate** — `fusion`-gated. Sets `status = integree` and repoints the
  head, reusing the existing `setActiveVersion` repoint (don't re-derive it). Idempotent: integrating an
  already-integrated version is a no-op 200. **404** unknown version.
- **POST /assets/{id}/versions/{n}/reject** — `fusion`-gated, or the version's own author withdrawing their
  proposal. Rejecting a `proposee` version deletes the row and its [[F-10]] media blob (a rejected version
  is not history worth keeping). **409** if the version is already `integree` — use [[CS-18]]'s delete for
  those, so the two paths stay distinct.
- **`setActiveVersion()` (`POST /assets/{id}/active-version`) is now `fusion`-gated** — repointing the head
  _is_ a merge. This is a tightening of a shipped [[CS-3]] route; record it in the notes so QA grades it as
  intended, not as a regression.
- **GET /assets/{id}/versions** returns `status` per row + a `pendingCount`; **paginated** as today.
- Entities: `AssetVersion { …, status }`. No new model, no branch pointer, no parallel table.
- Business rules: the chain stays linear; the head is always an `integree` version; at least one `integree`
  version always exists (a project can never be left with only proposals); a member's own proposal never
  auto-integrates, even for the asset's original uploader.
- Authorization: **server-side only**, via the existing `hasGroupPermission(project, accountId, 'fusion')`
  seam in `members.service.ts` — never a client claim. Leadership (leader/co-leader) implies `fusion`
  through `effectiveGroupPermissions`, so no separate leader branch is needed.
- Side effects: a new proposal notifies every `fusion` holder ([[F-5]]); integrate/reject notifies the
  proposer; integrating moves the [[CS-2]] "⎘ vN" card badge to the new head; a [[CS-5]] correction counts
  as addressed only when its `resolvedInVersion` is **integrated** (see Dependencies).

## Acceptance criteria

- A member with Écriture but **without** Fusion uploads a drawing version and saves a scenario version from
  the editor: both land as `proposee`, the asset head does **not** move, and the UI says "en attente de
  validation" on both paths.
- A Fusion holder (or a leader/co-leader) versioning the same asset gets today's behaviour — the version is
  created and becomes head immediately.
- A Fusion holder integrates a proposed version: it becomes head, its status is `integree`, the [[CS-2]]
  card badge follows, and the proposer is notified.
- Rejecting a proposed version removes it and its media blob; rejecting an already-integrated version
  returns 409.
- A forged `integrate` / `reject` / `active-version` call by a member without `fusion` returns **403**; the
  buttons are absent from their UI.
- The [[CS-10]] group screen's Fusion paragraph is now true end-to-end — toggling Fusion off for a member
  demonstrably changes what their next version does.
- A [[CS-5]] correction whose resolving version is still `proposee` does **not** count as addressed;
  it does once that version is integrated.

## Dependencies

- [[CS-3]] — the `Asset`/`AssetVersion` chain, `AssetVersionsModal`, `appendVersion`, and the
  `setActiveVersion` repoint this story reuses and gates.
- [[CS-4]] — the editor's "Enregistrer une nouvelle version" snapshot reaches the same chokepoint; its
  confirmation copy and head badge change.
- [[CS-5]] — "addressed" (`resolvedInVersion > filedAgainstVersion`) must mean _integrated_; update that
  check here. CS-5's "Valider les modifications" stays a **corrections** gate — it is not the merge gate.
- [[CS-10]] — the `fusion` permission, its toggle, and the `hasGroupPermission` seam.
- [[CS-2]] — the derived "⎘ vN" card badge follows integration, not proposal.
- [[F-5]] — proposal / integrate / reject notifications.
- [[F-10]] — a rejected version's media blob is deleted.

## Notes

- **Build before [[CS-18]]**: CS-18 adds compare + delete on the same version rows and its guards
  ("cannot delete the only version", "repoint on deleting the active version") need to know about
  `proposee` rows. Building CS-18 first would mean reworking those guards.
- **Deliberate tightening of a shipped route**: `POST /assets/{id}/active-version` moves from `ecriture` to
  `fusion`. Intended, not a regression — it is the merge operation under another name.
- **Delete**: covered by `reject` (proposed versions, with the media blob). Deleting _integrated_ versions
  stays [[CS-18]]'s job; keep the two paths separate so neither becomes a backdoor for the other.
- **Ponytail**: one enum field, one branch at the existing chokepoint, one reused repoint, one reused
  permission seam. No branch model, no merge-conflict resolution, no three-way diff — the chain stays
  linear and a proposal is either integrated wholesale or rejected. If per-hunk merging is ever wanted,
  that is a separate story with a real use case behind it.
