# AD-8 — Article / news management

**As an** Admin, **I want** to author and edit news articles and announcements, **so that** they surface in the news feed and the home ribbon to inform the community.

> Screen(s): article editor/modal (prototype `data-article-modal` / `data-artedit`, not drawn) · Priority: Could · Fidelity: Inferred

## Frontend
- Article list in the admin console with a "Nouvel article" action; per-row edit/delete.
- Article editor (modal, `data-article-modal` / `data-artedit`): fields for "Titre", body, type selector — "concours" / "à chaud" / "événement" — and a publish date/time ("Publier le", supports scheduling).
- Save publishes or schedules; scheduled articles appear once `publishAt` passes.
- States:
  - Empty: "Aucun article" in the list.
  - Loading: spinner on save; skeleton list.
  - Error: toast on save failure; editor keeps entered content.
- Validation: title and body required; type must be selected; `publishAt` must be valid (now or future for scheduling).
- Accessibility: editor is a focus-trapped dialog with labelled fields; type selector and date picker labelled.

## Backend
- **GET /admin/articles** — list articles (incl. drafts/scheduled).
- **POST /admin/articles** — `{ title, body, type, publishAt }`.
- **PATCH /admin/articles/{id}** — edit any field.
- **DELETE /admin/articles/{id}** — remove.
- Entity **Article**: `id, title, body, type (concours|a_chaud|evenement), status (draft|scheduled|published), publishAt, authorId, createdAt, updatedAt`.
- Business rules: published/scheduled-and-due articles feed the news feed ([[PUB-8]]) and home ribbon; `type` drives feed categorization.
- Validation: required `title`/`body`/`type`; `publishAt` valid; `type` enum.
- Authorization: `admin` ([[F-2]]).
- Side effects: publishing surfaces the article in the feed/ribbon; may emit a notification for follow-relevant news ([[F-5]]).

## Dependencies
- [[PUB-8]] — consumes published articles (feed + home ribbon).
- [[AD-1]] — host console.
- [[F-2]] — authorization; [[F-5]] — optional news notification.

## Notes
- Inferred: derived from prototype hooks (`data-article-modal` / `data-artedit`) with no rendered frame; the three `type` values mirror the feed categories used in [[PUB-8]].
