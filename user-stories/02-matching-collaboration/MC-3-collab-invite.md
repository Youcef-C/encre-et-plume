# MC-3 — Collaboration invite "Proposer une collab"

**As a** Creator, **I want** to send a collaboration invitation to another creator, optionally tied to a project, **so that** we can start working together.

> Screen(s): "Proposer une collab" modal (opened via `openInvite`) · Priority: Must · Fidelity: Explicit (trigger) / Inferred (modal body)

## Frontend
- Modal "Proposer une collab" triggered by `openInvite` from: partner cards ([[MC-1]]), profiles ([[F-3]]), and work/illustration pages ([[DR-3]]).
- Fields:
  - Recipient — prefilled and shown read-only when launched from a card/profile (the target creator).
  - Optional project picker — choose one of the sender's existing projects ([[CS-1]]) to attach, or leave unattached.
  - Message — free-text note to the recipient.
  - Primary action to send (e.g. "Envoyer la proposition"); cancel/close dismisses.
- States: default, sending (button disabled/spinner), success confirmation/toast, error (e.g. already invited, recipient unavailable). Empty project list shows a hint that attaching a project is optional.
- Validation: recipient required; message length bounded; prevent duplicate pending invite to the same recipient (disable/explain).
- Accessibility: focus trapped in modal, labelled fields, Esc to close, error messages associated with fields.

## Backend
- `POST /invitations` — create an invitation. Request: `{ toUser, projectId?, message }` (fromUser = current user).
- `GET /invitations?direction=sent|received` — list the current user's sent and received invitations.
- `PATCH /invitations/{id}` — `{ status: accepted | declined }` to respond.
- Entity `Invitation`: `id`, `fromUser`, `toUser`, `projectId?`, `message`, `status (pending|accepted|declined)`, `createdAt`, `respondedAt?`.
- Business rules: one pending invitation per (fromUser, toUser[, projectId]); accepting may create a project collaboration (add recipient to project [[CS-2]]) and/or establish a connection ([[MC-8]]); declining closes the invite.
- Validation: recipient must exist and be an active creator; sender cannot invite self; message length limit; projectId (if present) must belong to sender.
- Authorization: sender must be authenticated; only the recipient can accept/decline; banned users ([[AD-6]]) cannot send or be invited.
- Side effects: recipient receives a notification ([[F-5]]); invitation appears in invitations/contacts ([[MC-8]]); on accept, collaboration/connection records created and both parties notified.

## Dependencies
- [[MC-1]] — partner card "Proposer" trigger.
- [[F-3]] — profile "Proposer" trigger; recipient identity.
- [[DR-3]] — work/illustration page trigger.
- [[CS-1]] — optional project to attach.
- [[CS-2]] — accept may add the partner to the project workspace.
- [[F-5]] — notification on send and response.
- [[MC-8]] — invitation/connection surfaced in contacts.

## Notes
- Explicit: the `openInvite` trigger points (cards, profiles, work/illustration pages) and that it is a "Proposer une collab" modal feeding notifications and invitations/contacts.
- Inferred: the modal body (recipient/project/message fields, send button) and accept/decline semantics — the design noted the modal body is truncated.
