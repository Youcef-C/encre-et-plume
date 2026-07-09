# PUB-5 — Share

**As a** Reader, **I want** to share a work or illustration via a public link **or send it directly to a contact in a private message**, **so that** I can show it to people outside the platform (public link) or point a specific member to it without leaving the app (DM share).

> Screen(s): Work page ([[DR-3]]) and illustration detail ([[DR-6]]) — "↗ Partager" · Priority: Could · Fidelity: Explicit (trigger) / Inferred (modal body)

## Frontend
- "↗ Partager" trigger on the work page and illustration detail.
- Opens a share modal/action (body inferred) expected to contain:
  - A read-only public link field with a "Copier" action (copy-to-clipboard confirmation).
  - Optional quick-share targets (social/native share) — inferred.
  - **"Envoyer en message" (DM share)** (induced addition 2026-07-09 — not drawn in the prototype modal, which shows only the copy-link field): a contact picker over the sharer's contacts/conversations ([[MC-8]]/[[MC-9]]) — search by name, single or multi-select recipient(s), an optional note field — and a "Envoyer" action that posts the shared item into the DM as a message (the link + a title/thumbnail preview card). Confirmation ("Envoyé à …"); the recipient sees it in the messaging widget ([[MC-9]]). Auth-gated: signed-out users are prompted to sign in ([[F-1]]).
- States:
  - Copy success feedback ("Lien copié").
  - Loading while a link/metadata is fetched (if generated server-side).
  - Error toast if link generation fails.
- Accessibility: modal focus trap, focus returns to trigger on close; link field labelled and selectable; "Copier" has an accessible name and announces success.

## Backend
- **GET /share/{targetType}/{targetId}** — returns shareable public URL + OpenGraph metadata `{ url, title, description, imageUrl }` for a work, illustration, or chapter.
- **DM share** — reuse the [[MC-9]] messaging contracts, do not invent a new channel: resolve/create the DM via `POST /conversations` (DM by participant) then `POST /conversations/{id}/messages` with the share as the message payload — the public URL + a normalized reference to the shared target (`{ targetType, targetId }`) so the widget can render a title/thumbnail preview card (reuse the `GET /share/...` OpenGraph metadata for that card). One request per recipient when multiple are selected.
- Business rules:
  - Public link resolves to the public-facing view of the content; visible without auth ([[DR-3]], [[DR-4]], [[DR-6]]).
  - Premium/locked chapters ([[MR-1]]) still show their public preview/teaser via the shared link, not the gated content.
- Validation: `targetType` enum (work|illustration|chapter); target must exist and be public/published.
- Authorization: no auth required to generate or view a shared public link. **DM share requires auth** ([[F-1]]) and follows the [[MC-9]]/[[MC-8]] messaging rules (can only DM permitted recipients; blocked/muted users excluded per [[MC-10]]).
- Validation (DM share): recipient(s) must be valid, messageable accounts; the shared target must exist and be public/published (same rule as the link).
- Side effects: DM share creates a `Message` in the recipient's conversation ([[MC-9]]) and its unread/notification signals ([[F-5]]). Optional share-count analytics — inferred.

## Dependencies
- [[DR-3]], [[DR-6]], [[DR-4]] — shared content destinations.
- [[MR-1]] — locked chapters share a preview only.
- [[MC-9]] — DM share posts the item as a message via the messaging contracts.
- [[MC-8]] — contact picker source for DM share.
- [[F-1]] — DM share requires auth. [[MC-10]] — blocked/muted recipients excluded. [[F-5]] — DM triggers unread/notification.

## Notes
- Explicit: "↗ Partager" trigger on work & illustration.
- Inferred: modal body (link field, copy, quick-share targets), OpenGraph metadata endpoint, share-count analytics. Flag: modal contents were truncated in the design.
- **Induced addition (2026-07-09)**: **DM share ("Envoyer en message")** — the prototype's PARTAGER modal draws only the copy-link field; sending a shared item to a contact via a private message is added on top, reusing the [[MC-9]] messaging channel (no new messaging primitive). Grade against this deviation.
