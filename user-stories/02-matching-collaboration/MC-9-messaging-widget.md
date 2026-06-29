# MC-9 — Messaging (floating widget)

**As a** Creator, **I want** a floating chat widget available on every page, **so that** I can message contacts and project groups in real time without leaving what I'm doing.

> Screen(s): floating messaging widget (cross-cutting); per-recipient message modal (`openMsg`) · Priority: Must · Fidelity: Explicit (wireframe)

## Frontend
- Launcher bubble fixed bottom-right (red ✉) with an unread badge (e.g. "3").
- Clicking opens a panel with header "Messages [3]" plus controls: "＋ Groupe" (create group), minimize "▁", and close "✕".
- Conversation search field.
- Conversation list rows:
  - Group row — group chip + name "Projet · Lames de Brume", unread dot, last message preview (e.g. "Yuki : nemu planche 4 prêt").
  - DM row — "Yuki Moreau" with live "en train d'écrire…" typing indicator.
  - DM row — "Léa B." with last-message preview.
- Opening a conversation shows message history, a composer with attachment support, and read/typing/presence indicators.
- Per-recipient message modal (`openMsg`) launched from supporter rows / contacts ([[MC-8]]) opens or starts a DM directly.
- Project group chat is the same conversation embedded in the project workspace ([[CS-8]]).
- States: launcher with/without unread badge; panel minimized vs open; per-conversation loading history, empty ("Démarrez la conversation"), sending, send-failed/retry; reconnecting banner when the realtime connection drops.
- Accessibility: launcher labelled with unread count; typing indicator announced politely; messages list navigable; controls "＋ Groupe"/minimize/close have accessible names; widget reachable by keyboard and dismissible.

## Backend
- `GET /conversations` — list conversations with `unreadCount`, last message, type (dm|group), participants. Plus a total unread count for the launcher badge.
- `GET /conversations/{id}/messages` — paginated message history.
- `POST /conversations/{id}/messages` — send `{ body, attachments? }`.
- `POST /conversations` — create a group `{ name, participantIds[] }` (or DM by participant).
- `POST /conversations/{id}/read` — mark read (clears unread).
- Realtime channel (WebSocket): deliver new messages, typing events ("en train d'écrire…"), and presence/online status; also backs presence in [[MC-8]].
- Entities: `Conversation` (`id`, `type`, `name?`, `participants[]`, `projectId?`); `Message` (`id`, `conversationId`, `senderId`, `body`, `attachments[]`, `createdAt`, `readBy[]`).
- Business rules: a project group chat is linked to its project ([[CS-8]]) and shares messages with the embedded workspace chat; unread counts per user; only participants may read/post.
- Validation: body or attachment required; attachment type/size limits; group needs a name and ≥2 participants.
- Authorization: participants only; banned users ([[AD-6]]) cannot send.
- Side effects: new messages bump unread counts / launcher badge and may notify offline recipients ([[F-5]]); typing and presence broadcast to participants.
- Rendering: widget mounts on every page (depends on session [[F-1]] and the global app shell [[F-4]]).

## Dependencies
- [[F-1]] — authenticated session required; renders on every page.
- [[F-4]] — global app shell that hosts the floating widget.
- [[MC-8]] — "Message" / `openMsg` launches conversations; shared presence.
- [[CS-8]] — project group chat embedded in the workspace shares messages.
- [[F-5]] — unread/notification counts for offline recipients.

## Notes
- Explicit: launcher bubble (red ✉, unread "3"), header "Messages [3] · ＋ Groupe · minimize ▁ · close ✕", conversation search, the three sample rows (group + two DMs with typing/preview), the `openMsg` per-recipient modal, the shared project group chat ([[CS-8]]), realtime messaging/typing/presence + group creation + history + attachments, and that it renders on every page (depends [[F-1]], [[F-4]]).
- Inferred: exact endpoint shapes, pagination, and reconnect/offline-notification behavior.
