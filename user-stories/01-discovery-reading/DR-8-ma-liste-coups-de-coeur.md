# DR-8 — "Ma liste & coups de cœur"

**As a** Reader, **I want** a personal view of my saved works and likes with reading progress, **so that** I can resume reading and manage my collection.

> Screen(s): "Ma liste & coups de cœur" (route `/ma-liste`) · Priority: Must · Fidelity: Explicit

## Frontend
- **Two tabs with counts**: "Ma liste · 4" and "Coups de cœur · 6".
- **"À lire" (Ma liste tab)**: 3-col grid; each card has a "✕" remove badge and a reading-progress bar — "reprendre Ch.5" at 60% when started, "pas commencé" otherwise. Card click opens the work and resumes at the saved chapter ([[DR-4]]).
- **"Likés ♡" (Coups de cœur tab)**: grid with ♥ badge and genre. Card click opens the work [[DR-3]].
- **States**: requires sign-in — anonymous users see a sign-in prompt [[F-1]]; loading skeleton; empty state per tab ("Votre liste est vide"); error/retry. Remove "✕" updates optimistically with undo affordance.
- **Accessibility**: tabs use `role=tab`/`tabpanel` with counts in labels; progress bars expose value/max and a text equivalent; remove badge labeled (e.g. "Retirer de ma liste").

## Backend
- **GET /me/list** → saved works with per-user reading progress (work, savedAt, lastChapter, progressPercent).
- **GET /me/likes** → liked works/illustrations (target, genre, likedAt).
- **DELETE /me/list/{workId}** → remove from watchlist.
- **POST/DELETE like** toggle ([[DR-9]]).
- **GET/PUT /me/progress/{workId}** → read/store per-user reading progress (chapter + percent).
- **Entities**: WatchlistItem, Like, ReadingProgress (userId, workId, chapterNumber, percent, updatedAt).
- **Business rules**: progress written by the reader [[DR-4]]; "resume" targets `lastChapter`; tab counts reflect current list sizes.
- **Authorization**: all endpoints require auth and operate on the current user only [[F-1]].
- **Side effects**: remove deletes the watchlist item; like toggle adjusts aggregate counters.

## Shipped refinements (2026-07-05)
- Saved **illustrations** now appear in the « Ma liste » tab and liked illustrations in the « Coups de cœur » tab, under an « Illustrations » sub-heading below the works; each is **removable inline** (top-right ✕) with the same optimistic-remove + « Annuler » undo affordance as works, and the tab counts include them. Backed by `GET /me/illustrations/saved` · `GET /me/illustrations/liked` and `DELETE /reactions/save` · `DELETE /reactions/like` on `targetType: "illustration"` (Request A).

## Dependencies
- [[F-1]] — auth required.
- [[DR-9]] — like toggle and counters.
- [[DR-4]] — resume reading and progress source.
- [[DR-3]] — card opens work page.

## Notes
- Explicit from prototype, including counts, "reprendre Ch.5"/60%, "pas commencé", and remove badge.
