# MC-8 — Contacts & connexions

**As a** Creator, **I want** a network of contacts with connection requests and suggestions, **so that** I can build and manage my professional relationships and message them.

> Screen(s): "Contacts & connexions" · Priority: Must · Fidelity: Explicit (wireframe)

## Frontend
- LinkedIn-style page with tabs: "Contacts · 48" (count), "Demandes [2]" (badge with pending count), "Suggestions".
- "＋ Ajouter un contact" action and a people search field with placeholder "nom, rôle, genre, région…" (scoped search, [[F-7]]).
- "Demandes" tab — each request row: avatar, name, role chip, context line (e.g. "2 projets en commun · souhaite se connecter", "a aimé 3 de vos planches"), and "Accepter" / "Refuser" buttons.
- "Contacts" tab — each contact row: avatar with presence dot (green = online / grey = offline with "vu il y a 2 h"), name, role, city / mutual-projects, and actions "Message" (→ [[MC-9]]) and "⋯" (overflow menu).
- "Suggestions" tab — cards: avatar, name, role + genre, "＋ Se connecter".
- States: loading skeletons per tab; empty states per tab ("Aucun contact", "Aucune demande", "Aucune suggestion"); error/retry; optimistic update on accept/refuse with the "Demandes" badge decrementing.
- Accessibility: presence conveyed with text ("en ligne" / "vu il y a 2 h"), not color alone; tab badges announced; search field labelled; buttons named with the person's name.

## Backend
- `GET /contacts` — list connections. Response: `[{ userId, name, avatarUrl, role, city, mutualProjects, presence: { online, lastSeen } }]`.
- `GET /connections/requests` — pending incoming requests with context line.
- `POST /connections/requests` — send a request (from "＋ Ajouter un contact" / "＋ Se connecter") `{ toUser }`.
- `PATCH /connections/requests/{id}` — `{ status: accepted | declined }`.
- `GET /connections/suggestions` — suggested people to connect with.
- `GET /people/search?q=` — scoped people search by name, role, genre, region ([[F-7]]).
- `GET /presence?userIds=` — online status / last-seen (may be served via the realtime channel of [[MC-9]]).
- Entities: `Connection` (`userA`, `userB`, `status`, `createdAt`); `ConnectionRequest` (`id`, `from`, `to`, `context`, `status`); presence record (`userId`, `online`, `lastSeen`).
- Business rules: a connection is mutual once accepted; context line derived from shared signals (mutual projects, likes on the user's planches); accepting creates a `Connection` and may enable messaging ([[MC-9]]); duplicate/self requests rejected; badge counts feed notifications ([[F-5]]).
- Validation: target exists and is not already connected/blocked; cannot request self.
- Authorization: authenticated; requests actionable only by the recipient; banned users ([[AD-6]]) excluded from lists/search.
- Side effects: request and acceptance notify the other party ([[F-5]]); "Demandes" badge and notification counts update; accepted connection appears in both users' "Contacts".

## Dependencies
- [[F-7]] — scoped people search.
- [[MC-9]] — "Message" launches a conversation.
- [[F-5]] — request/accept notifications and badge counts.
- [[MC-3]] / [[MC-7]] — invites and accepted applications may create connections.
- [[PUB-4]] — follow is an adjacent relationship surfaced in suggestions/context.

## Notes
- Explicit: tabs with counts/badges, "＋ Ajouter un contact", scoped search placeholder, "Demandes" rows with context and "Accepter"/"Refuser", "Contacts" rows with presence dot and "Message"/"⋯", "Suggestions" cards with "＋ Se connecter".
- Inferred: exact endpoint shapes, how the context line is computed, and presence transport (likely shared with [[MC-9]]).
