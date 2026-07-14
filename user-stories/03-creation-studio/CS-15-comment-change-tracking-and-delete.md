# CS-15 — Comment change-tracking & delete "Suivi et suppression des commentaires"

**As a** co-author, **I want** an anchored comment to keep the text it originally referred to (and show me when that text has since changed) and to be able to delete my own comments, **so that** a highlighted comment stays meaningful as the script is edited and the sidebar doesn't fill up with stale notes.

> Screen(s): "Éditeur" right sidebar ([[CS-4]]) · Priority: Should · Fidelity: **Inferred** (no drawn frame — a behaviour/lifecycle refinement of the CS-4 comment sidebar; grade against the criteria)

## Context
[[CS-4]] item 5 anchors a comment to a **selected text range** (`anchorFrom`/`anchorTo` + the durable `quote` snapshot) and paints an inline highlight. The highlight is now anchored with **Yjs relative positions** (bind to a CRDT item, so it neither drops on a collaborator's edit nor grows to swallow the doc — the reload/whole-doc-highlight bugs are fixed). Two gaps remain: (1) when the commented text is **edited**, the sidebar still shows only the original `quote`, so a reader can't tell the area has changed; (2) there is **no way to delete** a scenario comment. This story adds a **lightweight** change indicator (reusing the already-stored `quote` as the "before" and the live highlight as the "after" — **no comment-versioning tables**, that is out of scope / YAGNI) and an **author-only** delete.

## Frontend
- **Highlight extends on inside edits** (Docs-like): typing **inside** a commented range grows the live highlight to cover the inserted text (so the highlight tracks the evolving area); typing immediately **before/after** the range stays outside it. Implemented via the relative-position anchor bias in `comment-highlight.ts` — decoration only, never serialized. Deleting all the commented text collapses the highlight (the comment remains in the sidebar as its `quote` is the durable record).
- **"Modifié" before/after indicator**: the sidebar comment always shows the original quote « … » (the text as it was when commented). When the **current** text under the live anchor **differs** from `quote`, show a subtle **"· modifié"** marker and the current text (e.g. a second muted line "maintenant : « … »"). When the text is unchanged, show only the quote (no marker). Comparison is trimmed/whitespace-tolerant. Case-level comments (no anchor) show neither.
- **Delete a comment** (author-only): each sidebar comment the current user **authored** shows a small **trash icon** (from the shared icon set — never an emoji; add one to `components/icons.tsx` if missing), labelled for a11y ("Supprimer le commentaire"). Activating it opens the existing `ConfirmDialog` ("Supprimer ce commentaire ?"); on confirm the comment is removed **optimistically** and the DELETE is sent. Comments the user did **not** author show **no** delete affordance. A failed delete restores the comment + surfaces a toast.
- **Live removal**: when a peer deletes their comment, it disappears from every connected editor's sidebar (and its highlight clears) without a reload, via the `/editor` WS.
- States: delete in-flight (disabled trash), delete error (restore + toast), an anchored comment whose text was fully deleted (highlight gone, comment still listed with its quote + "· modifié").
- Accessibility: the trash button is keyboard-operable and labelled with intent; the "modifié" marker reads as text, not colour-only.

## Backend
- **DELETE /pages/{id}/document/comments/{commentId}** — delete a `ScenarioComment`. **Author-only**: the requester must be `comment.authorId`, else **403** (not owner/maintainer — per the story decision). 404 if the comment doesn't exist / isn't on this page's document. Resolves the document like the other editor endpoints (member-gated to reach it at all). Idempotent-ish: deleting an already-deleted id → 404.
- **WS broadcast**: on a successful delete, emit a `comment:deleted` event ( `{ id }` ) on the document's `/editor` room (mirror the existing `emitComment` fan-out) so peers drop it live.
- No schema change: `ScenarioComment.quote` already stores the "before"; the "after" is derived client-side from the live doc — **no versioning table** is added.
- Authorization: reaching the document requires edit membership ([[CS-10]]); **deleting requires authorship**.

## Acceptance criteria
- Typing inside a highlighted range extends the highlight to include the new text; typing just outside it does not; both hold under live collaboration (two clients).
- The sidebar shows "· modifié" + the current text only when the anchored text differs from the stored `quote`; unchanged comments show just the quote.
- An author sees a trash icon on their own comments and can delete one (with confirm); it vanishes optimistically and stays gone after refetch.
- A non-author sees **no** delete affordance on someone else's comment; a forged `DELETE` by a non-author returns **403** and the comment persists.
- Deleting a comment in one client removes it (and its highlight) from another connected client live.

## Dependencies
- [[CS-4]] — the collaborative editor, the comment sidebar, `ScenarioComment` (`quote`/anchors), relative-position highlight anchoring, the `/editor` WS fan-out.
- [[CS-10]] — edit membership gates reaching the document.

## Notes
- **Lightweight by design (2026-07-14)**: the "change tracking" is the stored `quote` (before) vs. the live highlighted text (after) — **not** a comment-history/version table. Full per-edit audit trail is explicitly out of scope unless later requested.
- **Author-only delete (2026-07-14, user decision)**: only the comment's author may delete it (owner/maintainer moderation is out of scope for this story).
- Reuse: the existing `ConfirmDialog`, toast stack, `/editor` gateway, and `comment-highlight.ts` relative-position anchors — smallest correct diff.
