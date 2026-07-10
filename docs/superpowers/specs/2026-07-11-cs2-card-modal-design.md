# CS-2 extension — Card detail modal + richer kanban cards

Date: 2026-07-11 · Extends the shipped CS-2 "Espace projet" (kanban). Built through the
`/build-story CS-2` pipeline against the updated user story.

## Goal

Clicking a kanban card opens a **card detail modal** (an improved replica of the prototype's
`[data-card-modal]` "Nouvelle carte" panel, lines ~2597–2619). The modal keeps the prototype's
fields and adds **color labels (étiquettes), a deadline, a checklist, comments, and assignees**.
The mini cards on the board get a richer, Trello-style layout so this data is visible at a glance.

## Decisions (from brainstorming)

- **Labels**: user-created per project (name ≤30 + a color from a fixed on-brand palette). No presets.
  Members create/rename/recolor/delete them; deleting a label removes it from every card.
- **Assignees**: assign/unassign project members. On a save, **both newly-added and removed**
  assignees receive an F-5 notification (added = assigned, removed = unassigned).
- **Comments/checklist**: **refetch-on-open** (no websocket push). Comments are author-editable and
  author-deletable; the project owner may delete any comment.
- **Delete card**: already implemented (⋯ menu, member-gated). This pass fixes the menu z-index bug
  and adds click-outside-to-close.
- **Cards are not forced small** — bigger is fine where it improves ergonomics.
- **Build**: full `/build-story` pipeline after this spec + the US update.

## Data model (Prisma — all inside `ProjectsModule`)

- `ProjectLabel { id, projectId, name, color, createdAt }` — `color` validated against a fixed
  palette (`LABEL_COLORS`, ~9 on-brand tokens). `@@index([projectId])`.
- `Page` gains `description String?`, `dueDate DateTime?`.
- `PageLabel { pageId, labelId }` — join (`@@id([pageId, labelId])`), cascade on either delete.
- `PageAssignee { pageId, userId, assignedAt }` — join (`@@id([pageId, userId])`), cascade.
- `PageChecklistItem { id, pageId, text, done Boolean @default(false), order Int }`.
- `PageComment { id, pageId, authorId, body, createdAt, editedAt DateTime? }`.

## Endpoints (extend `ProjectsModule`; member-gated writes, non-member read per CS-1)

Labels palette:
- `GET  /projects/:slug/labels` — list.
- `POST /projects/:slug/labels` `{ name, color }` — create (color ∈ palette, else 400).
- `PATCH /labels/:id` `{ name?, color? }` — rename/recolor.
- `DELETE /labels/:id` — remove (cascades off cards).

Card detail:
- `GET /pages/:id` — full detail: `{ …page, description, dueDate, labels[], assignees[],
  checklist[], comments[] (author summary), linkedFiles[], versionSummary }`. The modal loads this.
- `PATCH /pages/:id` — extend to accept `description?, dueDate?, labelIds?, assigneeIds?` (plus the
  existing title/fileTags/linkedFileIds/chapterId). Diff `assigneeIds` → notify added **and** removed
  members via `NotificationsService.create({ type: 'project_activity' })`. Best-effort (swallow).

Checklist (nested under the card):
- `POST /pages/:id/checklist` `{ text }` — append (order = max+1).
- `PATCH /checklist/:itemId` `{ text?, done? }`.
- `DELETE /checklist/:itemId`.

Comments:
- `POST /pages/:id/comments` `{ body }` — author = session user.
- `PATCH /comments/:id` `{ body }` — **author only**; sets `editedAt`.
- `DELETE /comments/:id` — author **or project owner**.

Business rules: label `color ∈ LABEL_COLORS`; checklist/comment/label writes require project
membership; a card's labels/assignees must belong to the same project. Stage/version rules unchanged.

## Frontend

### Card detail modal (`CardModal`)
Opens on card click. On-brand modal (`3px solid var(--ink)`, hard offset shadow), scrollable
(`max-height:88vh`), usable at 375px. Sections:
- **Header**: editable title + ✕ (and a members-only Supprimer entry, same guard as the ⋯ menu).
- **COLONNE** (stage — OnBrandSelect), **TYPE DE PAGE** (Simple / ⇿ Double page), **FICHIERS LIÉS**
  (existing linked-file chips) — from the prototype.
- **DESCRIPTION** — textarea.
- **ÉTIQUETTES** — colored label chips; toggle to apply/remove; "＋" opens an inline label creator
  (name + palette swatches) and lets you rename/recolor/delete existing labels.
- **ÉCHÉANCE** — native `<input type="date">` in an on-brand frame; clearable.
- **CHECKLIST** — `OnBrandCheckbox` rows (toggle `done`), add row, delete row, a progress bar +
  `(done/total)` count.
- **ASSIGNÉ À** — project-member chips; toggle assign/unassign (fires the notification server-side).
- **COMMENTAIRES** — list (author avatar, name, relative time, body, "modifié" when edited) with
  edit/delete affordances per the rules; a composer textarea + "Commenter".

Simple fields (title, description, dueDate, labels) debounce-autosave with the Infos "Enregistré ✓"
pattern. Checklist / comment / assignee actions are immediate POST/PATCH/DELETE with optimistic UI +
revert on error. Modal reads `GET /pages/:id` on open (loading skeleton).

### Richer cards (`PageCard`)
Whole card is a button (opens the modal); drag + the ⋯ quick-menu (keyboard move/delete) stay.
Comfortable layout: **label color bars** on top → **title** + `⎘ vN` badge → file-type tags →
**meta footer**: due-date pill (accent/overdue styling when past due), **checklist `(x/x)`**, comment
count, assignee avatar stack. Empty of all extras it stays compact; it grows as data is added.

### Board filter by label
A label-filter chip row above the columns (auto-apply, no button, on-brand). Selecting labels filters
the visible cards to those carrying any selected label. Combines with the existing chapter chips.

### Menu z-index fix
Root cause: the ⋯ menu (`position:absolute; zIndex:20`) sits inside a card that establishes no raised
stacking context, so sibling cards later in the DOM paint over it. Fix: the card raises its own
stacking context while its menu/versions popover is open (`position:relative` + a high `zIndex`), and
the menu closes on outside click / Escape.

### Icons
Add SVG glyphs to `apps/web/components/icons.tsx`: tag/label, calendar, checklist, comment. No emojis
(the ✎/⚑ card glyphs already present stay as typographic placeholders per current CS-2).

## Notifications (F-5)

`PATCH /pages/:id` assignee diff → for each added member "Vous avez été assigné·e à «{card}»", for each
removed member "Vous avez été retiré·e de «{card}»", `type: project_activity`, actor excluded, swallow
failures (consistent with the stage→corrections wire).

## Out of scope (deferred, noted so QA/reviewer don't flag)

- Realtime websocket push for comments/checklist — intentional refetch-on-open per the product choice.
- Per-checklist-item due dates / assignment — low value, deferred.
- Comment threading / reactions.

## Test anchors (TDD)

- API: labels CRUD + palette validation; `GET /pages/:id` detail shape; `PATCH` assignee diff fires
  add+remove notifications; checklist CRUD + order; comment author-edit / owner-delete authz;
  membership gating on every write; non-member read per CS-1.
- Web (Vitest): CardModal renders all sections + autosave "Enregistré ✓"; checklist `(x/x)` count on
  the card; label create+apply; assignee toggle calls PATCH; comment add/edit/delete; the ⋯ menu z-index
  (open card raises stacking context) + click-outside close; label filter narrows the board.
- e2e: card click → modal → set label + deadline + checklist item + comment + assignee → reload →
  everything persists; delete a card via the menu; filter the board by a label. Breakpoints 375/768/1280.

## US update

`user-stories/03-creation-studio/CS-2-project-workspace.md` gains: the card-modal + labels/deadline/
checklist/comments/assignees in the TABLEAU FE section, the new entities/endpoints in Backend, new
acceptance criteria, and a Notes entry flagging this as an **induced extension** (Explicit prototype
modal as the base + Inferred additions) with the assignee-notification and the menu z-index fix — so
QA and the reviewer grade against it, not the raw prototype.
