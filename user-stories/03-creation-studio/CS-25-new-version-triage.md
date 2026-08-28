# CS-25 — New-version triage "Passage en revue des corrections"

**As a** reviewer opening a page where a new drawing version just landed, **I want** to be walked through the open corrections one at a time against both versions, **so that** the most loaded moment in the flow isn't me eyeballing a flat list against two images.

> Screen(s): the [[CS-5]] review screen (`data-page="nemu"`) · Priority: Could · Fidelity: **Inferred** (extends a drawn screen; grade against the criteria)

## Why this story exists

The busiest moment in the whole flow: the artist uploads **v5** to a page carrying six open corrections.
What the reviewer gets today is a side-by-side `DessinSurface` and a flat `CorrectionList` — correct, and
entirely manual. They scan the list, find the box, look at both images, decide, scroll, repeat.

Everything a walkthrough needs already exists: regions are **normalized 0–1**, so the same rectangle
renders on both panes with no extra data; `filedAgainstVersion` already says which version each correction
was filed against; the two panes are already loaded.

## Frontend
- **Entry point**: when the selected `dessin` file's head is newer than the `filedAgainstVersion` of at
  least one open correction, the review header offers « Passer en revue (n) » (`.ep-btn-primary`). Nothing
  changes when there is nothing to triage — no empty mode, no dead button.
- **Walkthrough mode**: one correction at a time, its region drawn on **both** panes (old + new),
  everything else dimmed. Three actions, keyboard-first:
  | Key | Action | Effect |
  |---|---|---|
  | `C` / « Corrigé » | resolve | status → `corrigé`, stamps the resolving version |
  | `R` / « Toujours à revoir » | keep open | status → `a_corriger`, advances |
  | `E` / « En cours » | in progress | status → `en_cours`, advances |
  `←` / `→` move without deciding; `Esc` leaves the mode. Progress reads « 3 / 6 ».
- **Onion-skin slider** on the existing side-by-side: an opacity control that fades the new version over the
  old, in place. This is **not** the pixel diff that [[CS-5]] deliberately rejected — it is a perception aid
  over two unmodified images, and it is available outside walkthrough mode too.
- Leaving mode part-way keeps every decision already made. There is no batch submit and no draft state:
  each action is the existing `PATCH /corrections/{id}`, applied optimistically.
- States: no open corrections (no entry point); a correction whose region can't render (missing version
  image) → shown as a list row with its description, skipped in the crop view rather than blocking; the
  last correction decided → mode exits with a summary line.
- Accessibility: the mode is a labelled region with a live-region progress announcement; every keyboard
  shortcut has a visible button; the onion-skin slider is a native `range` with a text value. Focus returns
  to the entry button on exit.
- Breakpoints ~375 / ~768 / ~1280: under ~768px the two panes stack and the onion-skin slider becomes the
  primary comparison (stacked panes make side-by-side useless on a phone); the action row is a sticky
  bottom bar with ≥44px targets.

## Backend
- **No new endpoints and no schema change.** Walkthrough is a client mode over data the review payload
  already returns; every decision is the existing status route, already gated by « Corrections » +
  author-or-assignee.
- One additive convenience on `GET /pages/{id}/review`: each correction already carries
  `filedAgainstVersion`; expose the selected file's head so the FE can compute the triage count without a
  second call. Verify it isn't already present before adding it.

## Acceptance criteria
- The entry point appears only when a newer version exists **and** at least one correction is open against an older one; the count is correct.
- Walkthrough draws the current correction's region on both panes, at the same place, using the stored normalized coordinates.
- `C` / `R` / `E` each persist via the existing route and advance; `←`/`→` navigate without changing status; `Esc` exits keeping every decision.
- Decisions survive leaving and re-entering the mode (they are real writes, not local state).
- The onion-skin slider changes only opacity — both images are untouched, no canvas, no derivative, no pixel-diff computation.
- A member without « Corrections » can enter the walkthrough read-only and gets **403** on any decision.
- At ~375px the panes stack, the slider is usable, and the action bar targets are ≥44px.
- Screen-reader: entering the mode announces « Correction 1 sur 6 » and each advance re-announces.

## Dependencies
- [[CS-5]] — the review screen, `DessinSurface`, `CorrectionList`, the status route, normalized regions, `filedAgainstVersion`.
- [[CS-3]] — the version chain supplying both images.
- [[CS-24]] — lands first: reopen and the resolver stamp are decisions this mode issues at speed.
- [[CS-10]] — « Corrections » gates every decision.

## Notes
- **Explicitly still not a pixel diff.** [[CS-5]] rejected automated image diffing on purpose. An opacity
  slider is a viewing control, not an analysis; keep it that way, and do not let this story grow a
  difference-blend mode.
- **No batch submit.** Every action writes immediately. A "review session" object that must be committed
  would be a new entity, a new failure mode, and a lost-work story — for zero benefit over six PATCHes.
- Ship this **last** of the set: it is the only item that is purely UX polish over machinery the other
  stories are still changing. Building it before [[CS-24]] means building the walkthrough twice.
