# PUB-8 — News / Actualités feed + article

**As a** Reader, **I want** a news feed of platform announcements and a readable article page, **so that** I can keep up with contests, events, and hot topics.

> Screen(s): Nav route "Actualités" (route-only stub), home announcement ribbon, Découvrir "Actualités" column — rendered feed/article frame INFERRED · Priority: Could · Fidelity: Inferred

## Frontend
- News feed (inferred — no rendered frame existed) expected to list announcements with category tags:
  - "Concours", "À chaud", "Événement".
  - Each item: title, category badge, short excerpt, timestamp, link to the article.
- Article page (inferred): title, category, publish date, author, body content.
- Surfaces that DO exist and feed this:
  - Home announcement ribbon ("ANNONCES").
  - Découvrir "Actualités" column.
- States:
  - Empty: "Aucune actualité" when feed is empty.
  - Loading: skeleton list / article skeleton.
  - Error: retry affordance on fetch failure.
  - Not found: 404 state for a missing article id.
- Validation: n/a (read-only consumption); article id must resolve.
- Accessibility: feed is a list of articles with headings; category badges have text; article uses semantic headings and readable body.

## Backend
- **GET /news?category={concours|a-chaud|evenement}** — paginated feed: `{ items: [{ id, title, category, excerpt, publishedAt }], nextCursor }`.
- **GET /news/{id}** — single article: `{ id, title, category, body, authorId, publishedAt }`.
- Entity **Article**: `id, title, category, body, excerpt, authorId, status (draft|published), publishedAt, createdAt`.
- Business rules:
  - Only `published` articles appear in the public feed and resolve publicly.
  - Articles are authored in admin ([[AD-8]]).
  - Contest announcements ([[PUB-7]]) may surface as feed items.
- Validation: `category` enum; `id` must resolve to a published article for public reads.
- Authorization: public read (no auth); authoring restricted to Admin ([[AD-8]]).
- Side effects: published article may seed the home "ANNONCES" ribbon and Découvrir "Actualités" column.

## Dependencies
- [[AD-8]] — admin authors articles.
- [[DR-1]] — home announcement ribbon consumes news.
- [[PUB-7]] — contest announcements appear as articles/cards.

## Notes
- Inferred: this whole story. No rendered feed or article frame existed — derived from the nav route stub, the home "ANNONCES" ribbon, and the Découvrir "Actualités" column. Categories ("Concours", "À chaud", "Événement") are inferred from the announcement ribbon vocabulary.
