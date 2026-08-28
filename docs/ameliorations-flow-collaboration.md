# Improving the Encre & Plume collaboration flow

Recommendations against the current implementation (CS-2 → CS-15), focused on the
editing/review surfaces. The Kanban itself is fine; most of what follows connects
pieces that already exist rather than adding new ones.

Priority order: **1+2 together** (same editor surface), then **3+4** (data-model fixes
that get more expensive as old rows accumulate), then **5+6** (review UX, independently
shippable), then **7** (small hygiene items).

---

## 1 · The handoff is the missing keystone — it makes CS-18 urgent

Today the scenario→drawing handoff is just a card dragged from Scénario to Nemu.
Nothing records *which* scenario version the artist is drawing against. The primitives
already exist: explicit snapshots, and corrections pinning `filedAgainstVersion`.
Extend the same idea to the card:

- Moving a card out of **Scénario** requires (or auto-creates) a scenario snapshot and
  stamps the card with `drawnAgainstVersion`.
- If the scenarist edits after handoff, the card side shows a quiet banner:
  *« Le scénario a changé depuis la passation »*. Clicking it opens a diff between the
  pinned version and head — which is exactly **CS-18**, reframed: not a comparison
  viewer for its own sake, but the *change request* surface. The artist acknowledges
  the diff, which re-pins the card to the new version.

Without this, the classic failure: the artist inks page 7, the scenarist quietly
rewrote case 3 last Tuesday, nobody notices until review. Highest-leverage change on
the list — it turns the existing version chain into a coordination mechanism instead
of mere history.

## 2 · Kill the explicit save; keep only the snapshot as the deliberate act

Current persistence UX has three tiers: live CRDT updates (already durable in
`ScenarioUpdate` rows), explicit « Enregistrer » (compaction + `contentJson`
projection), and explicit snapshot (version). In a real-time collaborative editor,
"save" is a lie — edits are already shared and already persisted. Worse, it trains
users to believe unsaved = private, which Yjs makes false.

- Compact in the background (debounced on idle, or every N updates), refreshing
  `contentJson` in the same transaction.
- Remove « Enregistrer » / `Ctrl+S`.
- One deliberate act remains — « Créer une version » — and it now carries all the
  ceremony, which is what you want once §1 makes snapshots meaningful.

## 3 · Fix comment anchor drift with Yjs relative positions

`ScenarioComment` stores ProseMirror absolute positions ("best-effort, they drift")
with the quote as fallback. Yjs has `Y.RelativePosition` precisely for this: anchors
encoded relative to the CRDT structure survive concurrent edits and remap
deterministically.

- Store the encoded relative position instead of (or alongside) the absolute
  `from`/`to`.
- Resolve to a live position on render.
- Keep `quote` as the human-readable fallback for truly deleted text.

Small change; stops `ScenarioComment` — and every `scenario` correction anchored
through it — from rotting.

## 4 · Make `caseRef` a real reference, not a string

The manga template already gives structured cases — the hard part is done — but
`caseRef` on corrections is free text, so the structure dies at the review boundary.

- Use a stable case identifier from the `PlancheDoc` projection.
- A drawing correction on a region can then link to the case it concerns; the review
  pane shows script text next to the annotated image (*« cette boîte concerne la
  case 4, qui dit : … »*).

This is also the foundation for the feature that will eventually sell the whole
structured editor — flowing dialogue from cases into lettering placeholders at
Encrage — but case-linked corrections alone justify it now.

## 5 · Close the correction verification loop

Currently the assignee (the artist fixing it) can mark their own correction `corrigé`,
and validation only checks that zero remain unresolved. The person who filed *« la
main de la case 3 est à l'envers »* never confirms the fix before the card
auto-advances to PROPRE. Two options, cheapest first:

1. **Soft verification** — keep three statuses, but notify the filer when the assignee
   marks `corrigé`, with before/after region crops inline and one-click reopen.
2. **Hard verification** — add an `a_verifier` status between `en_cours` and
   `corrige`, where only the filer (or leadership) can make the final transition.

Start with the notification version; add the status only if reopens actually happen.

## 6 · Upgrade the new-version moment into a triage mode

The most loaded moment in the flow: the artist uploads v5 against a page with six open
corrections. Today the reviewer gets side-by-side and a flat list. Instead, when a new
version lands on an asset with open corrections:

- Offer a walkthrough — one correction at a time, its region rendered on *both* panes
  (regions are normalized, so they transfer), with resolve / still-broken / reopen as
  the three keys.
- Add an onion-skin opacity slider on top of the existing side-by-side. That's not the
  pixel diff deliberately avoided — it's a perception aid, and artists will use it
  constantly.

## 7 · Two smaller things

**Hide the decorative `fusion` toggle.** A leader can currently grant a permission
that does nothing, which corrodes trust in the whole permission UI the moment someone
notices. Hide it from the UI until CS-19 ships; keep the constant.

**Gate VALIDÉ.** The one automatic, invariant-checked transition
(Corrections → PROPRE, zero unresolved) is the best-designed part of the flow — yet
Encrage → VALIDÉ, the terminal move that chapter progress counts, is an unchecked
drag. A symmetric rule (can't enter VALIDÉ with open corrections filed against the
current version) reuses machinery that already exists. That's the only Kanban-side
change worth making; the columns are fine, and resist per-stage review rounds until
real usage demands them.
