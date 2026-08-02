# MC-11 — Community salon "Le Comptoir" (dock widget)

**As a** logged-in user (Reader or Creator), **I want** a public community salon "Le Comptoir" available as a collapsible dock on every page, **so that** I can chat casually with the whole community, feel the platform is alive, and meet people outside my own projects and contacts.

> Screen(s): `SALON — DOCK COLLAPSABLE (bas gauche)` (cross-cutting) · Priority: Should · Fidelity: Explicit (drawn in the prototype)

## Frontend

- Collapsible dock fixed **bottom-left** (the Messages widget [[MC-9]] stays bottom-right), width 400px, card style (3px ink border, hard offset shadow).
- Dark header (ink background, paper text), always visible, click toggles collapse (`toggleSalons` → chevron `{{ salonChevron }}`):
  - Chat icon tile (accent background) with an unread badge overlay (`{{ unread }}`).
  - Title **"Le Comptoir"** with a live presence line: green dot + "`{{ roomOnline }}` en ligne".
  - "`{{ unread }}` nouveau·x" unread pill; unread indicators clear when the body is open/read.
- Body (when expanded):
  - Scrollable message feed (~280px, paper background): sender name above each bubble (`rmsg.who` / `rmsg.text`), left-aligned bordered bubbles. **Readable without joining** (public preview).
  - **Non-member state** (`data-salon-join`): "Rejoignez **Le Comptoir** pour discuter avec la communauté." + accent button "＋ Rejoindre le salon" (`joinRoom`). No composer shown.
  - **Member state** (`data-salon-composer`): input "Votre message…" (`roomDraft`), accent "Envoyer" (`sendRoom`), and a "Quitter" button (`leaveRoom`, title "Quitter le salon", hover turns red) that returns to the non-member state.
- New messages arrive in realtime; feed autoscrolls when pinned to bottom; collapsed dock keeps counting unread.
- Ability to tag users with `@` + username. **Pressing `@`** must display the list of users logged into the channel.
- States: collapsed/expanded; member/non-member; loading history; empty ("Soyez le premier à écrire" style, inferred); sending / send-failed retry; reconnecting when the realtime connection drops.
- Responsive: on narrow widths the dock must not collide with the Messages launcher ([[MC-9]]) — `max-width:calc(100vw - 52px)` per the prototype; collapsed header remains tappable (≥44px).
- Accessibility: header is a button with accessible name including unread count; live region announces new messages politely; composer and "Quitter"/"Rejoindre le salon" keyboard-reachable.

## Backend

- Reuses the [[MC-9]] messaging backend — no new message storage. One global `Conversation` of a new type `salon` (public room), seeded once (e.g. name "Le Comptoir").
- `GET /salon` — room summary: `onlineCount`, `unreadCount` (0 / null for non-members), `isMember`.
- `GET /salon/messages` — paginated history; **readable by any authenticated user** (public preview, no membership required).
- `POST /salon/join` / `POST /salon/leave` — membership toggle; idempotent.
- `POST /salon/messages` — send `{ body }`; **members only**.
- `POST /salon/read` — mark read (clears unread) for members.
- Realtime (WebSocket, same gateway as [[MC-9]], Redis adapter): broadcast new messages to all connected clients (members and previewers) and maintain the `roomOnline` presence count (connected users in the room channel).
- Business rules: any authenticated, non-banned user may join; posting requires membership; unread counts tracked per member; blocked/muted users ([[MC-10]]) are filtered client-side from the feed for the blocker.
- Validation: non-empty body, length cap; basic flood control (rate-limit posts per user).
- Authorization: authenticated users only; banned users ([[AD-6]]) cannot join or post; admin/maintainer read access is already covered by the [[AD-11]] oversight rules (salon is a group conversation).
- Rendering: dock mounts on every authenticated page (session [[F-1]], app shell [[F-4]]).

## Dependencies

- [[F-1]] — authenticated session; renders on every page.
- [[F-4]] — global app shell hosts the dock (alongside the [[MC-9]] widget).
- [[MC-9]] — shared conversation/message backend and WebSocket gateway.
- [[MC-10]] — block & mute filtering applies to the public feed.
- [[AD-6]] / [[AD-11]] — banned users excluded; staff oversight covers the salon.

## Notes

- Explicit: the whole dock (position bottom-left, collapsible dark header, "Le Comptoir", green-dot online count, unread badges, message feed with sender names, join panel "Rejoignez Le Comptoir pour discuter avec la communauté." + "＋ Rejoindre le salon", composer "Votre message… / Envoyer / Quitter").
- Inferred: endpoint shapes, pagination, unread semantics for non-members, flood control, empty-state copy.
- Single global room for now — the prototype draws exactly one salon. Multi-room ("salons") only if the product asks for it later.
- No emojis in the UI: the header's 💬 tile is rendered with the shared chat icon from `apps/web/components/icons.tsx`.
- **Approved deviation from the prototype — own messages align RIGHT (D-7, user decision 2026-08-02, shipped with [[MC-15]] round 2).**
  The prototype (`Encre et Plume - Prototype.dc.html`, line 2975) draws every salon message identically:
  `align-self: flex-start`, `background: var(--card)`, sender name above, with no own-vs-others branch —
  and `SalonDock` replicated that faithfully. The user found it confusing next to the [[MC-9]] widget and
  the [[CS-8]] Discussion panel, where own messages are right-aligned with the ink fill, and approved
  deviating. Shipped: **own** salon bubbles are right-aligned (`data-mine="true"`, `align-self: flex-end`)
  with `background: var(--ink)` / `color: var(--paper)` and **no sender label** (the side already says
  whose they are); **incoming** bubbles keep the prototype's left-aligned card fill *with* their sender
  label; the MC-15 action controls mirror to the matching side.
  This is a deliberate departure on an `Explicit` replica screen — **do not "restore the prototype" here.**
  Graded by `SalonDock.test.tsx` (« R2-A — own messages align right (D-7) ») and `mc15-message-actions.spec.ts`
  MC15-E10; `mc11-salon.spec.ts` MC11-E3 was updated from "bubble appears with own display name" to the new rule.
