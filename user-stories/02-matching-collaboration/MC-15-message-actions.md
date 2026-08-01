# MC-15 — Message actions "Répondre · Modifier · Supprimer · J'aime"

**As a** member of any conversation, **I want** to reply to a specific message, edit or delete my own, and like a message, **so that** a busy thread stays readable and I can fix a typo without re-sending.

> Screen(s): every message surface — [[MC-9]]'s floating widget, [[MC-11]]'s salon dock, [[CS-8]]'s project Discussion tab · Priority: Should · Fidelity: **Inferred** (no drawn frame — extends the drawn bubbles; grade against the criteria)

## Why this story exists

[[CS-8]] shipped a per-bubble delete icon and the user replaced it (2026-08-02): a bubble should carry
**one** discreet entry point, not a growing row of icons. The same actions are wanted on **every**
conversation type, so they belong to the shared message layer ([[MC-9]]) rather than to any one screen.
Today `Message` has no reply pointer, no edit history and no reactions, and `MessagesService` exposes
only send + delete.

## Frontend

- **"…" menu**, on the **left** of the bubble, revealed **on hover** (and on keyboard focus — hover-only
  would make it unreachable). Opens a menu with:
  - **Répondre** — quote this specific message.
  - **Modifier** — own messages only.
  - **Supprimer** — own messages only, with a confirmation step. **Not offered in the salon**
    ([[MC-11]]) — see the surface matrix below.
- **Reply/quote**: the composer shows the quoted message (author + excerpt) with a way to cancel it; the
  sent bubble renders the quote above its own body, and clicking the quote scrolls to the original.
- **Edit**: the bubble becomes editable in place; once saved it carries a **« modifié »** mention next to
  the timestamp. Editing never changes the message's position in the thread.
- **Like by double-click**: double-clicking a bubble likes it; a **heart indicator on the left** shows the
  like. Clicking that heart again removes the like. The count is shown when more than one person liked.
- States: menu open/closed; edit in flight; edit failed (body restored, error shown); delete confirmation;
  optimistic like then reconciliation; a deleted message disappearing live for everyone in the thread.
- Validation: only the author may edit or delete; an edit obeys the same "non-empty body or attachment"
  rule as a send; a reply target must be a message in the same conversation.
- Accessibility: the "…" trigger is a real focusable button with an accessible name naming its message
  (hover is not the only path); the menu is a focus-trapped `menu` closing on Escape; the like control is
  a `role="switch"`-style toggle with its state and count announced; « modifié » is read, not colour-only;
  **double-click is never the only way to like** — the heart is directly clickable too.

### Per-surface matrix (user decision, 2026-08-02)

| Surface                          | Répondre | Modifier    | Supprimer   | J'aime |
| -------------------------------- | -------- | ----------- | ----------- | ------ |
| [[MC-9]] widget — DMs and groups | ✔        | ✔           | ✔           | ✔      |
| [[CS-8]] project Discussion      | ✔        | ✔           | ✔           | ✔      |
| [[MC-11]] salon « Le Comptoir »  | ✔        | **✘ never** | **✘ never** | ✔      |

**The salon carries no delete nor edit.** It is a public community room, not a private thread: letting an author
erase their own line after the room has read and replied to it rewrites a shared record and is a
harassment vector (say it, delete it, deny it). Removal in the salon is moderation's ([[AD-5]]), which
is accountable and logged. The menu simply omits the item there — it is **not** rendered-then-403'd,
and the server refuses a salon delete regardless of what the client sends.

## Backend

- **PATCH /messages/{id}** — edit `{ text }`. Author-only. Sets `editedAt`.
- **DELETE /messages/{id}** — author-only (shipped in [[CS-8]]; keep, and make its 404 uniform — it
  currently distinguishes "unknown" from "not yours" by wording).
- **POST /messages/{id}/like** / **DELETE /messages/{id}/like** — toggle the caller's like. Idempotent.
- **POST /conversations/{id}/messages** gains `replyToId?`.
- Entities: `Message { …, replyToId?, editedAt? }`; new `MessageLike { messageId, accountId, createdAt }`
  (composite PK — one like per person per message, so a double like is unrepresentable).
- Business rules: author-only edit/delete; **`DELETE /messages/{id}` refuses a message whose
  conversation is `type: 'salon'` (403), enforced server-side and not merely hidden in the UI**;
  `replyToId` must belong to the **same** conversation (else 400);
  deleting a message that others quoted leaves the quote showing « Message supprimé » rather than
  orphaning it; likes are visible to every participant.
- Authorization: participants only, through the existing `loadForMember` seam — no new gate. Editing and
  deleting are author-only on top of that.
- Realtime: `message:edited`, `message:deleted`, `message:liked` to the conversation's participants, so
  open widgets/panels update without a refetch.
- Side effects: an edit does **not** re-notify ([[F-5]]); a like does not notify (noise).

## Dependencies

- [[MC-9]] — the shared message layer, its routes, gateway and widget.
- [[MC-11]] — the salon dock draws the same bubbles.
- [[CS-8]] — the project Discussion panel; its per-bubble delete icon is replaced by this menu.
- [[AD-5]] — moderation delete stays separate from author delete, and is the ONLY way a salon message
  is removed.

## Notes

- Inferred: no prototype frame draws a message menu, a quote block, an edited marker or a like heart.
  Keep the manga-zine idiom — the menu is an on-brand popover (the `OnBrandSelect` listbox pattern), the
  heart is the existing `HeartIcon` from `icons.tsx`, never an emoji.
- **One implementation, three surfaces**: build the bubble's action layer as a shared component so the
  widget, the salon and the Discussion panel cannot drift. That is the whole point of the story.
- Deliberately excluded: emoji reaction pickers beyond the single like, threaded sub-conversations
  (a reply is a quote, not a branch), and edit history (only the fact of an edit is kept).
