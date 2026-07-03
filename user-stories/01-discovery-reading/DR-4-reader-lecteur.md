# DR-4 — Chapter reader "Lecteur"

**As a** Reader, **I want** an immersive reader for manga pages and prose chapters, **so that** I can read comfortably, switch chapters, and react without leaving the page.

> Screen(s): "Lecteur" · Priority: Must · Fidelity: Explicit

## Frontend

- **Immersive dark stage** with "✕ Quitter" and "⛶ Plein écran".
- **Topbar**: "‹ Catalogue"; work + chapter dropdown including "★ MES FAVORIS" quick-switch; read-mode toggle "Pages"; spread toggle "1 page / 2 pages"; "◳ Studio".
- **Left aside "Chapitres"**: chapter list with lock state — premium chapters show "verrouillé ★".
- **Center stage**: manga page panels (2-page spread when selected) OR prose pages for roman type.
- **Page navigation**: prev/next "‹ ›" + slider (1–40) with page label.
- **Right aside "Réactions"**: ♥ like + ★ favorite ([[DR-9]]); "Commentaires" list ([[PUB-2]]) + composer.
- **States**: image/page loading placeholders; locked-chapter state shows a paywall prompt linking to support/subscription ([[MR-1]]/[[MR-4]]); error/retry on page load; no webtoon mode; pages mode is paginated; spread toggle disabled for prose.
- **Accessibility**: keyboard paging (arrow keys), slider operable by keyboard with `aria-valuetext` (e.g. "page 12 sur 40"); page images have alt text; fullscreen toggle labeled; reduced-motion respected for transitions; comments composer labeled.

## Backend

- **GET /works/{id}/chapters/{n}/pages** → page payload: manga image URLs (with spread metadata) or prose text blocks; total page count; readMode hint.
- **GET /works/{id}/chapters** → chapter list with `locked` flag and access reason (premium tier).
- **GET /me/favorites** → favorited works for the "★ MES FAVORIS" switcher (auth).
- **POST/DELETE like & favorite** for chapter/work ([[DR-9]]).
- **GET/POST /chapters/{id}/comments** → chapter comments ([[PUB-2]]).
- **Entities**: Chapter, Page (image or prose block), Comment, Reaction, AccessGrant/Subscription.
- **Business rules**: locked chapters gated by support tier ([[MR-1]]/[[MR-4]]); opening an accessible chapter increments read count; reading progress persisted per user/chapter (feeds [[DR-8]]).
- **Authorization**: public can read unlocked chapters; locked chapters require active support/subscription; like/favorite/comment require auth [[F-1]].
- **Side effects**: increments read count; updates per-user reading progress; emits reaction/comment events.

## Dependencies

- [[DR-3]] — entered from work page.
- [[DR-9]] — like/favorite.
- [[PUB-2]] — comments.
- [[MR-1]] / [[MR-4]] — locked premium chapters.
- [[DR-8]] — reading progress consumed by Ma liste.
- [[F-1]] — auth for reactions/comments and favorites switcher.
- [[F-10]] — chapter page images served via the media system / CDN (responsive variants; premium pages via signed URLs).

## Notes

- Explicit from prototype, including "verrouillé ★", read-mode and spread toggles, slider 1–40, and "◳ Studio" entry. [[MR-4]] referenced by design as subscription source though not in the global index — treat as the subscription/access concept under monetization.
- Do not add the webtoon mode/toggle.
