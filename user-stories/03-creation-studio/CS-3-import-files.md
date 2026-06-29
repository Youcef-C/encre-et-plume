# CS-3 — Import files "Importer dessins & textes"

**As an** Illustrator, **I want** to import drawings, texts, and scripts and link them to kanban cards, **so that** my project assets live alongside the pages they belong to.

> Screen(s): "Importer dessins & textes" (route /projets/<slug>/fichiers) · Priority: Must · Fidelity: Explicit

## Frontend
- Filter tabs: "Tout / Dessins / Textes / Scénarios" (active state filters the recent grid).
- "＋ Importer" button.
- Dashed drag-drop zone "Glissez vos fichiers ici", with accepted-types hint: "images (.png .jpg .psd) · textes (.txt .docx) · scénarios".
- Source options: "Parcourir…" (file picker), "Tablette", "Lien · URL", "Cloud".
- "Importés récemment": 4-column grid of cards — thumbnail, filename, type chip ("Dessin" / "Texte"), size (e.g. "2,4 Mo"), and "＋ Lier à une carte" to attach the asset to a kanban card ([[CS-2]]).
- States: drag-over highlight on drop zone; per-file upload progress; thumbnail-pending placeholder; empty state ("Aucun fichier importé"); error per file (unsupported type / too large / failed) with retry.
- Validation: enforce accepted extensions and a max file size; reject others with inline message.
- Linking: "＋ Lier à une carte" opens a card picker (project pages); selecting attaches asset→card.
- Accessibility: drop zone is also a keyboard-activatable button; file inputs labelled; type chips and sizes read as text; "＋ Lier à une carte" labelled with the filename.

## Backend
- **POST /projects/{slug}/assets** — multipart upload (one or many files). Generates thumbnail; stores size.
- **POST /projects/{slug}/assets/from-url** — import from a URL ("Lien · URL").
- Cloud / Tablet connectors — import from external source (tech-agnostic).
- **GET /projects/{slug}/assets?type=dessin|texte|scenario** — list, filterable by type.
- **POST /assets/{id}/link** — associate asset → card. Request `{ pageId }`.
- Entity **Asset**: `{ id, projectId, type: "dessin"|"texte"|"scenario", filename, size, thumbnailUrl, sourceUrl?, linkedPageId? }`.
- Business rules: validate extension/type and size on upload; type chip derived from file kind; an asset may link to one card (re-link replaces).
- Authorization: project members only.
- Side effects: linked asset surfaces as a file-type tag on the page card ([[CS-2]]) and in the editor file dropdown ([[CS-4]]).

## Dependencies
- [[CS-2]] — linking attaches assets to kanban cards.
- [[CS-4]] — imported files appear in the editor "Ouvrir un fichier" dropdown.

## Notes
- Explicit: filter tabs, drop zone, sources, recent grid, link action. Cloud/Tablet connector internals left tech-agnostic.
