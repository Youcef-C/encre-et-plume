# CS-16 — Delete a project "Supprimer le projet"

**As a** project leader, **I want** to delete a project I lead, **so that** abandoned or mistaken projects stop cluttering my — and my collaborators' — workspace and dashboards.

> Screen(s): the "Gérer le groupe" / project settings surface ([[CS-10]]/[[CS-2]]) · Priority: Should · Fidelity: **Inferred** (no drawn frame — a destructive lifecycle action; grade against the criteria)

## Concept — soft-delete (archive) with a grace window, then purge
Deletion is **reversible for a grace window** rather than an instant irrecoverable wipe: deleting **archives** the project (`deletedAt`/`status='archived'`), it drops out of every active list immediately, and a background job **purges** it after the window (default **30 days**). A leader can **restore** it within the window. This protects a shared, collaborator-owned artifact from a one-click mistake (destructive-action discipline).

## Frontend
- A **"Supprimer le projet"** action in the project settings / "Gérer le groupe" surface, styled destructive (accent red), **leader-only** (hidden for co-leaders/members/non-members).
- **Confirm-by-typing**: a `ConfirmDialog` variant that requires typing the **exact project title** to enable the red "Supprimer définitivement…" button — no accidental deletes. States what will happen (archived 30 days, then permanently removed; collaborators lose access).
- **Blocked when published**: if the project has published chapters ([[PUB-1]]), deletion is blocked with an explanation ("Dépubliez d'abord les chapitres publiés") — a published work can't silently vanish for its readers.
- **Archived state + restore**: an archived project shows in a "Projets archivés" section of the dashboard ([[CS-12]]) for the leader, with a **"Restaurer"** action and a "supprimé le … · purge le …" note; members see it gone.
- States: confirm-by-typing (button disabled until the title matches); deleting in progress; blocked-because-published; restore in progress; purge-countdown label; error (toast, project restored/kept).
- Accessibility: destructive button labelled with intent; confirm dialog focus-trapped; the title-match requirement announced.

## Backend
- **DELETE /projects/{slug}** — **soft-delete**: set `deletedAt`/`status='archived'`; **leader-only** (server-side, per [[CS-10]] roles — never trust a client claim); **409** if the project has published chapters ([[PUB-1]]). Removes it from all active queries (dashboard [[CS-12]], calls board, editor, etc.) via a `deletedAt IS NULL` filter. Idempotent.
- **POST /projects/{slug}/restore** — leader-only; clears `deletedAt` within the grace window; **410/404** once purged.
- **Purge job** ([[F-8]] queue): after the grace window, hard-delete the project and cascade its owned data — kanban pages/cards, `Asset`/`AssetVersion` + [[F-10]] media blobs, scenario documents + comments/corrections ([[CS-4]]/[[CS-5]]), memberships ([[CS-10]]), calls/applications ([[MC-4]]). Log what was purged (no PII).
- Business rules: only a **leader** deletes/restores; a project with published chapters cannot be deleted; soft-deleted projects are excluded everywhere by default; grace window configurable (default 30 days).
- Authorization: leader-only for delete/restore; enforced server-side.
- Side effects: on delete, **notify all collaborators** ([[F-5]]) that the project was archived (and by whom); on purge, no notification (already archived). Frees the slug only after purge.

## Acceptance criteria
- A leader can delete a project only after typing its exact title; a co-leader/member/non-member cannot (no affordance; a forged `DELETE` returns 403).
- Deleting archives the project: it disappears from every active list immediately and appears under the leader's "Projets archivés" with a purge date; collaborators are notified and lose access.
- A project with a published chapter cannot be deleted (409 + explanation) until unpublished.
- The leader can **restore** an archived project within the grace window and it returns to active lists; after the window the purge job hard-deletes it and its owned data (assets/media, docs, corrections, memberships, calls).

## Dependencies
- [[CS-10]] — leader role gates delete/restore; opened from "Gérer le groupe".
- [[CS-12]] — active lists exclude archived; the "Projets archivés" + restore surface lives here.
- [[CS-2]]/[[CS-3]]/[[CS-4]]/[[CS-5]]/[[MC-4]] — owned data cascaded on purge.
- [[PUB-1]] — published chapters block deletion.
- [[F-8]] — the purge job; [[F-10]] — media blobs purged; [[F-5]] — collaborator notification.

## Notes
- **Decision (2026-07-15)**: **soft-delete/archive with a 30-day grace window + restore, then purge** — not an instant hard delete — because a project is a shared artifact and one-click permanent loss is unacceptable. Confirm-by-typing the title guards the action. (If you'd rather have immediate hard-delete, say so — this is the reversible default.)
- **Ponytail**: reuse `ConfirmDialog`, the [[CS-10]] role guard, the [[F-8]] queue for purge, and the existing `deletedAt IS NULL` list-filter pattern; no new soft-delete framework.
