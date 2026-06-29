# DR-2 — Catalog "Découvrir"

**As a** Visitor, **I want** a faceted catalog with filters, sort, and text search, **so that** I can narrow the library to works that match my taste.

> Screen(s): "Découvrir" (route `/decouvrir`) · Priority: Must · Fidelity: Explicit

## Frontend
- **Left filter sidebar "Filtrer"**:
  - Text search "Titre, auteur…".
  - **GENRE** chips: Seinen, Shōnen, Josei, Shōjo, Fantastique, Tranche de vie (multi-select).
  - **STATUT** radios: "Œuvres complètes" / "En cours".
  - **FORMAT** chips: Manga, One-shot, Roman.
  - **THÈMES** chips: Action, Thriller, Romance, Aventure, Horreur, Comédie, SF, École.
  - **PUBLIC** chips: Tous publics, 16+, 12+, 18+.
  - **LONGUEUR** radios: One-shot / Court 2-15 ch. / Long 15+.
  - **LANGUE** chips: Français, Traduit, English, 日本語.
  - **TRIER** options: Populaires / Nouveautés / Mieux notées.
  - Buttons: "Appliquer les filtres" and "Réinitialiser".
- **Main column**: heading "Catalogue" + result count (e.g. "47 résultats"); active-filter chips row labeled "FILTRES ACTIFS" with removable "✕" per chip and "Tout effacer".
- **Work cards** (3-col grid): title, genre, chapter count (e.g. "12 ch."), ♥ count, "✓ Complet" badge when complete, "📖 Roman" badge for roman format. Card → work page [[DR-3]].
- **Right rail**: "Actualités" concours card "Prix du jeune mangaka 2026" with "Participer" ([[PUB-7]]); "En vogue cette semaine" top-3; "SÉLECTION ÉDITEUR" (editor picks).
- **States**: loading skeleton grid; empty state ("aucun résultat") with a "Réinitialiser" affordance; error state with retry. Filters reflect in URL query so results are shareable/back-navigable.
- **Accessibility**: chips are toggle buttons with `aria-pressed`; radio groups labeled; result count announced on change; removable chips have descriptive labels (e.g. "Retirer le filtre Shōnen").

## Backend
- **GET /catalog** → filtered, sorted, paginated works + total count. Query params: `q` (text), `genre[]`, `statut`, `format[]`, `theme[]`, `public[]`, `longueur`, `langue[]`, `tri`, `page`.
- **GET /catalog/trending** → top-3 "En vogue cette semaine".
- **GET /contests/active** → active contest card data ([[PUB-7]]).
- **GET /catalog/editor-pick** → "SÉLECTION ÉDITEUR" items (curated by Publisher/Editor).
- **Entities**: Work (title, author/team, genre, themes, format, status, audienceRating, length, language, chapterCount, likeCount, ratingAvg), Contest, EditorPick.
- **Business rules**: multi-select facets combine as OR within a facet, AND across facets; `tri` maps to popularity (like count) / recency (publishedAt) / rating (ratingAvg desc); count reflects the same filter set.
- **Validation**: unknown facet values ignored; pagination bounds enforced.
- **Authorization**: public read. Editor pick managed by Publisher/Editor role.
- **Side effects**: none (read-only).

## Dependencies
- [[DR-3]] — work cards link to work pages.
- [[F-7]] — shares text-search semantics with global search.
- [[PUB-7]] — contest "Participer".
- [[DR-9]] — ♥ counts shown.

## Notes
- Explicit from prototype. Facet combine logic (OR-in/AND-across) is the conventional inference; confirm with product. Editor pick ownership inferred to Publisher/Editor.
