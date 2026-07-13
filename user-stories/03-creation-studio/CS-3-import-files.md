# CS-3 — Import files "Importer dessins & textes"

**As an** Illustrator, **I want** to import drawings, texts, and scripts and link them to kanban cards, **so that** my project assets live alongside the pages they belong to.

> Screen(s): "Importer dessins & textes" (route /projets/<slug>/fichiers) · Priority: Must · Fidelity: Explicit

## Frontend
- Filter tabs: "Tout / Dessins / Textes / Scénarios" (active state filters the recent grid).
- **Filter by card** (2026-07-13): the recent grid can also be scoped to the card an asset is linked to (a card filter that composes with the type tabs), so a member can see **all versions of each file grouped by type** for a given card ([[CS-2]] card).
- **Per-file version history** (2026-07-13): an asset is a **versioned file** — its card shows its current version (e.g. "v3") and opens a version list (v1…vN, each with note + date + author); re-importing/replacing the file adds a **new version of the same asset** (it does not create a second asset).
- "＋ Importer" button.
- Dashed drag-drop zone "Glissez vos fichiers ici", with accepted-types hint: "images (.png .jpg .psd) · textes (.txt .docx) · scénarios".
- Source options: "Parcourir…" (file picker), "Tablette", "Lien · URL", "Cloud".
- "Importés récemment": 4-column grid of cards — thumbnail, filename, type chip ("Dessin" / "Texte"), size (e.g. "2,4 Mo"), a "👁 Aperçu" action, and "＋ Lier à une carte" to attach the asset to a kanban card ([[CS-2]]).
- **In-app document preview without download** (user-specified 2026-07-09): "👁 Aperçu" opens the asset **inline in a viewer overlay** — the reader never has to download it to read it. Supports images and **documents including `.docx`** (rendered to readable HTML/pages in-app), plus `.txt`; PDFs render inline too. `.docx` is an accepted upload type (the hint already lists `.docx`) and is previewable, not just downloadable. The viewer is read-only, keyboard-dismissible, and paginates/scrolls long documents; a "Télécharger" action remains available but is not required to view.
- States: drag-over highlight on drop zone; per-file upload progress; thumbnail-pending placeholder; empty state ("Aucun fichier importé"); error per file (unsupported type / too large / failed) with retry.
- Validation: enforce accepted extensions and a max file size; reject others with inline message.
- Linking: "＋ Lier à une carte" opens a card picker (project pages); selecting attaches asset→card.
- Accessibility: drop zone is also a keyboard-activatable button; file inputs labelled; type chips and sizes read as text; "＋ Lier à une carte" labelled with the filename.

## Backend
- **POST /projects/{slug}/assets** — multipart upload (one or many files). Generates thumbnail; stores size.
- **POST /projects/{slug}/assets/from-url** — import from a URL ("Lien · URL").
- Cloud / Tablet connectors — import from external source (tech-agnostic).
- **GET /projects/{slug}/assets?type=dessin|texte|scenario&pageId=…** — list, filterable by type **and by linked card** (`pageId`); each item carries its **current version** and the linked card. This is the source for [[CS-2]]'s per-file card badge/chips (grouping versions by file type for a card).
- **POST /projects/{slug}/assets/{id}/versions** — add a new version of an existing asset (new [[F-10]] `Media` blob + optional note); increments the asset's version. Replaces the naive [[CS-2]] `Page.version` bump.
- **GET /assets/{id}/versions** — the asset's version chain (v1…vN with note, date, author, `mediaId`). Supersedes CS-2's `GET /pages/{id}/versions`.
- **Document preview** (user-specified 2026-07-09): the asset payload exposes a **preview form for documents** so the client renders them inline without a download — `.docx` is converted to viewable HTML (a derivative produced off the request path via the [[F-8]] queue, like image variants, cached in [[F-10]]); `.txt` returns text; PDFs stream inline (`Content-Disposition: inline`, or a short-lived signed URL for private assets). Allowlist `.docx` on upload and cap size/pages.
- **POST /assets/{id}/link** — associate asset → card. Request `{ pageId }`.
- Entities:
  - **Asset** (a versioned logical file): `{ id, projectId, type: "dessin"|"texte"|"scenario", filename, currentVersion, linkedPageId?, mediaId (current version's blob) }` — the "file" a card links to; its bytes evolve through versions.
  - **AssetVersion**: `{ id, assetId, version (int), mediaId, size, thumbnailUrl, note?, authorId, createdAt }` — one row per revision; the bytes/thumbnail are a `Media` blob from [[F-10]] (presigned upload → image-processing variants); `thumbnailUrl` comes from F-10's variants. Don't reinvent storage.
- Business rules: validate extension/type and size on upload; type chip derived from file kind; an asset may link to one card (re-link replaces); **versioning is linear** (v1…vN, no branching/merge); re-import of a linked file appends a version, it does not spawn a new asset.
- Authorization: project members only.
- Side effects: linked asset surfaces as a file-type tag on the page card ([[CS-2]]) and in the editor file dropdown ([[CS-4]]).

## Dependencies
- [[F-10]] — media storage: presigned direct-to-storage uploads, image processing, and CDN delivery back the asset bytes & thumbnails (each AssetVersion references a `Media`).
- [[CS-2]] — linking attaches assets to kanban cards; CS-3 **owns file versioning**, CS-2's card badge/chips derive from it.
- [[CS-4]] — imported files appear in the editor "Ouvrir un fichier" dropdown.

## Notes
- Explicit: filter tabs, drop zone, sources, recent grid, link action. Cloud/Tablet connector internals left tech-agnostic.
- **Versioning model (2026-07-13)**: version history lives on the **file (Asset), not the kanban card**. A card links several files (scénario/nemu/réf/encrage) that each version independently; CS-3 owns the Asset version chain (`AssetVersion`), and [[CS-2]]'s card badge is a derived rollup + per-file chip versions. When CS-3 is built it **replaces** CS-2's interim `Page.version` / `PageVersion` / `GET /pages/{id}/versions` (remove them then).
- **Type-alignment for the CS-2 modal's per-type FICHIERS sections (2026-07-13)**: the card modal groups linked files into **Scénario / Dessin / Page / Références** ([[CS-2]]). Scénario→`scenario`(`texte`), Dessin→`dessin`, Références→`ref` all map to existing Asset `type`s; the composed **page/planche** ("the page itself") has no dedicated type today. Resolve when building CS-3: either add an Asset `type` value **`page`** (planche finale) or represent it as a `dessin` tagged as the final page — pick one and record it so CS-2's sections and CS-3's `type` stay in sync.
