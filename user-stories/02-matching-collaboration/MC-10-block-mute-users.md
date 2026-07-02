# MC-10 — Block & mute users

**As a** user, **I want** to block or mute another user — and report a private message — **so that** I can protect myself from harassment without waiting for an admin.

> Screen(s): none drawn (actions on profile, conversation, and comment surfaces) · Priority: Should · Fidelity: Inferred

## Frontend
- **"Bloquer"** action on: a user's profile ([[F-3]], overflow menu), a DM conversation header ([[MC-9]]), and a contact row ([[MC-8]]). Confirmation modal explains effects: "Cette personne ne pourra plus vous envoyer de messages, d'invitations ni de demandes de contact. Vous ne verrez plus ses commentaires."
- **"Ne plus masquer"/"Débloquer"** from a **"Comptes bloqués"** list in account settings (name, date, "Débloquer").
- **Mute (masquer)** — lighter option "Masquer les commentaires de ce compte" available on comments ([[PUB-2]]): hides that user's comments/reviews for me only; manageable from the same settings list.
- **Report a message**: "⚑ Signaler ce message" on a DM message ([[MC-9]]) opens the [[PUB-6]] report modal (target = message).
- Blocked-state UX: the blocker no longer sees the blocked user's comments/reviews; the blocked user hitting a closed door gets a neutral failure ("Impossible d'envoyer le message.") — no "X blocked you" disclosure.
- States: confirm modal, list loading/empty ("Aucun compte bloqué."), unblock spinner, errors.
- Accessibility: actions named with the target user; modals focus-trapped; settings list rows labelled.
- Responsive: settings list and modals usable at 375/768/1280 px.

## Backend
- Entity **UserBlock**: `{ id, blockerId, blockedId, kind (block|mute), createdAt }` — unique `(blockerId, blockedId, kind)`; index both directions.
- **POST /me/blocks** — `{ userId, kind }`; **DELETE /me/blocks/:userId?kind=**; **GET /me/blocks** — the caller's list.
- **Enforcement server-side** (both directions checked where relevant):
  - `block` prevents the blocked user from: sending DMs to the blocker ([[MC-9]] — send returns a neutral error; existing conversation is closed to new messages), collab invites ([[MC-3]]), connection requests ([[MC-8]]), and applying to the blocker's calls ([[MC-5]]).
  - `block` and `mute` filter the blocked/muted user's comments and reviews out of the blocker's reads ([[PUB-2]], [[PUB-3]]) — filtering is per-viewer, content stays public for everyone else.
  - Blocking auto-removes an existing contact/connection ([[MC-8]]) and withdraws pending requests both ways.
- **Reportable messages**: [[PUB-6]]'s `POST /reports` gains `targetType: "message"`; staff review uses the [[AD-11]] oversight surface; queue + actions unchanged ([[AD-2]]).
- Business rules: blocks are unilateral and invisible to the blocked user; staff ([[AD-11]]) still see everything; blocking does not delete history.
- Validation: cannot block self; `userId` must exist; `kind` from enum.
- Authorization: strictly self-service on own block list ([[F-2]]); enforcement in the messaging/invite/comment services, never the client.
- Side effects: `ActionLogService.record()` emits `user_blocked` / `user_unblocked` ([[AD-10]]); no notification to the blocked user.
- Shared contracts in `packages/shared/src/blocks.ts` (DTOs, `BlockKind`) + barrel export; extend `packages/shared/src/reports.ts` target types.

## Dependencies
- [[MC-9]] — DM enforcement + the message-report entry point.
- [[MC-3]] / [[MC-8]] / [[MC-5]] — invite, connection, and application paths a block closes.
- [[PUB-2]] / [[PUB-3]] — per-viewer comment/review filtering.
- [[PUB-6]] / [[AD-2]] / [[AD-11]] — message reports flow into the existing moderation pipeline.

## Notes
- Inferred: no prototype frame — actions ride existing overflow/modal patterns; the settings list reuses profile-settings components.
- Deliberate scope: per-viewer filtering, not content deletion; harassment that merits removal goes through reports → moderation ([[AD-2]]).
