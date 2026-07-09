# CS-12 — Projects dashboard "Mes projets"

**As a** Creator, **I want** a "Mes projets" page listing all my projects and illustration collections with their status, searchable and filterable, **so that** I can find, open, and manage everything I'm working on from one place.

> Screen(s): "Mes projets" (`data-page="dashboard"`, route `/projets`) · Priority: Must · Fidelity: Explicit (listing) / Inferred (search + collection management, user-specified 2026-07-09)

## Frontend

- **Header**: `h1` "Mes projets" + a summary line ("3 actifs · 1 en révision · prochaine sortie …", derived) + a **"＋ Nouveau projet"** button opening the [[CS-1]] wizard.
- **Search bar** (user-specified 2026-07-09): a debounced text search over the creator's own projects/collections by **title** (auto-applies while typing, no submit button; URL-synced), same on-brand search input pattern as the Galerie/Découvrir.
- **Status filter chips** (single active): **Tous / En cours / En pause / Publiés** (from the prototype), filtering the list.
- **Project cards** (one per project): cover thumbnail (halftone fallback), title, **type badge** ("Manga" / "Histoire" / **"Illustration(s)"**), **status badge** ("En cours" / "En révision" / …), a meta line (collaborators + role + current step, e.g. "Avec Yuki 🖌 · vous ✒ · étape : encrage Ch.1", or "Solo · vous 🖌 · 12 illustrations"), next-release note, and an **"Ouvrir"** action → the project workspace ([[CS-2]]).
- **Manage collections** (user-specified 2026-07-09): illustration work surfaces here too — an **Illustration(s)** card ("Carnet d'encre · 12 illustrations") **opens the collection manage view** ([[DR-12]] `/collection/:id/gerer`: add/remove/reorder illustrations, cover, infos with Sauvegarder/Annuler) rather than the manga workspace. The page also offers a way to **create a new collection** and lists the creator's collections alongside projects (a collection is an `Illustration(s)` `Work` the creator owns — [[DR-12]]). So "Mes projets" is the single home to find and manage both manga/story projects and illustration collections.
- **States**: loading skeleton list; empty ("Aucun projet — créez-en un"); empty-for-filter/search ("Aucun résultat"); error/retry.
- **Accessibility**: filter chips as toggle buttons with `aria-pressed`; search input labelled + debounced; cards are reachable, "Ouvrir" labelled with the project title.
- **Responsive**: cards stack full-width and reflow at ~375 / 768 / 1280px; the filter row + search wrap without overflow.

## Backend

- **GET /projects/mine** (extends the existing CS-1 seam) — the caller's own projects **and** illustration collections, each with `{ id, slug, title, type, status, coverImage, members[], step, nextReleaseAt, kind: 'project' | 'collection' }`. Filterable by `q` (title, debounced) and `status` (tous|en-cours|en-pause|publies); paginated.
- Illustration collections are `Illustration(s)` `Work`s owned by the caller ([[DR-12]]) — folded into this listing (or a parallel `GET /collections/mine`, already built) so the page shows both; a `collection` row deep-links to [[DR-12]]'s manage view.
- **Business rules**: only the caller's own projects/collections; progress/step/next-release derived; counts in the summary derived.
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
- This story fills a gap: the Projets **listing** page had no user story (CS-1 is the create wizard, CS-2 the per-project workspace).
