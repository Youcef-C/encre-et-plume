# DR-4 — Chapter reader "Lecteur"

**As a** Reader, **I want** an immersive reader for manga pages and prose chapters, **so that** I can read comfortably, switch chapters, and react without leaving the page.

> Screen(s): "Lecteur" · Priority: Must · Fidelity: Explicit

## Frontend

- **Immersive dark stage** with "✕ Quitter" and "⛶ Plein écran".
- **Plein écran (immersive) mode** (user-specified 2026-07-04): the manga/page stage fills ~95% of the viewport with the side asides ("Chapitres", "Réactions") and the topbar chrome hidden, leaving a minimal bottom control bar overlaid on the stage: the page counter + prev/next navigators (and slider), plus a compact control to **switch title from favorites** ("★ MES FAVORIS" quick-switch) and to **switch page/chapter**. Exiting fullscreen restores the full reader chrome. Works via the Fullscreen API on the stage; degrades gracefully if the API is unavailable (in-page maximized layout with the same minimal bottom bar). Reduced-motion respected; the bottom bar is keyboard-reachable. **The bottom control bar auto-hides after a few seconds (~2.5–3s) of no mouse movement** and re-reveals on pointer move / key press / touch (so the manga fills the screen uninterrupted while reading); it also stays visible while hovered or while a control in it has keyboard focus, and never hides in a way that traps keyboard users.
- **Topbar**: a back control that returns to the **current work's page** (`/oeuvre/<slug>`), NOT the catalogue (user-specified 2026-07-04 — overrides the prototype's "‹ Catalogue" link; label e.g. "‹ Retour à l'œuvre"); work + chapter dropdown including "★ MES FAVORIS" quick-switch; read-mode toggle "Pages"; spread toggle "1 page / 2 pages"; **"◳ Studio" = a clear-view toggle** (user-specified 2026-07-04) that **collapses both side asides ("Chapitres" + "Réactions") to give a bigger, distraction-free reading panel** (distinct from full immersive fullscreen — the topbar stays); toggling it again restores the asides.
- **Fixed page aspect ratio** (user-specified 2026-07-04): the reading stage forces a fixed page shape so pages never stretch to the container. **Manga** pages are constrained to a manga page ratio (~2:3 portrait; a 2-page spread is two such pages side by side); **roman** prose pages are constrained to **A4 ratio (1:√2 ≈ 1:1.414)**. Pages are centered within the stage with letterboxing around them, and **must render at a legible size — the page scales UP to fill the available stage height/width (whichever binds first) while keeping its ratio, and scales down to fit; it must never collapse to min-content**. Images use `object-fit: contain` so nothing is cropped or distorted. This holds in normal, clear-view, and fullscreen modes and across breakpoints. **The 2-page spread applies to BOTH manga and roman** (two page surfaces side by side); it collapses to a single page on narrow/mobile widths where two won't fit.
- **Left aside "Chapitres"**: chapter list with lock state — premium chapters show "verrouillé ★".
- **Center stage**: manga page panels (2-page spread when selected) OR prose pages for roman type.
- **Page navigation**: prev/next "‹ ›" + slider (1–40) with page label.
- **Reading direction** (user-specified 2026-07-09): **manga-style works read right-to-left by default** — pages advance RTL, the 2-page spread orders pages right-then-left, the slider fills RTL, and the arrow-key mapping inverts (**→ = page précédente, ← = page suivante**) so it matches how manga is read. The default is derived from `Work.format`: **`Manga` and `One-shot` → RTL; `Roman` (prose) → LTR**. A **reader toggle "⇄ Sens de lecture" (Gauche→Droite / Droite→Gauche)** lets the reader flip it, and the choice is **remembered per reader** (applied on next open). Accessibility: the toggle is labelled and announces the active direction; `aria-valuetext` on the slider stays "page N sur M" regardless of fill direction.
- **Right aside "Réactions"**: ♥ like + ★ favorite ([[DR-9]]); "Commentaires" list ([[PUB-2]]) + composer.
- **States**: image/page loading placeholders; locked-chapter state shows a paywall prompt linking to support/subscription ([[MR-1]]/[[MR-4]]); error/retry on page load; no webtoon mode; pages mode is paginated; **the "2 pages" spread toggle works for both manga and roman** (user-specified 2026-07-04 — no longer disabled for prose), auto-collapsing to a single page where two won't fit the width.
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

## Shipped refinements (2026-07-05)
- The immersive bottom control bar auto-hides after ~2.8s of idle and re-reveals on pointer move / key press / touch; it stays visible while hovered or while a control has keyboard focus.
- The « ◳ Studio » clear-view control ships labeled **« Vue dégagée »** (Studio icon) with `aria-pressed`; it collapses both asides for a distraction-free panel while the topbar stays (distinct from « Plein écran »).
- The site legal footer renders **dark** on the reader route (matching the ink stage) via `body:has([data-ep-reader])`.
- Narrow viewports are viewport-anchored: the « Chapitres » aside collapses behind a bar but « Réactions » stays **expanded** below the stage (a collapsed 32px bar read as the module disappearing on mobile).

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
