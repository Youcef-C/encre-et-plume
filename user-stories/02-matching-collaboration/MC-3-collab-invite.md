# MC-3 — Collaboration invite "Proposer une collab"

**As a** Creator, **I want** to send a collaboration invitation to another creator, optionally tied to a project, **so that** we can start working together.

> Screen(s): "Proposer une collab" modal (opened via `openInvite`) · Priority: Must · Fidelity: Explicit (trigger) / Inferred (modal body)

## Frontend
- Modal "Proposer une collab" triggered by `openInvite` from: partner cards ([[MC-1]]), profiles ([[F-3]]), and work/illustration pages ([[DR-3]]).
- **Two proposal modes** (user-specified 2026-07-09):
  - **A · Direct proposal to a person** (from a partner card / profile / illustration): the recipient is a **specific user** — and you may **pick several** (multi-select) to invite to collaborate. This is the "let's work together" case.
  - **B · Join an existing project/work** (from the work page [[DR-3]], where the œuvre already has a team): you can't cherry-pick one member — the proposal notifies the **whole team**, and the **decision belongs to the group leader** (see [[CS-10]] roles). If the group has **co-leaders (multiple leaders), ALL leaders must accept** before the collaboration is established.
- Fields:
  - Recipient — mode A: a **user picker** (specific user, or several via multi-select), prefilled + read-only when launched from a single card/profile. Mode B: fixed to the target work's **team** (shown as "toute l'équipe de « {œuvre} »"), not individually selectable.
  - Optional project picker — mode A only: choose one of the sender's existing projects ([[CS-1]]) to attach, or leave unattached.
  - Message — free-text note to the recipient(s)/team.
  - Primary action to send (e.g. "Envoyer la proposition"); cancel/close dismisses.
- States: default, sending (button disabled/spinner), success confirmation/toast, error (e.g. already invited, recipient unavailable). Empty project list shows a hint that attaching a project is optional.
- Validation: recipient required; message length bounded; prevent duplicate pending invite to the same recipient (disable/explain).
- Accessibility: focus trapped in modal, labelled fields, Esc to close, error messages associated with fields.

## Backend
- `POST /invitations` — create an invitation. **Mode A (direct)**: `{ kind: 'direct', toUsers: [userId, ...], projectId?, message }` (one or several recipients; fromUser = current user). **Mode B (join a work's team)**: `{ kind: 'join', workId, message }` — resolves recipients to the work's team (all notified) and the decision to its leader(s).
- `GET /invitations?direction=sent|received` — list the current user's sent and received invitations.
- `PATCH /invitations/{id}` — `{ status: accepted | declined }` to respond.
- Entity `Invitation`: `id`, `kind (direct|join)`, `fromUser`, `toUser`/`workId`, `projectId?`, `message`, `status (pending|accepted|declined)`, `createdAt`, `respondedAt?`; for `kind='join'`, a per-leader acceptance record.
- Business rules: one pending invitation per (fromUser, toUser[, projectId]) for direct, or per (fromUser, workId) for join; accepting a direct invite may create a project collaboration (add recipient to project [[CS-2]]) and/or establish a connection ([[MC-8]]); **a `join` invite is decided by the work's group leader — if the group has co-leaders, it is established only once EVERY leader accepts** (any leader declining closes it) — see [[CS-10]]; declining closes the invite.
- Validation: recipient must exist and be an active creator; sender cannot invite self; message length limit; projectId (if present) must belong to sender.
- Authorization: sender must be authenticated; only the recipient can accept/decline; banned users ([[AD-6]]) cannot send or be invited.
- Side effects: recipient receives a notification ([[F-5]]); invitation appears in invitations/contacts ([[MC-8]]); on accept, collaboration/connection records created and both parties notified.

## Dependencies
- [[MC-1]] — partner card "Proposer" trigger.
- [[F-3]] — profile "Proposer" trigger; recipient identity.
- [[DR-3]] — work/illustration page trigger.
- [[CS-1]] — optional project to attach.
- [[CS-2]] — accept may add the partner to the project workspace.
- [[CS-10]] — group leader / co-leader roles decide a `join` proposal (all leaders must accept).
- [[F-5]] — notification on send and response (the whole team is notified for a `join` proposal).
- [[MC-8]] — invitation/connection surfaced in contacts.

## Notes
- Explicit: the `openInvite` trigger points (cards, profiles, work/illustration pages) and that it is a "Proposer une collab" modal feeding notifications and invitations/contacts.
- Inferred: the modal body (recipient/project/message fields, send button) and accept/decline semantics — the design noted the modal body is truncated.
- **Two-mode collab (user-specified 2026-07-09)**: direct proposals pick specific user(s) (multi-select); proposing to join an existing work notifies the whole team and is decided by the group leader(s) — with co-leaders, **all leaders must accept**. The leader/co-leader role model lives in [[CS-10]].
