# DR-5 — Illustration gallery "Galerie"

**As a** Visitor, **I want** to browse a gallery of illustrations by category and trend, **so that** I can discover artwork and the artists behind it.

> Screen(s): "Galerie" · Priority: Should · Fidelity: Explicit

## Frontend
- **Header**: "Galerie" + summary "128 illustrations · 36 artistes" + "＋ Publier une illustration" (→ create illustration / gallery upload, part of [[CS-3]]).
- **Category chips**: Tout, Personnages, Couvertures, Décors, Fan-art, Process (single active).
- **Sort control**: "Trié par : Tendance ▾" (e.g. Tendance / Nouveautés / Populaires).
- **"🔥 Tendances cette semaine"**: 2 feature cards.
- **"Toutes les illustrations"**: masonry grid cards (title, artist, category, ♥) with "👁 Aperçu rapide" quick-preview overlay → opens detail [[DR-6]].
- **States**: loading skeleton masonry; empty state per category; error/retry; quick-preview overlay shows larger image + minimal meta and a path into [[DR-6]].
- **Accessibility**: category chips as toggle buttons with `aria-pressed`; quick-preview reachable by keyboard and dismissible with Esc; images have alt text; ♥ counts have accessible labels.

## Backend
- **GET /illustrations** → filtered by `category`, sorted by `tri`, paginated (id, title, artist, category, likeCount, thumbnail).
- **GET /illustrations/trending** → top trending-this-week illustrations.
- **GET /illustrations/{id}/preview** → quick-preview payload (larger image + minimal meta).
- **POST /illustrations** → publish an illustration (cross-ref create flow [[CS-3]]; auth, role Illustrator/Creator).
- **Entities**: Illustration (title, artist, category, likeCount, dimensions, etc.), Artist (Creator).
- **Business rules**: "Tout" returns all categories; trending over rolling 7-day window; counts ("128 illustrations · 36 artistes") derived.
- **Validation**: category must be a known value; publish validates file/type/required metadata (in [[CS-3]]).
- **Authorization**: public read; publishing requires auth and Illustrator/Creator role.
- **Side effects**: publish creates an Illustration entity.

## Dependencies
- [[DR-6]] — quick-preview and card open illustration detail.
- [[CS-3]] — "＋ Publier une illustration" create flow.
- [[DR-9]] — ♥ counts.

## Notes
- Explicit from prototype. Publishing detail lives in the create flow [[CS-3]] (not enumerated in the global index but named by design); this story only covers the entry point and gallery read.
