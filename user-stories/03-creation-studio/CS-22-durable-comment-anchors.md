# CS-22 — Durable comment anchors "Ancres persistantes"

**As a** co-author, **I want** an anchored comment to still point at the right words after the script has been edited and reloaded, **so that** the sidebar doesn't slowly fill with notes pointing at the wrong sentence.

> Screen(s): the [[CS-4]] editor right sidebar (no visual change) · Priority: **Must** · Fidelity: **Inferred** (a persistence fix behind a drawn screen; grade against the criteria)

## Why this story exists

`ScenarioComment` persists **absolute ProseMirror positions** — `anchorFrom` / `anchorTo` as plain `Int?`
(`schema.prisma:1241-1258`) — with `quote` as the human fallback. Absolute positions are indices into a
document that other people are concurrently rewriting: every insertion above a comment shifts it, and the
stored numbers are only correct until the next edit by anyone.

**The fix is already written and running — it is just not saved.** [[CS-15]] built the whole
relative-position layer in `comment-highlight.ts`:

- `absPosToRelPos()` — vendored and adapted from `@tiptap/y-tiptap@3.0.6`, exposing the `assoc` parameter
  the upstream helper hard-codes, so `from` right-associates and `to` left-associates (the Docs-like
  contract: an insert at a boundary stays outside, an insert strictly inside grows the range);
- `relativePositionToAbsolutePosition()` on render (`comment-highlight.ts:228`);
- `clampHighlightToBlock()` for the correction mis-tag bleed;
- `quoteChanged()` for the "· modifié" indicator.

Its own header records the gap, verbatim: *« Decoration-only: nothing here is serialized — the DB
`anchorFrom`/`anchorTo` are untouched. »* So the anchor survives the session and dies on reload, and every
`scenario` [[CS-5]] correction anchored through a comment rots with it.

This story serializes what already works. It is small, and it gets more expensive every day rows accumulate.

## Frontend
- **On create**: encode the selection's relative positions with the existing `absPosToRelPos` (same `assoc`
  biases) and send them alongside the absolute pair and the quote. No UI change, no new affordance.
- **On load**: prefer the stored relative positions; decode with `Y.decodeRelativePosition` and resolve via
  the existing render path. Fall back to the absolute pair when the relative one is absent (pre-migration
  rows) or fails to resolve, exactly as today.
- The « · modifié » indicator, the jump-to-text affordance, the correction highlight clamp and the
  author-only delete are **unchanged** — this story must be invisible to the user except that anchors stop
  drifting.
- States: legacy comment (no relative anchor) → today's behaviour; relative anchor that resolves to nothing
  (the text was deleted) → highlight collapses, comment stays listed with its quote, as [[CS-15]] specifies.

## Backend
- **Schema** — store the encoded positions as bytes, keep the old columns:
  ```prisma
  model ScenarioComment {
    anchorRelFrom Bytes? // Y.encodeRelativePosition output
    anchorRelTo   Bytes?
  }
  ```
  Migration `add_scenario_comment_relative_anchors`. **Additive only** — `anchorFrom`/`anchorTo` are not
  dropped: they are the fallback for existing rows and the debugging surface. No back-fill (the server
  cannot compute a relative position without the Y.Doc; old rows simply keep the old path).
- **POST /pages/{id}/cases/{caseNo}/comments** accepts the two optional byte fields, validated as opaque
  and length-capped (reject > 512 bytes — a relative position is tens of bytes; this is a trust boundary).
  The API never decodes them, exactly as it never decodes CRDT payloads.
- The same fields ride the `/editor` WS `comment` broadcast so a peer's editor anchors the new comment
  without a refetch.
- `Correction` needs no change — a `scenario` correction anchors *through* its `commentId` (1:1), so it
  inherits the durable anchor for free. Its own `anchor` JSON keeps the quote for display.

## Acceptance criteria
- Create an anchored comment, have a second client insert a paragraph **above** it, reload both: the highlight still covers the original words in both clients (today it shifts).
- Insert text **immediately before** the range → the highlight does not swallow it; type **inside** the range → the highlight grows. The [[CS-15]] contract is preserved across a reload, not only in-session.
- A pre-migration comment (no relative anchor) still renders via the absolute fallback, with no error and no console noise.
- Deleting all the anchored text collapses the highlight; the comment stays listed with its quote and « · modifié ».
- A `scenario` correction filed from such a comment highlights the same range after reload, with the block clamp still applied (no bleed into the neighbouring case field).
- The API rejects an over-long or non-binary anchor payload with **400** and never attempts to decode one.

## Dependencies
- [[CS-4]] — the comment sidebar, `ScenarioComment`, the `/editor` WS fan-out.
- [[CS-15]] — `comment-highlight.ts`: `absPosToRelPos`, the `assoc` biases, the clamp, `quoteChanged`. **Reuse these; do not re-derive them.**
- [[CS-5]] — `scenario` corrections anchored through a comment.

## Notes
- **Import discipline (this has bitten before):** TipTap v3's `Collaboration` binds via `@tiptap/y-tiptap`
  (its y-prosemirror fork). `ySyncPluginKey` and the relative-position helpers MUST come from
  `@tiptap/y-tiptap`, not from the upstream `y-prosemirror` — the upstream `PluginKey` is a different
  instance and `getState()` silently no-ops. Both packages are installed.
- **`assoc` is not cosmetic.** The vendored helper exists precisely because upstream hard-codes `assoc = -1`
  for every text position, which puts an insert immediately *before* a highlight *inside* it. Encode with
  the same biases the decorations use, or the persisted anchor will disagree with the live one.
- Prisma `Bytes` maps to `bytea`; these are small and never queried on, so they need no index.
- Out of scope: back-filling old rows, versioning comments, and moving `caseNo` off a positional number —
  that last one is [[CS-23]], the same class of bug one field over.
