# AD-8 — Article / news management (rédaction)

**As** Editorial staff (`maintainer`) or an **Admin**, **I want** to write, edit, and publish news articles with a proper rich editor, **so that** they surface on the "Actualités" page, the home "ANNONCES" ribbon, and the Découvrir "Actualités" column. **And as** a verified **Editor** (`editor`), **I want** to draft an article tied to a contest I run, **so that** the announcement goes out alongside my branded contest — subject to admin approval.

> Screen(s): "ARTICLE — ÉDITEUR (rédaction)" modal (`data-article-modal`) + "Actualités" / "Article" screens · Priority: Should · Fidelity: **Explicit** (the article editor, the feed, and the article page are all drawn in the prototype)

## Frontend
- **Entry points**: a "＋ Nouvel article" action in the admin console ([[AD-1]]) for staff; and, for a verified editor, a "Rédiger l'actualité du concours" action on their branded contest ([[PE-6]]).
- **Article editor** — replica of the prototype `ARTICLE — ÉDITEUR` modal (focus-trapped dialog):
  - **Titre** input.
  - **Catégorie** — on-brand select ([[F-20]] rule overrides the prototype's free-text input): `Concours` / `À chaud` / `Événement`.
  - **Corps de l'article** — a markdown body editor with the drawn toolbar: **Gras**, **Italique**, **Titre (H2)**, **Liste**, **Citation**, **Lien** (each wraps/inserts the markdown token), and a **live "APERÇU"** panel rendering the markdown as it's typed (sanitized).
  - Footer actions: **Annuler** / **Brouillon** (save draft) / **Publier** — the publish action is role-aware (see authorization).
- **Article list** (staff): rows with title, catégorie, statut (`Brouillon` / `En attente` / `Publié`), author, date; per-row edit / delete; a **"En attente d'approbation"** filter/queue surfacing editor-submitted drafts for admin review with **Approuver** / **Refuser (avec motif)** actions.
- **States**: empty ("Aucun article"); saving spinner (editor keeps content on failure); error toast; markdown preview updates live; 404 on a missing article id.
- **Accessibility**: editor is a labelled, focus-trapped dialog; toolbar buttons have `title`/`aria-label`; the preview is a live region; category select and actions labelled.

## Backend
- **GET /admin/articles** — staff list incl. drafts / pending / published (filter by status/category). Staff-only.
- **POST /admin/articles** — `{ title, category, body, contestId? }` → creates an article; **status depends on the author's role** (see below).
- **PATCH /admin/articles/{id}** — edit fields (author while `draft`/`pending`; staff any time).
- **POST /admin/articles/{id}/publish** — publish (staff), or **approve** an editor's pending article (admin).
- **POST /admin/articles/{id}/reject** — admin rejects a pending article with a motif (back to the editor as `draft`).
- **DELETE /admin/articles/{id}** — remove (author while unpublished; staff any time).
- **Entity `Article`**: `id, title, category (concours|a_chaud|evenement), body (markdown), excerpt (derived), status (draft|pending_review|published), authorId, contestId?, publishedAt?, reviewedById?, rejectionReason?, createdAt, updatedAt`.
- **Business rules**:
  - Only `published` articles appear in the public feed / resolve publicly ([[PUB-8]]); `category` drives the feed badge + home ribbon.
  - **maintainer / admin**: create + publish directly (`draft` → `published`).
  - **verified editor**: may create an article **only when linked to a contest they own** ([[PE-6]]); it lands in `pending_review` and **cannot self-publish** — an admin must **approve** (→ `published`) or **reject** (→ `draft`, with reason back to the editor). Editors never see other authors' articles.
  - Publishing may emit a follow-relevant news notification ([[F-5]]) and seeds the home "ANNONCES" ribbon ([[DR-1]]).
- **Validation**: `title`/`body` required, length-capped; `category` enum; markdown body sanitized on render (no raw HTML/script — XSS); `contestId` (when present) must belong to the requesting editor.
- **Authorization** ([[F-2]], server-side): list/create/edit/publish for `maintainer`/`admin`; a verified `editor` may create/edit/delete only their own contest-linked `draft`/`pending_review` article and may never publish; approve/reject is `admin`-only.
- **Audit**: create / publish / approve / reject / delete are written to the admin action log ([[AD-10]]).

## Dependencies
- [[PUB-8]] — the public "Actualités" feed + article page consume published articles.
- [[PE-6]] — a verified editor's branded contest is the only context in which they may author an article.
- [[AD-1]] — admin console hosts the list + editor; [[AD-10]] — action log.
- [[F-2]] — role gating (maintainer/admin/editor-verified); [[F-4]] — header "Actualités" link routes to the feed; [[F-5]] — optional news notification; [[F-20]] — on-brand category select.

## Notes
- **Fidelity correction (2026-07-05)**: the prototype DOES draw this — the `ARTICLE — ÉDITEUR (rédaction)` modal (`data-article-modal`: Titre, Catégorie, markdown toolbar B/I/H/list/quote/link, live APERÇU, Annuler/Brouillon/Publier), plus the `ACTUALITÉS` feed and `ARTICLE` screens. This story and [[PUB-8]] were previously marked "not drawn / Inferred" — that was wrong.
- The editor→admin-approval path is the new authoring lane requested 2026-07-05, layered on top of the drawn editor; the moderation queue reuses the [[AD-2]]-style review pattern.
