# MC-4 — Post a call "Appels à projets"

**As a** Creator, **I want** to browse and post open calls describing what collaborator I'm looking for, **so that** the right partner can find and apply to my project.

> Screen(s): "Appels à projets" · Priority: Must · Fidelity: Explicit (wireframe)

## Frontend
- Board header with a self-role toggle "Je suis :" ("Dessinateur·rice" / "Scénariste"), a "Genre ▾" dropdown, and a "＋ Poster un appel" button.
- Call cards, each showing:
  - Sample thumbnail with a dashed "sample slot" placeholder when no image.
  - Directional eyebrow: "SCÉNARISTE CHERCHE DESSINATEUR·RICE" or "DESSINATEUR CHERCHE SCÉNARISTE".
  - Title (e.g. "« Lames de Brume »").
  - Genre/format chips (e.g. "Seinen", "Thriller", "~120 planches" / "Fantastique", "One-shot").
  - Description text.
  - Author avatar + name.
  - Status line: "Clôture dans 12 j" (countdown) or "5 candidatures" (applicant count).
  - "Candidater" button (→ [[MC-5]]).
- "Poster un appel" form/modal fields: direction (who is sought), title, genres, format/scope (e.g. page count, one-shot/series), sample image upload, deadline (date).
- States: loading skeletons; empty board ("Aucun appel pour ces filtres."); error/retry; closed calls shown as such (no "Candidater"); the author's own calls do not show a "Candidater" button.
- Interactions: toggling role / changing genre refetches; posting an appeal validates and prepends the new card; deadline drives the "Clôture dans X j" display.
- Accessibility: directional eyebrow conveyed as text (not color alone); chips and countdown readable; dashed sample slot has accessible label; "Candidater"/"Poster un appel" have clear names.

## Backend
- `GET /calls` — list/filter calls. Query: `role` (direction sought), `genre`, `status` (open|closed), `page`. Response: cards with `applicantCount` and `deadline`.
- `POST /calls` — create a call. Request: `{ direction, title, genres[], format, scope, sampleAssetId?, deadline }` (owner = current user).
- Entity `Call`: `id`, `ownerId`, `direction (writerSeeksIllustrator | illustratorSeeksWriter)`, `title`, `genres[]`, `format`, `scope`, `sampleAssetId?`, `description`, `deadline`, `status`, `applicantCount`, `createdAt`.
- Business rules: a call auto-closes at its deadline (no new applications after); `applicantCount` derived from applications ([[MC-5]]); creating a project with "Je cherche" a collaborator ([[CS-1]]) can seed a call.
- Validation: title/direction/deadline required; deadline must be in the future; genres from allowed set; sample image type/size limits.
- Authorization: any creator may post; only the owner may edit/close early; banned users ([[AD-6]]) cannot post.
- Side effects: optional notification to followers/matches when posted (out of scope); deadline scheduling job to flip status to closed.

## Dependencies
- [[MC-5]] — "Candidater" applies to a call; feeds `applicantCount`.
- [[CS-1]] — a project created with "Je cherche" a collaborator can seed a call.
- [[F-2]] — direction toggle reflects creator roles.
- [[F-5]] — (indirect) application/notification flows.

## Notes
- Explicit: board layout, self-role toggle, "Genre ▾", "＋ Poster un appel", card contents (directional eyebrow, title, chips, description, author, countdown/applicant count, "Candidater"), the post form fields, and that "Je cherche" in [[CS-1]] can seed a call.
- Inferred: auto-close job, owner-only edit, follower notification on post.
