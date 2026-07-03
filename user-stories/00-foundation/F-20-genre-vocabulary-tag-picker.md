# F-20 — Genre vocabulary & tag picker

**As a** Creator, **I want** to pick my profile tags and my "recherche active" genres from the platform's shared genre vocabulary instead of typing free text, **so that** tags are consistent and typo-free across profiles and can reliably drive matching ([[MC-2]]), catalog facets ([[DR-2]]), and 18+ gating ([[DR-10]]).

> Screen(s): "Profil" owner edit — tag cloud "Genres & affinités" + form "Recherche active" (route `/<slug>`) · Priority: Must · Fidelity: Inferred (bug fix + vocabulary consolidation; the prototype draws chips, never free-text tag entry)

## Bug being fixed
On the profile edit form, the « Genres (séparés par virgule) » input is a controlled input whose value is `genres.join(', ')` and whose onChange immediately re-splits on commas and trims: every keystroke round-trips through normalization, so a trailing space or comma is deleted the instant it is typed — users cannot enter multi-word genres or separators at all. The « Nouveau tag… » input in the tag cloud shares the free-text weakness (any typo becomes a permanent tag).

## Frontend
- [ ] The genre vocabulary lives in `packages/shared/src/genres.json`: an array of `{ id, fr, en, mature }` where `id` is a unique kebab-case slug (e.g. `dark-fantasy`), `fr` the French display label, `en` the English label, `mature` a boolean feeding [[DR-10]]. Exported (typed) from `@encre-et-plume/shared` for both apps.
- [ ] "Genres & affinités" **＋ Ajouter** control no longer accepts free text: the input suggests genres from the vocabulary (native suggestion list or equivalent); only vocabulary genres can be added; input matching is case- and diacritics-insensitive on `fr` or `en`; the stored value is the canonical `fr` label; non-matching text is rejected (no tag created).
- [ ] "Recherche active" genres: the comma-separated text input is replaced by a chip picker — selected genres render as removable chips (remove control uses the shared SVG icon set, labelled « Retirer <genre> »), with the same vocabulary-backed suggestion input to add. Label becomes « Genres » (no longer « séparés par virgule »).
- [ ] Spaces and multi-word genres work everywhere (the round-trip bug is structurally gone — no join/split on render).
- [ ] Duplicate adds are a no-op (case-insensitive); adding clears the input; Escape cancels; Enter confirms a matching value; **blurring the input also commits** a matching value (unfocus = validate).
- [ ] Tag chips are **always filled accent red**; a tag is removed by clicking a **small ✕ on the right side of its chip** (SVG icon set) — no toggle/deselect state.
- [ ] The suggestion dropdown is a **custom, design-system-styled list** (ink borders, card background, hard offset shadow, accent hover) — not the browser-native datalist look. Keyboard: ↑/↓ navigate, Enter selects, Escape closes.
- [ ] Accessibility: suggestion inputs are labelled; chips removable by keyboard; toggle/remove controls keep `aria-pressed`/explicit labels.
- [ ] Existing UI behavior preserved: tag cloud still toggles selection instantly and persists via PATCH; visitor view unchanged.

## Backend
- [ ] PATCH /profiles/me validation: `tags[]` and `seeking.genres[]` only accept genres present in the shared vocabulary (case- and diacritics-insensitive match on `fr` or `en`), canonicalized to the `fr` label before persisting; unknown entries are dropped; de-duplication preserved.
- [ ] The same vocabulary module is the single source: no duplicated genre list in the API.
- [ ] Existing stored tags are not migrated (displayed as-is); only new writes are constrained.
- [ ] Authorization unchanged: owner-only writes.

## Dependencies
- [[F-3]] — the profile tag cloud and seeking form this story fixes.
- [[MC-2]] — matching consumes the now-consistent tags.
- [[DR-2]] — catalog facets reuse the same vocabulary (`id`s).
- [[DR-10]] — `mature` flag feeds 18+ gating.
- [[F-17]] — onboarding keeps its curated chip subset; it should remain a subset of this vocabulary.

## Notes
- The vocabulary file is user-owned data: extend it by editing `genres.json`; ids must stay stable once shipped (they become facet keys in [[DR-2]]).
- Conservative scope: no new endpoints; no tag rename/merge tooling; no admin vocabulary UI (defer until a story needs it).
