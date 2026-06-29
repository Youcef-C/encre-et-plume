# PUB-2 — Comments on chapters & illustrations

**As a** Reader, **I want** to comment on a chapter or illustration, reply to others, and react with hearts, **so that** I can engage with the work and discuss it with the community.

> Screen(s): Illustration detail ([[DR-6]]), work/chapter reader right rail ([[DR-4]]) · Priority: Must · Fidelity: Explicit

## Frontend
- Comment composer: textarea with placeholder, "Publier" submit button. Disabled/hidden for visitors with a sign-in prompt ([[F-1]]).
- Comment list, each item showing: author name, timestamp ("time"), comment text, heart count + heart toggle, "Répondre".
- Threaded replies: "Répondre" opens an inline reply composer; replies nest under the parent.
- Heart interaction: toggle like/unlike, optimistic count update.
- Owner/Admin moderation controls per comment ([[AD-5]]): "🛡 Masquer", "🗑 Supprimer", "Rétablir".
  - Hidden comments render a placeholder (e.g. "Commentaire masqué") in place of the text; "Rétablir" restores it.
- Report affordance per comment → opens report flow ([[PUB-6]]).
- States:
  - Empty: "Aucun commentaire pour le moment" with the composer still shown.
  - Loading: skeleton list / spinner while fetching; submit spinner on "Publier".
  - Error: toast on post/like failure; composer keeps the typed text.
- Validation: block empty/whitespace-only comments; reasonable max length with counter.
- Accessibility: composer textarea labelled; "Publier", "Répondre", heart, and moderation buttons have accessible names; hearts expose pressed state; placeholder text readable by screen readers.

## Backend
- **GET /comments?targetType={work|chapter|illustration}&targetId=…** — list comments + replies, newest-or-thread order; includes `heartCount`, `viewerHearted`, `hidden` flag.
- **POST /comments** — `{ targetType, targetId, body, parentId? }`. Response: created comment.
- **POST /comments/{id}/heart** / **DELETE /comments/{id}/heart** — like / unlike; idempotent; returns updated count.
- **POST /comments/{id}/report** — `{ reason, details? }` → routes to reports queue (see [[PUB-6]], [[AD-2]]).
- Moderation ([[AD-5]]): **PATCH /comments/{id}** `{ action: "hide"|"delete"|"restore" }`.
- Entity **Comment**: `id, targetType, targetId, authorId, body, parentId, heartCount, status (visible|hidden|deleted), createdAt`.
- Business rules: replies reference a valid `parentId` on the same target; hidden → placeholder, deleted → removed (soft-delete), restore → visible.
- Validation: non-empty `body`; `targetType` enum; `parentId` must belong to same target.
- Authorization: authenticated user to post/like/report ([[F-1]]); hide/delete/restore limited to work owner or Admin ([[F-2]], [[AD-5]]).
- Side effects: notify thread parent author / work owner of new comment ([[F-5]]).

## Dependencies
- [[F-1]] — auth to post, like, report.
- [[AD-5]] — comment moderation (hide/delete/restore).
- [[PUB-6]] — report a comment.
- [[DR-4]], [[DR-6]] — host surfaces (reader right rail, illustration detail).
- [[F-5]] — new-comment notifications.

## Notes
- Explicit: composer + "Publier", list with name/time/text/hearts/"Répondre", owner/admin "🛡 Masquer / 🗑 Supprimer / Rétablir" + hidden placeholder.
- Inferred: max length, ordering, skeleton/empty copy.
