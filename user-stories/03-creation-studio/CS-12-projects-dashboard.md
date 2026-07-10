# CS-12 — Projects dashboard "Mes projets"

**As a** Creator, **I want** a "Mes projets" page listing all my projects and illustration collections with their status, searchable and filterable, **so that** I can find, open, and manage everything I'm working on from one place.

> Screen(s): "Mes projets" (`data-page="dashboard"`, route `/projets`) · Priority: Must · Fidelity: Explicit (listing) / Inferred (search + collection management, user-specified 2026-07-09)

## Frontend

- **Header**: `h1` "Mes projets" + a summary line ("3 actifs · 1 en révision · prochaine sortie …", derived) + a **"＋ Nouveau projet"** button opening the [[CS-1]] wizard.
- **Search bar** (user-specified 2026-07-09): a debounced text search over the creator's own projects/collections by **title** (auto-applies while typing, no submit button; URL-synced), same on-brand search input pattern as the Galerie/Découvrir.
- **Status filter chips** (single active): **Tous / En cours / En pause / Publiés** (from the prototype), filtering the list.
- **Type filter chips** (user-specified 2026-07-10; single active): **Tous / Manga / Histoire / Illustrations / Collections** — filters the list by creation type. Independent of the status chips (both apply together); auto-applies, URL-synced. Induced addition — not drawn in the prototype.
  - **Illustrations vs Collections split (user-specified 2026-07-10)**: **Illustrations** shows **all** the creator's illustrations as flat individual cards — **including ones inside collections** (not just uncollected). **Collections** shows only collections (expandable, each revealing its related illustrations nested). **Tous** keeps the mixed view (projects + collections + uncollected illustrations; collected illustrations appear only nested inside their collection, not as duplicate top-level cards).
- **Project cards** (one per project): cover thumbnail (halftone fallback), title, **type badge** ("Manga" / "Histoire" / **"Illustration(s)"**), **status badge** ("En cours" / "En révision" / …) — **only for series works (Manga / Histoire·Roman)**; **illustrations/collections show NO status badge** (user-specified 2026-07-10 — they have no completion axis), and a **one-shot is always "Terminé" once published** (never "En cours"), a meta line (collaborators + role + current step, e.g. "Avec Yuki 🖌 · vous ✒ · étape : encrage Ch.1", or "Solo · vous 🖌 · 12 illustrations"), next-release note, and **two actions (user-specified 2026-07-10)**: **"Modifier"** → the edit surface (project workspace [[CS-2]] `/projet/{slug}`; for a collection, the manage view [[DR-12]] `/collection/{id}/gerer`) and **"Voir"** → the public page `/oeuvre/{slug}` ([[DR-3]]). (Replaces the single "Ouvrir".)
- **Manage collections** (user-specified 2026-07-09): illustration work surfaces here too — an **Illustration(s)** card ("Carnet d'encre · 12 illustrations") **opens the collection manage view** ([[DR-12]] `/collection/:id/gerer`: add/remove/reorder illustrations, cover, infos with Sauvegarder/Annuler) rather than the manga workspace. The page also offers a way to **create a new collection** and lists the creator's collections alongside projects (a collection is an `Illustration(s)` `Work` the creator owns — [[DR-12]]). So "Mes projets" is the single home to find and manage both manga/story projects and illustration collections.
- **Standalone illustrations** (user-specified 2026-07-10): illustrations the creator owns that are **not part of any collection** also appear as cards (reuse the same "uncollected" query the profile uses — `collections: { none: {} }`; include the owner's private/unpublished pieces so drafts are manageable here). Type badge **"Illustration"** (singular; collections stay "Illustration(s)"), **no status badge** (no completion axis), `kind: 'illustration'`. Actions: **Voir** → `/illustration/{id}`; **Modifier** → the illustration **Modifier page** `/illustration/{id}/modifier` (delivered by its own story — forward-linked here). Grouped under the **Illustration(s)** type filter alongside collections. (Parity note: the public **profile** already lists standalone illustrations via `ProfileCollectionsResponse.illustrations` — this brings the same to "Mes projets".)
  - **Visual differentiation (user-specified 2026-07-10)**: a single **illustration** and a **collection** must be visually distinct on the card, not only by badge text — collections get a **stacked/layers** treatment + a **"N illustrations" count**; standalone illustrations get a **single-image** marker. On-brand SVG icons (extend `icons.tsx`), no emoji.
  - **Expandable collection (user-specified 2026-07-10)**: a collection card is **expandable** — expanding reveals its linked illustrations as a **row of the same illustration cards** used elsewhere on the page (lazy-loaded from `GET /collections/:id`), with the collection styled as the visual **parent** (elevated/higher z, darker/inset, nested). Each member card is **fully interactive — same Voir/Modifier as an uncollected illustration** (view → `/illustration/{id}`, edit → `/illustration/{id}/modifier`). Many-to-many membership retained (no model change). Standalone illustrations are not expandable.
- **States**: loading skeleton list; empty ("Aucun projet — créez-en un"); empty-for-filter/search ("Aucun résultat"); error/retry.
- **Accessibility**: filter chips as toggle buttons with `aria-pressed`; search input labelled + debounced; cards are reachable, "Modifier" and "Voir" labelled with the project title.
- **Responsive**: cards stack full-width and reflow at ~375 / 768 / 1280px; the filter row + search wrap without overflow.

## Backend

- **GET /projects/mine** (extends the existing CS-1 seam) — the caller's own projects **and** illustration collections, each with `{ id, slug, title, type, status, coverImage, members[], step, nextReleaseAt, kind: 'project' | 'collection' }`. Filterable by `q` (title, debounced), `status` (tous|en-cours|en-pause|publies), and `type` (tous|manga|histoire|illustration; user-specified 2026-07-10 — matches the card type badge); paginated.
- Illustration collections are `Illustration(s)` `Work`s owned by the caller ([[DR-12]]) — folded into this listing (or a parallel `GET /collections/mine`, already built) so the page shows both; a `collection` row deep-links to [[DR-12]]'s manage view.
- **Standalone illustrations (user-specified 2026-07-10)**: also fold in the caller's illustrations that belong to **no** collection (`Illustration` where `artistId = caller` and `collections: { none: {} }`; include private/unpublished — the owner's management view). Emit as `kind: 'illustration'`, `type: 'illustration'`, `status: null`, `slug: null` (illustrations key off `id` → `/illustration/{id}`). Reuse the profile's uncollected-illustration mapper rather than duplicating.
- **Business rules**: only the caller's own projects/collections; progress/step/next-release derived; counts in the summary derived. **Status derivation (user-specified 2026-07-10)**: `status` is a **series-only** completion axis — emit it only for `Manga` / `Roman`(Histoire) series works; **illustration/collection rows emit `status: null`** (no badge). A **one-shot published work is "Terminé"**, never "En cours" (needs the `format` field from [[CS-1]]; until then collections/illustrations just get `null`).
- **Authorization**: authenticated creator only ([[F-1]]); never expose another user's projects.
- **Validation**: `status` constrained to the known set; `q` trimmed/bounded.

## Dependencies

- [[CS-1]] — "＋ Nouveau projet" wizard.
- [[CS-2]] — "Ouvrir" opens a project into the workspace.
- [[DR-12]] — illustration collections listed + managed here (a collection card opens the manage view; create a new collection).
- [[F-1]] — authenticated owner.
- [[F-3]] — the creator whose projects these are.

## Notes

- **Explicit**: the "Mes projets" listing — header, "＋ Nouveau projet", summary line, status filter chips, and the project cards (cover/type/status/meta/Ouvrir) are all drawn (`data-page="dashboard"`).
- **Induced additions (user-specified 2026-07-09)**: the **search bar** and the **collection-management** integration are not drawn in the prototype's Mes projets — added per the product owner so this page is the single place to find and manage both projects and illustration collections. Grade against these deviations.
- **Induced addition (user-specified 2026-07-10)**: the **type filter chips** (Tous / Manga / Histoire / Illustration(s)) are not drawn — added per the product owner to filter the listing by creation type alongside the status chips. Grade against this deviation.
- This story fills a gap: the Projets **listing** page had no user story (CS-1 is the create wizard, CS-2 the per-project workspace).
