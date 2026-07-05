# PUB-8 — News / Actualités feed + article

**As a** Reader, **I want** a news feed of platform announcements and a readable article page, **so that** I can keep up with contests, events, and hot topics.

> Screen(s): "Actualités" feed + "Article" page (both drawn in the prototype), reached from the header "Actualités" nav ([[F-4]]); also feeds the home "ANNONCES" ribbon + Découvrir "Actualités" column · Priority: Should · Fidelity: **Explicit** (feed + article screens are drawn; the authoring editor is [[AD-8]])

## Frontend
- News feed (prototype `ACTUALITÉS` screen), reached from the header **Actualités** link ([[F-4]]) — lists articles with category badges:
  - "Concours", "À chaud", "Événement".
  - Each item: title, category badge, short excerpt, timestamp, link to the article.
- Article page (prototype `ARTICLE` screen): title, category, publish date, author, rendered (markdown) body, back-to-Actualités link.
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
  - Articles are authored via the [[AD-8]] editor by `maintainer`/`admin` (publish directly) or by a verified `editor` tied to their contest ([[PUB-7]], pending admin approval).
  - Contest announcements ([[PUB-7]]) may surface as feed items.
- Validation: `category` enum; `id` must resolve to a published article for public reads.
- Authorization: public read (no auth); authoring lives in [[AD-8]] (maintainer/admin publish; verified editor drafts a contest-linked article pending admin approval).
- Side effects: published article may seed the home "ANNONCES" ribbon and Découvrir "Actualités" column.

## Dependencies
- [[AD-8]] — the article editor (staff publish; editor drafts pending approval).
- [[F-4]] — the header "Actualités" nav link routes here.
- [[PUB-7]] — a verified editor's contest is the context for an editor-authored article.
- [[DR-1]] — home announcement ribbon consumes news.
- [[PUB-7]] — contest announcements appear as articles/cards.

## Notes
- Fidelity correction (2026-07-05): the prototype DOES draw the `ACTUALITÉS` feed and `ARTICLE` screens (and the [[AD-8]] `ARTICLE — ÉDITEUR` modal) — this story was previously mis-marked "no rendered frame / Inferred". The categories (`Concours` / `À chaud` / `Événement`) match the announcement-ribbon badges.
