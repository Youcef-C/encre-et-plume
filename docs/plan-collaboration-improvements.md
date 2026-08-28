# Plan — collaboration flow improvements

Turns `docs/ameliorations-flow-collaboration.md` into six runnable stories, plus one item that turns out
to already be a written story. Each item was traced against the code before planning; §2 below records
what that changed, because **three of the seven are substantially cheaper than the doc assumes** and one
recommendation is wrong as written.

Companion: `docs/collaboration-flow.md` (how the flow works today).

---

## 1 · The mapping

| Doc § | Story | Title | Priority | Size |
|---|---|---|---|---|
| §1 | **CS-20** | Scenario handoff pin | Must | M |
| §2 | **CS-21** | Background compaction | Should | M |
| §3 | **CS-22** | Durable comment anchors | Must | **S** |
| §4 | **CS-23** | Stable case references | Should | M |
| §5 | **CS-24** | Correction verification loop | Should | M |
| §6 | **CS-25** | New-version triage | Could | M |
| §7a | — | *hide the `fusion` toggle* | — | **see §3 — do not do this** |
| §7b | **CS-26** | Gate the VALIDÉ stage | Should | **S** |

---

## 2 · What the code changed about the plan

Four findings, each of which moves an item's cost or its position.

**§1 does not need CS-18 built — the comparison UI already exists.** `CompareVersionsModal.tsx` (shipped
in the CS-5 iter-5 pass) renders any two versions side by side on the A4 `VersionSheet`, with word- and
line-level diff annotation (`version-compare.ts` over `packages/shared/src/textdiff.ts`), synchronised
scrolling, and server-sanitized HTML. The doc frames §1 as "CS-18, reframed"; in fact CS-18's *comparison*
half is largely built and what remains of CS-18 is **version deletion**. So CS-20 is a pin, a banner and a
pre-set `from` — not a diff viewer. It drops from L to M.

**§3 is nearly free — the relative-position layer is written, tested and running.** CS-15 vendored and
adapted `absPosToRelPos` from `@tiptap/y-tiptap@3.0.6`, exposing the `assoc` parameter upstream hard-codes,
and resolves positions on every render (`comment-highlight.ts`). Its own header states the gap verbatim:
*« Decoration-only: nothing here is serialized — the DB `anchorFrom`/`anchorTo` are untouched. »* CS-22 is a
persistence change over working machinery, not an algorithm. It drops to **S** and moves to the front.

**§4's premise is confirmed and slightly worse than stated.** `caseBlock` carries `no: { default: 1 }` — a
renumbered display number — and *both* `Correction.caseRef` (free text) **and** `ScenarioComment.caseNo`
(positional `Int`) key off it. Two fields rot, not one.

**§7a is wrong as written, and the fix is already specified.** The doc says hide the decorative `fusion`
toggle. But **CS-19 already exists** as a written story, at priority **Must**, and it exists precisely
because the toggle advertises a promise in `GroupMembersCard.tsx` that nothing keeps: *« seuls les membres
avec le droit « Fusion » peuvent valider et intégrer une nouvelle version… »*. Hiding the control would
delete the only visible pressure to build the feature and leave the copy stranded. **Run CS-19 instead.**
Hide the toggle only if CS-19 is deliberately deferred past this whole set — and if so, hide the copy with
it, not just the switch.

One correction to the companion doc while I was in here: **the review screen is dessin-only** since the CS-5
r4 pass (`ReviewClient.tsx:238-240`). Scenario corrections are filed from the **editor**, as tagged
comments; the review screen lists them but renders no scenario surface. `docs/collaboration-flow.md` §5
implies otherwise and needs a one-paragraph fix.

---

## 3 · Sequence

Not the doc's order. Two changes, both earned by §2: the cheap data-model fix goes first, and the two
small items land before the medium ones so the set starts paying out immediately.

```
CS-22  durable comment anchors      S   ← first: cheapest, stops rot, no dependants
CS-26  gate the VALIDÉ stage        S   ← independent; reuses the validate invariant
   │
CS-20  scenario handoff pin         M   ← highest leverage; compare modal already exists
CS-21  background compaction        M   ← same editor surface as CS-20, lands after it
   │
CS-23  stable case references       M   ← data model; before more rows accumulate
CS-24  correction verification      M
   │
CS-25  new-version triage           M   ← last: pure UX over machinery CS-24 changes
```

**Why the reorder.** The doc pairs 1+2 first because they share the editor surface — still true, and
CS-20 → CS-21 stays adjacent. But §3 is an **S** that stops an active data-rot problem and blocks nothing,
so paying for it first is free. And §7b is an **S** that reuses an invariant already written. Starting with
two small independent items means the first two rounds land without touching the editor at all.

**Why CS-21 follows CS-20 and not the reverse.** CS-21 removes « Enregistrer », leaving « Créer une
version » as the only deliberate act. That is only a good trade once snapshots *mean* something — which is
what CS-20's pin gives them. Reversed, users lose an affordance before the replacement has weight.

**CS-19 runs on its own track.** It is a Must, it is already written, and it touches the version chain that
CS-20 pins against. Run it before CS-25 if it is going to run at all.

---

## 4 · Migrations

Four, all additive, none dropping a column:

| Story | Migration | Change |
|---|---|---|
| CS-22 | `add_scenario_comment_relative_anchors` | `ScenarioComment.anchorRelFrom/anchorRelTo Bytes?` |
| CS-20 | `add_page_handoff_pin` | `Page.drawnAgainstAssetId Uuid?` (FK, indexed) + `drawnAgainstVersion Int?` |
| CS-23 | `add_case_cid_references` | `Correction.caseCid String?` + `ScenarioComment.caseCid String?` |
| CS-24 | `add_correction_verification` | `Correction.resolvedById Uuid?` (FK, indexed) + `verifiedAt DateTime?` |

CS-21, CS-25 and CS-26 need none.

Repo rules that bind all four: **index every FK** (Postgres indexes none automatically, and
`SetNull`/`Cascade` both scan the child table on a parent delete); UUIDv7 in native `uuid` columns; no
back-fill that guesses (every new column is nullable and old rows keep the old path); and no session-scoped
Postgres state, since PgBouncer runs in transaction mode.

---

## 5 · Risks worth naming before the first round

**The CS-21 compaction race is the one real hazard in the set.** Compaction deletes the `ScenarioUpdate`
rows it just merged. An update arriving between the merge and the delete is lost silently — no error, no
test failure, a few characters gone. Today's button-triggered path gets away with a blanket
`deleteMany({ documentId })` only because a human presses it in a quiet moment; a debounced background
trigger fires *during* typing. The delete must be scoped to rows at or before the compacted state. This
belongs in the plan's §1 constraints, not discovered in review.

**CS-22's `assoc` biases are load-bearing, not cosmetic.** The vendored helper exists because upstream
hard-codes `assoc = -1` for every text position, which places an insert immediately *before* a highlight
*inside* it. Encoding with different biases than the decorations use would make the persisted anchor
disagree with the live one — and the disagreement only shows after a reload, which is exactly the case no
existing test covers.

**Import discipline:** `ySyncPluginKey` and the relative-position helpers must come from
`@tiptap/y-tiptap`, never the upstream `y-prosemirror` — both are installed, the `PluginKey` instances
differ, and `getState()` silently no-ops on the wrong one.

**The scenario-HTML sanitization invariant covers three of these stories.** Scenario content is
attacker-controlled: any project member can POST arbitrary version HTML. CS-20's compare panes, CS-23's
case excerpts and CS-25's list rows all render it. Every one must source from the review endpoint's
`sanitizeScenarioHtml` output — never live `editor.getHTML()`, never raw Yjs content into an `innerHTML`
sink.

**CS-26's version qualifier is a correctness decision, not a detail.** Blocking VALIDÉ on *any* open
correction makes the column unreachable for a long-lived page carrying a stale note against v2 of a file
now at v5. The rule must be "open against the **current** version".

---

## 6 · Running it

Each story is written to the repo's format and runs unchanged:

```
/build-story CS-22      # then CS-26, CS-20, CS-21, CS-23, CS-24, CS-25
```

Story files: `user-stories/03-creation-studio/CS-2{0..6}-*.md`. Indexed in that epic's `_epic.md` and in
`user-stories/README.md`.

Two follow-ups this plan does **not** cover, both deliberate: CS-18's remaining half (version **deletion**,
with the active-pointer repoint), and the lettering step CS-23 unlocks (flowing case dialogue into
placeholders at Encrage) — named in CS-23's notes as explicitly out of scope.
