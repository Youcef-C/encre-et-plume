# DR-9 — Like / favorite a work or illustration

**As a** Reader, **I want** to like (♥) and save/favorite (★ / "＋ Ma liste") works and illustrations from anywhere, **so that** I can express appreciation and build my collection.

> Screen(s): Home "Accueil", "Œuvre", "Lecteur", "Galerie", illustration detail, "Ma liste & coups de cœur" · Priority: Must · Fidelity: Explicit

## Frontend
- **Cross-cutting toggle controls**: ♥ "j'aime" (like) and ★ favorite / "＋ Ma liste" (save), reused across home, work page, reader, gallery, illustration detail, and ma liste.
- **Optimistic UI**: state and visible counts update immediately on tap, reconciled with server response; revert on failure with an inline error.
- **States**: active/inactive toggle states; pending (debounced) state; anonymous users are prompted to sign in [[F-1]] instead of toggling; counts formatted consistently (e.g. "8,1k").
- **Accessibility**: toggle buttons expose `aria-pressed` and a clear label ("J'aime" / "Retirer le j'aime", "Ajouter à ma liste" / "Retirer de ma liste"); count changes announced politely; controls keyboard-operable.

## Backend
- **POST /reactions/like** and **DELETE /reactions/like** with body `{ targetType: "work"|"illustration"|"chapter", targetId }`.
- **POST /reactions/save** and **DELETE /reactions/save** with the same shape (save = favorite / watchlist add).
- **Response**: `{ active: boolean, count: number }` for the target.
- **Entities**: Reaction (userId, targetType, targetId, kind ∈ {like, save}, createdAt); aggregate counters per target.
- **Business rules**: idempotent — repeating POST when already active is a no-op returning current state; DELETE when absent is a no-op; one reaction per (user, target, kind); aggregate counters feed rankings ([[DR-7]]) and stats ([[DR-1]], [[DR-3]]).
- **Validation**: `targetType` must be a known enum; `targetId` must exist.
- **Authorization**: auth required [[F-1]]; a user can only toggle their own reactions.
- **Side effects**: updates aggregate counters; `save` on a work adds it to the user's watchlist ([[DR-8]]).

## Shipped refinements (2026-07-05)
- On the œuvre page [[DR-3]] the ♥ « j'aime » toggle is **enlarged** (bigger heart glyph, ≥44px min tap target, bold border + hard offset shadow) and the « ＋ Ma liste » save toggle shows an **animated icon change** on toggle (＋ ↔ ✓ with a short pop, disabled under `prefers-reduced-motion`) (Request A).

## Dependencies
- [[F-1]] — auth required for all reactions.
- [[DR-8]] — save populates Ma liste; like populates Coups de cœur.
- [[DR-7]] / [[DR-1]] / [[DR-3]] — counters feed rankings and stats.

## Notes
- Explicit from prototype as a cross-cutting behavior. Idempotency and the unified `{targetType, targetId}` shape are the conventional inference for a shared toggle endpoint.
