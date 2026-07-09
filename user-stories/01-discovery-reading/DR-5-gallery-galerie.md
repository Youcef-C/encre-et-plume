# DR-5 — Illustration gallery "Galerie"

**As a** Visitor, **I want** to browse a gallery of illustrations by category and trend, **so that** I can discover artwork and the artists behind it.

> Screen(s): "Galerie" · Priority: Should · Fidelity: Explicit

## Frontend
- **Header**: "Galerie" + summary "128 illustrations · 36 artistes" + "＋ Publier une illustration" (→ the "Publier une illustration" wizard, [[CS-1]] Illustration branch / [[CS-3]] / [[DR-12]]). That wizard's Détails step also offers **"Lier à un concours"** and a **Soutien** step (paliers / dons / objectifs / partage des revenus) — both induced additions per [[CS-1]], scoped to the illustration or its collection œuvre.
- **Category chips**: Tout, Personnages, Couvertures, Décors, Fan-art, Process, **Collections** (single active). The **Collections** chip switches the grid to browse collection œuvres ([[DR-12]]) as cards (title, artist, cover, "N illustrations · collection") → each opens the collection Œuvre page ([[DR-3]]); the debounced text search + genre + hashtag facets apply to collections too. (Induced addition 2026-07-09 — the prototype's chip set omits Collections.)
- **Search bar** (user-specified 2026-07-04): debounced text search over illustration title/artist — auto-applies while typing (no submit button), URL-synced like the other facets.
- **Genre filter** (user-specified 2026-07-04): searchbar-to-add-tags picker over the full [[F-20]] vocabulary (same GenreSuggestInput + red GenreChip pattern as the profile page and [[DR-2]]), multi-select, OR within the facet; illustrations carry vocabulary genres.
- **Sort control**: "Trié par : Tendance ▾" (e.g. Tendance / Nouveautés / Populaires).
- **"🔥 Tendances cette semaine"**: 2 feature cards — **both** carry the "👁 Aperçu rapide" quick-preview affordance (user note 2026-07-04: #1 was missing it). Whenever the view is non-default — a search (title `q` / hashtag `tags` / `genre`), a selected **category**, or a **sort** other than « Tendance » — this feature is **hidden**; the active view overrides the trending feature (user-specified 2026-07-05).
- **"Toutes les illustrations"** grid: masonry grid cards (title, artist, category, ♥) with "👁 Aperçu rapide" quick-preview overlay → opens detail [[DR-6]]. Its heading becomes **"Résultats pour &lt;termes&gt;"** for any non-default view — title in « guillemets », hashtags as `#tag`, genres + category by their labels, and the sort label when not « Tendance » — joined by « · », so the results replace the trending feature rather than sitting under it. The preview's close « ✕ » control must not disturb the overlay layout (user note 2026-07-04).
- **States**: loading skeleton masonry; empty state per category; error/retry; quick-preview overlay shows larger image + minimal meta and a path into [[DR-6]].
- **Accessibility**: category chips as toggle buttons with `aria-pressed`; quick-preview reachable by keyboard and dismissible with Esc; images have alt text; ♥ counts have accessible labels.

## Backend
- **GET /illustrations** → filtered by `category`, **`q` (debounced text over title/artist)** and **`genre[]` (F-20 vocabulary ids, OR within the facet — Illustration entities carry vocabulary genres)**, sorted by `tri`, paginated (id, title, artist, category, likeCount, thumbnail).
- **GET /illustrations/trending** → top trending-this-week illustrations.
- **GET /illustrations/{id}/preview** → quick-preview payload (larger image + minimal meta).
- **POST /illustrations** → publish an illustration (cross-ref create flow [[CS-1]] Illustration branch / [[CS-3]]; auth, role Illustrator/Creator). Accepts optional **`hashtags[]`** (freetext descriptive chips, normalized like [[DR-6]] — feed the existing gallery hashtag search, [[F-22]]), optional `genres[]` ([[F-20]] vocabulary), optional `contestId` (link to an open contest → [[PUB-7]]/[[PE-6]]), optional `collectionIds[]` ([[DR-12]]), and optional Soutien fields (`tiers[]`, `allowDonations`, `goals[]`, `revenueSplit[]`) scoped to the illustration/collection œuvre → [[MR-1]]/[[MR-2]]/[[CS-10]].
- **Entities**: Illustration (title, artist, category, likeCount, dimensions, etc.), Artist (Creator).
- **Business rules**: "Tout" returns all categories; trending over rolling 7-day window; counts ("128 illustrations · 36 artistes") derived.
- **Validation**: category must be a known value; publish validates file/type/required metadata (in [[CS-3]]).
- **Authorization**: public read; publishing requires auth and Illustrator/Creator role.
- **Side effects**: publish creates an Illustration entity.

## Dependencies
- [[DR-6]] — quick-preview and card open illustration detail.
- [[CS-1]] / [[CS-3]] — "＋ Publier une illustration" wizard (Upload · Détails · Soutien · Publication).
- [[DR-12]] — the "série / un ensemble" toggle groups the publish into a collection.
- [[PUB-7]] / [[PE-6]] — "Lier à un concours" on the publish wizard.
- [[MR-1]] / [[MR-2]] / [[CS-10]] — the induced Soutien step (paliers / dons / objectifs / revenue split).
- [[DR-9]] — ♥ counts.

## Notes
- Explicit from prototype. Publishing detail lives in the create flow ([[CS-1]] Illustration branch / [[CS-3]]); this story covers the entry point and gallery read.
- **Induced additions** (not drawn on the illustration wizard, requested per [[CS-1]]): "Lier à un concours" and a Soutien step — the prototype draws these only on the manga wizard.
