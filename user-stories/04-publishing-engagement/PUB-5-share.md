# PUB-5 — Share

**As a** Reader, **I want** to share a work or illustration via a public link, **so that** I can show it to people outside the platform, including those without an account.

> Screen(s): Work page ([[DR-3]]) and illustration detail ([[DR-6]]) — "↗ Partager" · Priority: Could · Fidelity: Explicit (trigger) / Inferred (modal body)

## Frontend
- "↗ Partager" trigger on the work page and illustration detail.
- Opens a share modal/action (body inferred) expected to contain:
  - A read-only public link field with a "Copier" action (copy-to-clipboard confirmation).
  - Optional quick-share targets (social/native share) — inferred.
- States:
  - Copy success feedback ("Lien copié").
  - Loading while a link/metadata is fetched (if generated server-side).
  - Error toast if link generation fails.
- Accessibility: modal focus trap, focus returns to trigger on close; link field labelled and selectable; "Copier" has an accessible name and announces success.

## Backend
- **GET /share/{targetType}/{targetId}** — returns shareable public URL + OpenGraph metadata `{ url, title, description, imageUrl }` for a work, illustration, or chapter.
- Business rules:
  - Public link resolves to the public-facing view of the content; visible without auth ([[DR-3]], [[DR-4]], [[DR-6]]).
  - Premium/locked chapters ([[MR-1]]) still show their public preview/teaser via the shared link, not the gated content.
- Validation: `targetType` enum (work|illustration|chapter); target must exist and be public/published.
- Authorization: no auth required to generate or view a shared public link.
- Side effects: none required (optional share-count analytics — inferred).

## Dependencies
- [[DR-3]], [[DR-6]], [[DR-4]] — shared content destinations.
- [[MR-1]] — locked chapters share a preview only.

## Notes
- Explicit: "↗ Partager" trigger on work & illustration.
- Inferred: modal body (link field, copy, quick-share targets), OpenGraph metadata endpoint, share-count analytics. Flag: modal contents were truncated in the design.
