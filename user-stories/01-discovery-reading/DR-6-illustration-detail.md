# DR-6 — Illustration detail

**As a** Visitor, **I want** a full detail view for an illustration, **so that** I can view it large, read its metadata, react and comment, and explore the artist.

> Screen(s): Illustration detail (from "Galerie") · Priority: Should · Fidelity: Explicit

## Frontend
- **Header**: back "‹ Galerie" (→ [[DR-5]]).
- **Artwork viewer**: image slot + "⛶ Plein écran". **Image fit (user-specified 2026-07-09)**: the **fullscreen** view must show the **whole image** — `object-fit: contain` (letterboxed, never a zoomed/cropped `cover`); the inline **preview** shows the image **centered** (centered focal point, `object-position: center`), not clipped to an off-center crop.
- **Action bar**: like, save ([[DR-9]]), "↗ Partager" ([[PUB-5]]), "⚑ Signaler" ([[PUB-6]]).
- **Meta block**: title, byline (artist, category, ♥), description, hashtag chips.
- **Owner edit** (induced addition 2026-07-09): when the viewer owns the illustration, a **"Modifier"** affordance on the page opens an inline/edit form for the illustration itself — title, category, description, **hashtags**, tools, licence, visibility — wired to `PATCH /illustrations/:id` ([[DR-12]] extends this beyond the minimal hashtag patch). This is distinct from the collection-membership "Modifier" ([[DR-12]]); both are owner-only.
- **Comments section** ([[PUB-2]]): list + composer + "Publier".
- **Sidebar artist card**: avatar, "🖌 Dessinateur·rice · Lyon", "＋ Suivre" ([[PUB-4]]), "★ Soutenir" ([[MR-1]]), "✉ Proposer une collab" ([[MC-3]]).
- **Sidebar "Détails"**: Catégorie, Publié, Dimensions (e.g. "2480×3508"), Outils, Licence.
- **"Plus de cet·te artiste"**: grid of other works by the same artist.
- **Admin moderation bar** (révoquer / bannir) ([[AD-4]]) — Admin only.
- **States**: image loading placeholder; fullscreen view; empty comments state; error on missing illustration (404); personal actions prompt sign-in [[F-1]] when anonymous.
- **Accessibility**: artwork has alt text/description; fullscreen and action buttons labeled; comment composer labeled; "Plus de cet·te artiste" cards are focusable links.

## Backend
- **GET /illustrations/{id}** → illustration with metadata (title, description, category, tags, dimensions, tools, license, publishedAt, likeCount), artist (id, name, role, city, avatar).
- **POST/DELETE like & save** for illustration ([[DR-9]]).
- **GET/POST /illustrations/{id}/comments** ([[PUB-2]]).
- **GET /artists/{id}/illustrations?exclude={id}** → "Plus de cet·te artiste".
- **Entities**: Illustration, Artist (Creator), Comment, Reaction.
- **Business rules**: dimensions/tools/license stored at publish time; more-from-artist excludes current item.
- **Authorization**: public read; like/save/comment/follow/support/collab require auth [[F-1]]; moderation (révoquer/bannir) requires Admin [[AD-4]].
- **Side effects**: comment/reaction events; moderation actions revoke or ban.

## Dependencies
- [[DR-5]] — entered from gallery.
- [[DR-9]] — like/save.
- [[PUB-2]] — comments. [[PUB-4]] — follow. [[PUB-5]] — share. [[PUB-6]] — report.
- [[MR-1]] — support. [[MC-3]] — collab proposal.
- [[F-3]] — artist profile. [[AD-4]] — admin moderation.

## Notes
- Explicit from prototype, including dimensions "2480×3508", tools, and license fields.
