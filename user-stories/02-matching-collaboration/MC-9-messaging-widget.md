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
- **DMs without a connection + message requests** (user-specified 2026-07-09): you can start a DM with a member you're **not connected to**. Whether it opens a thread or a request depends on the recipient's privacy setting ([[F-19]]): **Tout le monde** → opens a normal thread; **Demandes de message** (default) → lands in the recipient's **"Demandes"** section (a tab/filter in the widget with its own count) where they **Accepter** (opens the thread, and the two become messageable) or **Refuser / Fermer** (closes it, no thread; optionally block via [[MC-10]]); **Contacts uniquement** → the send is refused unless already connected ([[MC-8]]). The sender sees "Demande envoyée" until accepted. Blocked/muted users are excluded either way ([[MC-10]]).
- Project group chat is the same conversation embedded in the project workspace ([[CS-8]]).
- States: launcher with/without unread badge; panel minimized vs open; per-conversation loading history, empty ("Démarrez la conversation"), sending, send-failed/retry; reconnecting banner when the realtime connection drops.
- Accessibility: launcher labelled with unread count; typing indicator announced politely; messages list navigable; controls "＋ Groupe"/minimize/close have accessible names; widget reachable by keyboard and dismissible.

## Backend
- `GET /conversations` — list conversations with `unreadCount`, last message, type (dm|group), participants. Plus a total unread count for the launcher badge.
- `GET /conversations/{id}/messages` — paginated message history.
- `POST /conversations/{id}/messages` — send `{ body, attachments? }`.
- `POST /conversations` — create a group `{ name, participantIds[] }` (or DM by participant). For a DM to a **non-contact**, the server applies the recipient's DM-privacy setting ([[F-19]]): open thread, a **pending request** (`status='requested'`, surfaced in the recipient's "Demandes"), or refuse (contacts-only).
- `PATCH /conversations/{id}/request` — recipient responds to a DM request `{ action: 'accept' | 'decline' }` (accept opens the thread; decline closes it). Only the requested recipient may call it.
- `GET /conversations?filter=requests` — the recipient's pending DM requests (count backs the "Demandes" badge).
- `POST /conversations/{id}/read` — mark read (clears unread).
- Realtime channel (WebSocket): deliver new messages, typing events ("en train d'écrire…"), and presence/online status; also backs presence in [[MC-8]].
- Entities: `Conversation` (`id`, `type`, `name?`, `participants[]`, `projectId?`); `Message` (`id`, `conversationId`, `senderId`, `body`, `attachments[]`, `createdAt`, `readBy[]`).
- Business rules: a project group chat is linked to its project ([[CS-8]]) and shares messages with the embedded workspace chat; unread counts per user; only participants may read/post. **A `requested` DM is not a full thread yet** — the requester can send the opening message(s) but the conversation stays in the recipient's "Demandes" until accepted; declining hides/closes it. The recipient's DM-privacy preference (**Tout le monde / Demandes de message (défaut) / Contacts uniquement**) lives in settings ([[F-19]]) and governs which path a new DM takes.
- Validation: body or attachment required; attachment type/size limits; group needs a name and ≥2 participants.
- Authorization: participants only (read + post); banned users ([[AD-6]]) cannot send. Exception: admins/maintainers may READ any conversation for trust-&-safety oversight ([[AD-11]]) — a role-gated, logged exception to participant-only access.
- Side effects: new messages bump unread counts / launcher badge and may notify offline recipients ([[F-5]]); typing and presence broadcast to participants.
- Rendering: widget mounts on every page (depends on session [[F-1]] and the global app shell [[F-4]]).

## Dependencies
- [[F-1]] — authenticated session required; renders on every page.
- [[F-4]] — global app shell that hosts the floating widget.
- [[MC-8]] — "Message" / `openMsg` launches conversations; shared presence.
- [[CS-8]] — project group chat embedded in the workspace shares messages.
- [[F-5]] — unread/notification counts for offline recipients.
- [[F-10]] — message attachments stored/served via the media system (private attachments via signed URLs).
- [[F-19]] — DM-privacy setting (who can message me) governs request vs open-thread vs refuse.
- [[MC-10]] — blocked/muted users excluded from DMs and requests.

## Notes
- Explicit: launcher bubble (red ✉, unread "3"), header "Messages [3] · ＋ Groupe · minimize ▁ · close ✕", conversation search, the three sample rows (group + two DMs with typing/preview), the `openMsg` per-recipient modal, the shared project group chat ([[CS-8]]), realtime messaging/typing/presence + group creation + history + attachments, and that it renders on every page (depends [[F-1]], [[F-4]]).
- Inferred: exact endpoint shapes, pagination, and reconnect/offline-notification behavior.

## Realtime notifications (added 2026-07-08)
- The WS gateway pushes **all F-5 notifications** live, not only chat: connection requests ([[MC-8]]),
  call applications ([[MC-5]]/[[MC-7]]), collaboration invitations ([[MC-3]]), and the header unread
  badges update in real time (no tab refocus/reload). `NotificationsService.create()` emits
  `unread:changed` to the recipient's authenticated per-user room (best-effort, authz-scoped, Redis-adapter
  fan-out); the client calls the existing `UnreadProvider.refresh()`. Unread counts still come from the
  REST source of truth — the socket event is a "refetch now" signal.

## Amendment (2026-07-26, round 2) — ONE conversation starter + the Contacts tab is a list
Supersedes the round-1 shape below where they conflict.
- **One general starter (approved)**: the header's group-only **"＋ Groupe"** becomes **"＋ Conversation"**,
  opening a single "Nouvelle conversation" flow: pick **1 person → a DM** (the same
  `POST /conversations { participantId }` path, so [[F-19]] `dmPolicy` + [[MC-10]] blocks still decide) or
  **2+ people → a group** (`POST /conversations { participantIds }`). One affordance, not two, so the
  320px header stays uncrowded.
- **The group name is optional (approved)**: a group can be created unnamed; an unnamed group is titled by
  its other members server-side (max 3 names then "+N"), so no surface ever renders an empty title. The
  name is **settable later** by the group's creator from "Gérer le groupe" via the new
  `PATCH /conversations/:id { name }` (creator-only, server-enforced from `Conversation.createdBy`;
  an empty name clears it back to the members-derived title).
- **The Contacts tab is a LIST (approved)**: the tab opens on the viewer's contacts (`GET /contacts`),
  each row carrying avatar + presence + a **"Message"** action, matching how `/contacts` presents its rows.
  The panel's existing search field filters that list ("Rechercher un contact"); reaching someone who is
  **not** a contact is the "＋ Conversation" starter. `/contacts` itself is untouched.

## Amendment (2026-07-26) — start a 1:1 from the widget + a Contacts tab
- **Start a 1:1 (approved)**: the widget only offered "＋ Groupe"; there was no way to open a direct
  conversation from it. The panel gains a third list tab **"Contacts"** whose picker starts the DM through
  the *existing* `POST /conversations { participantId }` path — so the recipient's DM-privacy setting
  ([[F-19]]) and blocks ([[MC-10]]) apply exactly as everywhere else, and the server's refusal
  ("Ce membre n'accepte que les messages de ses contacts.") is shown inline.
- **Contacts visible in the widget (approved)**: that same tab lists the user's contacts (MC-8) so a
  conversation can be started without going to `/contacts`.
- **One search idiom (approved)**: every "Contacts" dropdown is replaced by the shared reachable-user
  search ([[MC-13]] `ReachableUserSearch` → `GET /accounts/search`) — including the "Proposer une collab"
  picker ([[MC-3]]). `GET /accounts/search` now lists the caller's **contacts when the query is empty**
  and **ranks contacts first** (`isContact`), so removing the dropdown does not remove the ability to
  find a contact.

## Amendment (2026-07-10) — "＋ Groupe" red + remove minimize
- **"＋ Groupe" button red (approved)**: the group-create trigger in the widget header renders **accent-red** (`var(--accent)` bg, white text) like the other primary actions — not the neutral style.
- **Remove the minimize "Réduire" (▁) button (approved)**: the widget header's minimize control (deviation D1) is removed because it behaves the same as the close "X" (both collapse the widget to the FAB). Keep only "Fermer". Update/retire the D1 deviation note. Grade against these (the prototype's drawn ▁ is intentionally dropped).
