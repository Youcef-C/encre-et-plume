# F-7 — Global search

**As a** logged-in user, **I want** to search across works, illustrations, and creators from the header, **so that** I can quickly find content and people anywhere in the app.

> Screen(s): header "Rechercher…" field · scoped variants (Contacts, chat) · results page (not drawn) · Priority: Should · Fidelity: Explicit (control) / Inferred (results page)

## Frontend
- [ ] Header "Rechercher…" field (see [[F-4]]) searches works, illustrations, and creators.
- [ ] Scoped variants reuse the control with context-specific placeholders: Contacts "nom, rôle, genre, région…", chat search.
- [ ] Results presentation grouped by type: "Œuvres", "Créateur·rices", "Illustrations".
- [ ] States: empty query (idle / recent or suggestions), loading, no results ("Aucun résultat"), error.
- [ ] Accessibility: search field labelled, results as a navigable list, keyboard submit and result selection.

## Backend
- [ ] GET /search?q=&scope= — returns grouped results: { works[], creators[], illustrations[] }; optional `scope` narrows to one type (used by Contacts/chat variants).
- [ ] Response per item: id, type, title/name, thumbnail/avatar, slug/route.
- [ ] Business rules: matches against work titles/tags, creator names/specialties/tags, illustration titles; the catalog scope shares the same matching backbone as catalog filtering ([[DR-2]]).
- [ ] Validation: trim/min-length query; debounce client-side.
- [ ] Authorization: respects visibility (only published/public content surfaced to non-owners).

## Dependencies
- [[F-4]] — header hosts the search field.
- [[DR-2]] — catalog filtering shares matching logic / overlaps with work search.
- [[MC-1]] — Contacts directory scoped search; [[MC-9]] — chat search.

## Notes
- Explicit: the search control is present in the header and as scoped variants.
- Inferred: the results screen was not drawn — treat the grouped results page layout and the `/search` endpoint shape as inferred; designers must confirm whether results render as a dedicated page, a dropdown panel, or redirect into the catalog ([[DR-2]]).
