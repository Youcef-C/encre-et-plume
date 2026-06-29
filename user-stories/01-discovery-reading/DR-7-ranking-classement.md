# DR-7 — Ranking "Classement"

**As a** Visitor, **I want** an all-time ranking of works filterable by genre, **so that** I can find the most popular titles overall or within a genre.

> Screen(s): "Classement" · Priority: Should · Fidelity: Explicit

## Frontend
- **Header**: back "‹ Accueil" (→ [[DR-1]]); title "👑 Tous les temps" + "Classement".
- **Genre filter chips**: Tout, Shōnen, Seinen, Fantastique, Josei (single active).
- **Ranked list**: rows with rank badge, cover, title, meta, and "Lire" action. Row → work page [[DR-3]].
- **States**: loading skeleton list; empty state when a genre has no ranked entries; error/retry. Active genre reflected in URL.
- **Accessibility**: genre chips as toggle buttons with `aria-pressed`; ranked list is an ordered list with accessible rank labels; "Lire" buttons labeled with work title context.

## Backend
- **GET /ranking/all-time?genre=** → ordered list of works (rank, work id, cover, title, meta) with optional genre filter.
- **Entities**: Work, ranking aggregate (score from like/read/favorite counters — see [[DR-9]]).
- **Business rules**: all-time score is deterministic with stable tiebreak; "Tout" = no genre filter; same source feeds the home sidebar [[DR-1]].
- **Authorization**: public read.
- **Side effects**: none (read-only).

## Dependencies
- [[DR-1]] — back link and shared ranking source.
- [[DR-3]] — rows link to work pages.
- [[DR-9]] — counters feed ranking score.

## Notes
- Explicit from prototype. Exact scoring formula not specified by design; counters from [[DR-9]] feed it.
