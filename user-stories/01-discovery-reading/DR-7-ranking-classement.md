# DR-7 — Ranking "Classement"

**As a** Visitor, **I want** an all-time ranking of works filterable by genre, **so that** I can find the most popular titles overall or within a genre.

> Screen(s): "Classement" · Priority: Should · Fidelity: Explicit

## Frontend
- **Header**: back "‹ Accueil" (→ [[DR-1]]); title "👑 Tous les temps" + "Classement".
- **Category tabs** (user-specified 2026-07-05 — replaces the genre-filter chips): **Mangas**, **Romans**, **Illustrations**, **Dessinateurs & Scénaristes** (single active). Each ranks a different entity type: Mangas = works with format Manga by all-time score; Romans = works format Roman; Illustrations = illustrations by likes; Dessinateurs & Scénaristes = creator profiles by trending/aggregate score. Active category reflected in URL.
- **Ranked list**: rows with rank badge, cover/thumbnail/avatar, title/name, meta, and the appropriate open action. Row → work page ([[DR-3]]) for Mangas/Romans, illustration detail ([[DR-6]]) for Illustrations, profile ([[F-3]]) for creators.
- **States**: loading skeleton list; empty state when a category has no ranked entries; error/retry.
- **Accessibility**: category tabs as toggle buttons with `aria-pressed`; ranked list is an ordered list with accessible rank labels; open actions labelled with the row's title/name context.

## Backend
- **GET /ranking?category=mangas|romans|illustrations|createurs** → ordered ranking entries (unified `RankingEntry`: rank, id, title, meta, cover, href, is18plus) for the selected category. (The prior `GET /ranking/all-time?genre=` works ranking stays for the home sidebar's single-truth source; the classement page uses the category endpoint.)
- **Entities**: Work (Manga/Roman), Illustration, Profile (creators via `creatorRoles`, ranked by `trendingScore`). Score from like/read/favorite counters — see [[DR-9]].
- **Business rules**: each category's score is deterministic with a stable tiebreak; the Mangas/Romans works ranking shares the DR-1/DR-7 ranking util (single truth).
- **Authorization**: public read.
- **Side effects**: none (read-only).

## Dependencies
- [[DR-1]] — back link and shared ranking source.
- [[DR-3]] — rows link to work pages.
- [[DR-9]] — counters feed ranking score.

## Notes
- Explicit from prototype. Exact scoring formula not specified by design; counters from [[DR-9]] feed it.
