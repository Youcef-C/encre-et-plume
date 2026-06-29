# CS-8 — Project discussion chat

**As a** Creator, **I want** a team chat scoped to my project with file attachments, **so that** the whole team can coordinate without leaving the workspace.

> Screen(s): "Espace projet" → "Discussion" tab · Priority: Should · Fidelity: Explicit

## Frontend
- Team chat thread:
  - Incoming bubbles with sender label, e.g. "Camille ✒ · Yuki 🖌 · 2 membres".
  - Outgoing messages as dark bubbles.
  - Image / file attachments rendered inline (e.g. "nemu-planche4.png").
- Composer: "＋" (attach) / "Écrire à l'équipe…" input / "Envoyer".
- States: loading history; empty ("Aucun message"); sending (optimistic) / send error with retry; attachment upload progress; new-message scroll-to-bottom.
- Validation: non-empty message or at least one attachment to send; attachment type/size limits.
- Accessibility: message list as a log region; sender/time read; composer and "＋" attach labelled; attachments have alt/filename.

## Backend
- Reuses messaging group-chat backend ([[MC-9]]), scoped to project members.
- **GET /projects/{slug}/messages** — paginated history.
- **POST /projects/{slug}/messages** — `{ text?, attachments[] }`.
- Entity **Message** (project-scoped) `{ id, projectId, senderId, text, attachments[], createdAt }`.
- Business rules: member-only thread; one thread per project.
- Authorization: project members only (non-members blocked).
- Side effects: new message may notify offline members ([[F-5]]).

## Dependencies
- [[MC-9]] — same group-chat backend, scoped to the project.
- [[CS-2]] — lives in the Discussion tab.
- [[CS-3]] — attachments may reference project assets.

## Notes
- Explicit: bubble styles, sender label, attachment example, composer. Backend explicitly shared with [[MC-9]].
