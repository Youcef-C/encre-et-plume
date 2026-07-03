# DR-11 — Reading history & resume "Reprendre la lecture"

**As a** Reader, **I want** the platform to remember where I stopped reading and let me resume in one click, **so that** the « Lire » button takes me straight back to the latest chapter I was reading instead of restarting from the beginning.

> Screen(s): work page "Œuvre" hero CTA (+ any surface reusing the primary « Lire » CTA) · Priority: Must · Fidelity: Inferred (user-specified 2026-07-04; not drawn in the prototype — reuse its button/bar tokens)

## Frontend
- [ ] For a signed-in reader **with history on a work**, the « Lire » button on the work page redirects to the **latest chapter consulted** (deep link `/lecteur/<slug>?chapitre=<n>`, resuming at the saved page), not chapter 1. Label becomes « Reprendre la lecture ».
- [ ] **Under the button, a red progress bar** (accent `#e8261c` on an ink track, design-system borders) shows how far into that chapter the reader is — i.e. visualizes the **pages remaining in the chapter** (e.g. 60% filled = 40% of pages left).
- [ ] The bar carries an **indicator with the chapter and the manga name**, e.g. « Ch. 4 · Lames de Brume — page 12/28 » (French copy; exact format may be tightened at build time but must include chapter, work title, and page position).
- [ ] No history or signed-out → unchanged behavior: « Lire » goes to chapter 1, no progress bar rendered.
- [ ] Progress reflects the DR-4 reader's saved position (updated as the reader turns pages); returning to the work page after reading shows the fresh position without a manual refresh (refetch on mount is enough).
- [ ] Accessibility: the progress bar is a `role="progressbar"` with `aria-valuemin/max/now` and an `aria-label` naming the chapter and work; the resume CTA keeps a descriptive accessible name.
- [ ] Responsive: bar + indicator lay out cleanly at 375/768/1280 under the CTA.

## Backend
- [ ] **GET /me/reading-history** — the signed-in account's reading positions, most-recent first, paginated: `{ workSlug, workTitle, chapterNumber, chapterTitle?, page, totalPages, updatedAt }` per entry. Powers this story's resume CTA and [[DR-8]]'s « Reprendre la lecture » list.
- [ ] **GET /me/reading-history/:workSlug** (or an equivalent single-work lookup the frontend can call from the work page) — the position for one work, 404/empty when none.
- [ ] Reuses the [[DR-4]] `ReadingProgress` model + `PUT /me/reading-progress` upsert (one row per account × work — latest chapter/page wins); extend the model only if `totalPages` isn't derivable at read time.
- [ ] Authorization: SessionGuard; strictly owner-scoped (401 anon; an account can never read another account's history).
- [ ] Business rules: progress on a premium/locked chapter the reader legitimately read remains resumable; deleted/unpublished works or chapters drop out of the history response gracefully (no 500s).

## Dependencies
- [[DR-4]] — the reader writes the progress this story reads; resume deep-links into the reader.
- [[DR-3]] — the « Lire » CTA on the work page hero is the surface being upgraded.
- [[DR-8]] — « Ma liste » consumes the same history endpoint for its resume section.
- [[F-1]] — signed-in account required.

## Notes
- Ponytail scope: no separate "history page" UI in this story (DR-8 owns list surfaces); no per-chapter completion tracking beyond page position; no cross-device conflict resolution beyond last-write-wins upsert.
