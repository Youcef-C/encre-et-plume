# AD-5 — Comment & review moderation

**As an** Editorial staff member (maintainer) or content owner, **I want** contextual controls to hide, delete, or restore comments and reviews, **so that** abusive or off-topic discussion can be cleaned up where it appears.

> Screen(s): contextual controls (`data-adminctl`) on comments ([[PUB-2]]), reviews ([[PUB-3]]), and the project "Infos" tab · Priority: Must · Fidelity: Explicit

## Frontend
- Per-item moderation controls, shown to `admin`/`maintainer` or the content owner (`data-adminctl`): "🛡 Masquer", "🗑 Supprimer", "Rétablir".
- Available on comments ([[PUB-2]]) and reviews ([[PUB-3]]) wherever they render — illustration detail ([[DR-6]]), work page ([[DR-3]]) reader, and the project "Infos" tab.
- Hidden state: the item is replaced by a placeholder (e.g. "Commentaire masqué" / "Avis masqué"); "Rétablir" restores it.
- "🗑 Supprimer" removes the item (soft-delete); confirm before deleting.
- States:
  - Loading: spinner on the acted item.
  - Error: toast on failure; the item keeps its prior state.
- Validation: confirm on delete; "Rétablir" only offered for hidden/soft-deleted items.
- Accessibility: controls have accessible names; placeholder text is screen-reader readable; pressed/state changes announced.

## Backend
- **PATCH /comments/{id}** — `{ action: "hide"|"unhide"|"delete" }` (see [[PUB-2]]).
- **PATCH /reviews/{id}** — `{ action: "hide"|"unhide"|"delete" }` (see [[PUB-3]]).
- Entities **Comment** / **Review** `status`: `visible | hidden | deleted` (soft-delete; row retained for audit).
- Business rules: hidden → placeholder, deleted → soft-deleted (recoverable via restore within retention), unhide/restore → visible.
- Validation: `action` enum; target must exist and be in a compatible state.
- Authorization: `admin`/`maintainer` ([[F-2]]) or the owner of the work the comment/review belongs to.
- Side effects: write a moderation audit entry (`who, action, targetType, targetId, at`); may be triggered by a report resolution ([[AD-2]]).

## Dependencies
- [[PUB-2]] — comments host + moderation endpoint.
- [[PUB-3]] — reviews host + moderation endpoint.
- [[AD-2]] — report-driven hide/delete.
- [[F-2]] — authorization.

## Notes
- Explicit: "🛡 Masquer / 🗑 Supprimer / Rétablir" (`data-adminctl`), hidden-comment placeholder, and availability on comments/reviews + project "Infos" tab.
- Inferred: soft-delete retention window, audit entry, confirm-on-delete copy.
