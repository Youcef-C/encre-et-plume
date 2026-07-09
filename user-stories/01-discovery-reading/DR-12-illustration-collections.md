# DR-12 — Illustration collections "Collection"

**As an** Illustrator/Creator, **I want** to group my illustrations into named **"collections"** (e.g. "Carnet d'Encre") — assigned when I publish an illustration or edited afterward — **so that** related artwork reads as one body of work on my profile and in a dedicated Œuvre page.

> Screen(s): "Galerie" publish flow, illustration detail, "Œuvre" (Collection variant), artist profile · Priority: Should · Fidelity: **Mixed** — the Illustration(s) Œuvre ("recueil") is drawn (Explicit display); the collection-management controls are Inferred.

## Frontend
- **Assign at publish**: the "Publier une illustration" flow ([[DR-5]]/[[CS-3]]) gains an optional **"Collections"** field — an `OnBrandMultiSelect` over the artist's own collections (many-to-many; selected values shown as removable chips outside the trigger), plus **"＋ Nouvelle collection"** to create one inline (title required; optional description; genres via `GenreSuggestInput` + red `GenreChip` over the [[F-20]] vocabulary; **hashtags** — freetext descriptive chips, space-separated, normalized like [[DR-6]]/[[F-22]] (NOT F-20 genres); optional **cover** — see below).
- **Edit a member from the manage view** (user-specified 2026-07-09): each member illustration card in the manage-collection view carries an owner-only **"Modifier"** affordance that opens the illustration edit ([[DR-6]] owner-edit → `PATCH /illustrations/:id`), so the artist can fix an illustration's title/category/description/hashtags/tools/licence/visibility without leaving the collection.
- **Hashtags on illustrations**: the "Publier une illustration" flow ([[DR-5]]) and the illustration owner-edit ([[DR-6]]) capture **hashtags** on the illustration itself (`Illustration.hashtags`, already in the model) — there is no entry control today, so add one (freetext chips) so both illustrations and collections become hashtag-searchable in the Galerie.
- **Assign / edit after**: an owner-only "Modifier" affordance on illustration detail ([[DR-6]]) and a **manage-collection** view — **add illustrations** (an "＋ Ajouter des illustrations" picker over the artist's own illustrations **not already members**, sourced from `GET /illustrations/mine`, multi-select → `POST /collections/:id/illustrations`), remove illustrations, **reorder** (drag or ↑/↓), edit title/description/genres/**hashtags**, **set the cover**, and delete the collection (member illustrations survive, just unlinked). (The add-illustration picker is user-specified 2026-07-09 — round-1 shipped without a usable add control.)
- **Cover**: a collection is a `Work`, so its cover uses the **same œuvre-cover mechanism as [[CS-2]]** — the "Déposez la couverture" `image-slot` drop → [[F-10]] presigned upload → `Work.coverImage` — **or** promote a member illustration as the cover in one click. Settable at create ("＋ Nouvelle collection") and after (manage view); falls back to the CSS halftone placeholder when unset.
  - **The cover is always a member of the collection** (user-specified 2026-07-09): promoting a member sets it (already a member); **uploading a new cover also adds it to the collection** — the uploaded image becomes an `Illustration` owned by the artist (category "Couverture"), inserted as a member (order 0) and set as `Work.coverImage`, so it counts in "N illustrations". The cover is never an orphan image detached from the set.
  - **Layout** (user-specified 2026-07-09): the drop-file box and the preview-cover box are the **same height** (the "Déposez…" `image-slot` matches the preview thumbnail dimensions), so the control reads as one consistent frame.
  - **Persistent upload box** (user-specified 2026-07-09): the **"Upload" / drop box must never change or disappear** when an image is added — it always stays the same droppable control (so you can re-drop / replace at any time). The **preview sticks to the side** as a separate thumbnail that updates on upload; the drop box itself never becomes the preview. This is a shared `UploadControl` behavior — apply the **same** rule to the **profile picture module** ([[F-3]] avatar edit), not just the collection cover.
- **Contest & Soutien**: a collection is a `Work` œuvre, so — like any œuvre — it can be **"Lié à un concours"** ([[PUB-7]]/[[PE-6]]) and can carry a **Soutien** config (paliers d'abonnement, dons uniques, objectifs de financement, and partage des revenus for co-authored collections → [[MR-1]]/[[MR-2]]/[[CS-10]]). Both are settable in the "＋ Nouvelle collection" create step and the manage view. Induced additions per [[CS-1]] (the prototype draws neither on the illustration flow — see Notes).
- **Collection page**: a collection renders as an **Œuvre of type "Collection"** ([[DR-3]]) — badge "Collection", meta "N illustrations · collection", grid of member illustrations in `order` (→ illustration detail [[DR-6]]), and a **"Voir la galerie"** CTA linking into the Galerie filtered to this collection. Reuses the [[DR-3]] layout; no chapters/planches branch.
- **Browse in the Galerie** ([[DR-5]]): a **"Collections"** category chip in the Galerie switches the grid to browse collection œuvres as cards (title, artist, cover, "N illustrations · collection") → each opens the collection Œuvre page; the debounced text search + genre + **hashtag** facets apply to collections too, so a collection is discoverable by category tag, genre, and hashtag. (Induced addition 2026-07-09.)
- **Artist profile** ([[F-3]]): the creator's collections surface as a grouped section; standalone (uncollected) illustrations still appear ungrouped in the Galerie and on the profile.
- **Copy** (verbatim French): "Collection", "Collections", "Ajouter à une collection", "＋ Nouvelle collection", "Voir la galerie", "N illustrations · collection". On-brand controls only (`OnBrand*`, `GenreChip`); pictograms from the shared SVG icon set.
- **States**: create/submit loading; empty collection ("Aucune illustration"); reorder pending; validation (title required; membership limited to the artist's own illustrations); error/retry.
- **Responsive**: works at ~375 / 768 / 1280px — the collection grid reflows to fewer columns; the publish multiselect and manage view stay usable on mobile.
- **Accessibility**: multiselect + chips keyboard-operable; reorder exposes keyboard controls and an `aria-live` region; collection cards are focusable links; images have alt text.

## Backend
- **Reuse `Work`** with `format = "Illustration(s)"` as the collection (add `"Illustration(s)"` to `CATALOG_FORMATS` / the format vocabulary). Add a join entity **`IllustrationCollection { illustrationId, workId, order }`** — composite-unique on `(illustrationId, workId)`, indexed on `(workId, order)` — for the many-to-many membership + per-collection ordering.
- **POST /collections** — create an Illustration(s) Work `{ title, cover?, description?, genres[], hashtags[], contestId?, tiers[]?, allowDonations?, goals[]?, revenueSplit[]? }`; owner = the authenticated artist. `cover` is either an [[F-10]] presigned-upload media URL/id or a member illustration's image, written to `Work.coverImage`. `hashtags[]` are normalized freetext chips (`Work.hashtags`); `contestId` links the collection œuvre to an open contest ([[PUB-7]]/[[PE-6]]); the Soutien fields seed [[MR-1]]/[[MR-2]]/[[CS-10]] scoped to the collection.
- **PATCH /collections/{id}** — edit `title` / `cover` / `description` / `genres` / `hashtags` / `contestId` / Soutien config.
- **GET /collections** — public, paginated list of collection œuvres for the Galerie "Collections" facet, filterable by `q` (title/artist), `genre[]` ([[F-20]]), and `tags[]` (hashtags, [[F-22]]); returns card fields (id, slug, title, artist, cover, illustrationCount). Mirrors the [[DR-5]] gallery query shape.
- Extend **POST /illustrations** ([[DR-5]] publish) to accept **`hashtags[]`** (`Illustration.hashtags`) in addition to the optional `collectionIds[]`, so published illustrations are hashtag-searchable.
- **DELETE /collections/{id}** — delete the collection; membership rows are removed, the Illustration entities are untouched.
- **POST / DELETE /collections/{id}/illustrations** — add / remove a membership `{ illustrationId }` (dedup on re-add).
- **PATCH /collections/{id}/order** — reorder `{ illustrationIds[] }`.
- **GET /collections/{id}** — the collection + its ordered member illustrations (may fold into [[DR-3]]'s `GET /works/{id}` Illustration(s) branch, returning members instead of chapters/planches).
- Extend **POST /illustrations** ([[DR-5]] publish) with an optional `collectionIds[]` to assign at publish time.
- **Entities**: Work (format "Illustration(s)"), Illustration, IllustrationCollection (join), Account (artist).
- **Business rules**: `format = "Illustration(s)"` Works render as collections; count/meta ("N illustrations · collection") are derived from membership rows; an illustration may belong to many collections; standalone illustrations remain in the Galerie ungrouped.
- **Cover-as-member rule** (2026-07-09): setting the cover by **promoting a member** just points `coverImage` at that member's image; setting the cover by **uploading** a new image creates an `Illustration` (category "Couverture", `artistId` = the collection owner) from the [[F-10]] media, inserts it into `IllustrationCollection` at `order = 0`, and sets `Work.coverImage`. The cover is therefore always a membership row (counts in the total), never a detached image.
- **Authorization**: public read of a collection; create/edit/delete/membership/reorder require auth and the Illustrator/Creator role **and ownership** — every member illustration must belong to the acting artist (enforced server-side, never trust client claims).
- **Validation**: `title` required; `collectionIds` / `illustrationId` must exist and be owned by the caller; reject cross-owner membership.
- **Side effects**: creating a collection creates a `Work`; membership/reorder writes are on the join table only.

## Dependencies
- [[DR-3]] — Œuvre page renders the Collection variant + "Voir la galerie".
- [[DR-5]] — publish flow assigns collections; Galerie is filterable by collection.
- [[DR-6]] — illustration detail shows and edits its collections.
- [[CS-1]] — "at project creation" entry point (see open question below).
- [[CS-3]] — import/publish flow.
- [[F-3]] — profile surfaces the creator's collections.
- [[F-20]] / [[F-22]] — genre vocabulary & clickable genre chips.
- [[F-10]] — media storage for collection cover images.
- [[PUB-7]] / [[PE-6]] — "Lié à un concours".
- [[MR-1]] / [[MR-2]] / [[CS-10]] — the collection's Soutien config (paliers / dons / objectifs / revenue split).

## Notes
- **Induced deviation**: the prototype labels an Illustration Œuvre a "recueil" ("Carnet d'Encre · 24 illustrations · recueil"); per the product owner this story uses **"Collection"** everywhere. Grade against "Collection", not the prototype's "recueil". (The reader-side casual "ma collection" in [[DR-8]] is unrelated — collections here are a creator artifact, not the saved-set.)
- The Illustration(s) Œuvre is **drawn but unbuilt** — [[DR-3]]'s backend wires only manga/roman (chapters/planches). This story makes the Illustration(s) branch real.
- `"Illustration(s)"` is added to `CATALOG_FORMATS`.
- **Induced additions** (per [[CS-1]], not drawn on the illustration flow): a collection œuvre can be linked to a contest and can carry a Soutien config — the prototype draws contest-link + Soutien only on the manga wizard.
- **Induced additions (2026-07-09)**: (a) a **"Collections" category chip** in the Galerie ([[DR-5]]) makes collections browsable/searchable there via category tag + genre + hashtag (`GET /collections`); (b) **hashtag entry** is added to both the illustration publish/edit flow (`Illustration.hashtags`) and the collection create/manage form (`Work.hashtags`) — the models already carry `hashtags[]`, only the input controls were missing.
- **Open (Inferred)**: whether creating a CS-1 `Illustration(s)` project auto-creates its collection Œuvre — the collection is a `Work`; wiring the [[CS-1]] "at project creation" entry point is confirmed at planning time.
