# F-22 — Clickable genre tags & freetext illustration hashtags

**As a** reader browsing an œuvre or an illustration, **I want** the genre tags to be clickable — taking me straight to the matching Découvrir / Galerie filter — and, for illustrations, freetext hashtags I can search (fan-art of existing licenses, techniques, characters), **so that** discovery flows from any work or illustration into related content.

> Screen(s): Œuvre ([[DR-3]]), Illustration ([[DR-6]]), Découvrir ([[DR-2]]), Galerie ([[DR-5]]) — a cross-cutting tagging convention on top of the [[F-20]] genre vocabulary · Priority: Should · Fidelity: Inferred (extends drawn screens; the tag rows exist, this makes them clickable + adds the illustration hashtag search)

## Context — two-layer tagging (this is the whole point)
1. **Genres = controlled** ([[F-20]] `genres.json` vocabulary). Rendered as clickable chips; each links to the **pre-applied genre facet** (Découvrir for works, Galerie for illustrations). Never freetext — faceting needs a stable, deduped, translatable set.
2. **Hashtags = freetext** (illustrations). Rendered as `#tag` chips; each links to a **freetext hashtag search** on Galerie. Illustrators tag fan-art / licenses / techniques (`#naruto`, `#aquarelle`) that will never be in the curated vocabulary — discovery there is search-driven, not facet-driven.

## Frontend
- **Œuvre page** ([[DR-3]] — `WorkHero` / `SynopsisBlock`): render the work's **genre + themes** as clickable genre chips → `/decouvrir?genre=<id>` (facet pre-applied via `filtersToQuery`). These become the work's tag row (they are genre tags wired to the catalogue genre filter, per the request). Keep the "Contenu mature" derivation unchanged. On-brand chip (ink border, paper bg, hard style), rendered as a real `<Link>` (keyboard-focusable, named "Filtrer par <genre>").
- **Illustration page** ([[DR-6]] — `IllustrationMeta`):
  - **Genres** (not shown today): add them as clickable genre chips → `/galerie?genre=<id>` (facet). Requires `genres` on the illustration detail response (below).
  - **Hashtags**: render the existing `#tag` chips as clickable links → `/galerie?tag=<hashtag>` (freetext hashtag search). Visually distinct from genre chips (`#` prefix) so the two layers read as different.
- **Galerie** ([[DR-5]]): a **freetext hashtag filter**, auto-applied (no button — [[F-20]] rule), debounced; clicking an illustration's hashtag lands here with the tag pre-filled; show the active `#tag` as a removable chip alongside the genre-facet chips. Reuse `GallerySearchInput` pattern; the tag filter is a distinct control from the title/artist `q` search.
- **Découvrir** ([[DR-2]]): genre chips from œuvres land on the existing genre facet — no new UI, just the pre-applied `genre` id param; the active-filter chips already render.
- No emojis; chips use the design tokens; responsive 375/768/1280; every clickable tag has an accessible name.

## Backend
- **Gallery list** (`apps/api/src/gallery/gallery.service.ts`): add an optional **`tag`** query param to the `GalleryQuery` — exact hashtag match `hashtags: { has: <normalized tag> }`. Normalize server-side (lowercase, strip leading `#`, trim, length cap) and validate like the other facets. Keep `q` (title/artist) as-is. (Optional, ponytail: also let `q` match hashtags — but the clickable-chip path uses `tag`, exact.)
- **Illustration detail** (`gallery.service.ts` detail + `IllustrationDetail` in `packages/shared/src/gallery.ts`): add **`genres: string[]`** (fr labels) to the response so the page can render + link them. Currently `genres` is used only server-side for `is18plus`.
- **Works / Catalog**: no new endpoint — genre chips reuse the existing `genre` id facet (`CatalogQuery.genre`, matched against `genre` OR `themes`). Confirm every rendered label round-trips through `resolveGenreId` (fr → id) so the link carries a valid vocabulary id.
- **Shared hashtag helper**: a `normalizeHashtag(raw): string` (lowercase, strip leading `#`, trim, collapse spaces, cap ~30 chars) + `normalizeHashtags(list): string[]` (dedupe, drop empties, cap count ~15) in `packages/shared`, reused by the seed and the gallery `tag` normalization. Single source of truth so a chip's label and the query param agree.
- **Validation / safety**: `tag` is allowlisted by shape (normalized), not by vocabulary (it's freetext by design); no injection surface (parameterized Prisma). Freetext hashtags are display/search only — no ownership claim; they remain actionable via the report flow ([[PUB-6]] → [[AD-2]]) and pass the same profanity guard as other user freetext where one exists.

## Acceptance
- Clicking a genre chip on an œuvre opens Découvrir filtered to that genre (results reflect the facet).
- Clicking a genre chip on an illustration opens Galerie filtered to that genre.
- Clicking a hashtag chip on an illustration opens Galerie filtered to illustrations carrying that exact hashtag.
- Typing a hashtag in the Galerie tag filter narrows the grid (auto-applied, debounced); the active tag shows as a removable chip.
- The mature ("Contenu mature") signal and the 18+ gate ([[DR-10]]) are unchanged.

## Dependencies
- [[F-20]] — genre vocabulary + `resolveGenreId` / `catalogGenreLabel` converters; the controlled layer.
- [[DR-2]] — catalog genre facet + `filtersToQuery`; [[DR-3]] — œuvre tag row.
- [[DR-5]] — gallery filters + search input; [[DR-6]] — illustration detail meta.
- [[DR-10]] — mature/18+ signals must stay intact when the tag rows change.

## Notes
- Requested 2026-07-05: "hashtags on œuvres must be genre tags wired to the catalogue genre filter; illustration/galerie hashtags are freetext (fan-art of existing licenses)." Works lead with genres; illustrations keep a freetext hashtag layer *in addition to* their genre facet.
- Out of scope (ponytail): a tag **authoring** UI (works/illustrations are seeded — F-10/CS studio own creation later); partial/fuzzy hashtag matching (exact token match only); freetext tags on works. Add if a real need appears.
