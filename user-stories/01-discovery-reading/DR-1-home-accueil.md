# DR-1 — Home "Accueil" showroom landing

**As a** Visitor, **I want** a curated showroom landing page, **so that** I can discover featured works, trending titles, top creators, and upcoming releases at a glance.

> Screen(s): "Accueil" · Priority: Must · Fidelity: Explicit

## Frontend
- **Hero carousel "À LA UNE"**: rotating featured works with prev/next arrows ("‹" "›"), pagination dots, per-slide title + meta, and two buttons: "Lire maintenant" (→ reader [[DR-4]]) and "＋ Ma liste" (save, [[DR-9]]/[[DR-8]]). Auto-advance with pause on hover; dots reflect active slide.
- **Announcement ribbon "ANNONCES"**: tagged items (Concours / À chaud / Événement), each linking to the related news feed [[PUB-8]] or contest [[PUB-7]].
- **"Populaires à chaud · cette semaine"**: grid of 4 ranked cards — rank badge, genre, ♥ count (formatted, e.g. "8,1k"), growth indicator (e.g. "↑ 24%"). Card → work page [[DR-3]].
- **"Top artiste du moment" + "Top scénariste du moment"**: creator cards → profile [[F-3]].
- **"Sorties programmées"**: 4 scheduled-release cards (date/time, chapter no., genre, countdown "dans N j") + "Calendrier →" link. Sourced from [[CS-9]].
- **Community CTA band** "Une histoire à raconter, un trait à poser ?" with "Trouver un·e partenaire" → contacts/partner finder [[MC-8]].
- **Sidebar "Populaire · Classement de tous les temps"**: ranked rows (rank, cover, title, meta) → ranking [[DR-7]].
- **States**: skeleton loaders per section; empty state per section if a feed returns nothing (hide or show muted placeholder); error state per section that degrades independently (one failed feed must not blank the page).
- **Accessibility**: carousel arrows and dots keyboard-operable with aria-labels; carousel announces slide changes politely; auto-advance respects `prefers-reduced-motion`; ♥ counts have accessible text; all cards are focusable links.

## Backend
- **GET /home/featured** → ordered list of featured works for the carousel (id, title, cover, meta, genre).
- **GET /home/trending-this-week** → top 4 works with rank, genre, like count, growth %.
- **GET /home/top-creators** → top artist and top scenarist (id, name, avatar, role).
- **GET /home/scheduled-releases** → upcoming releases (work, chapter no., genre, releaseAt) from [[CS-9]].
- **GET /home/ranking/all-time** → top-N all-time ranked works for sidebar (subset of [[DR-7]] data).
- **GET /home/announcements** → announcement items (type ∈ {concours, à chaud, événement}, label, link).
- **Entities**: Work, Chapter, Creator, Announcement, ScheduledRelease.
- **Business rules**: trending computed over rolling 7-day window of like/read deltas; growth % vs prior period; ordering deterministic with stable tiebreak.
- **Authorization**: public (no auth). Personal buttons ("＋ Ma liste") require auth and prompt sign-in [[F-1]] when anonymous.
- **Side effects**: none (read-only aggregation; may be cached).

## Dependencies
- [[DR-3]] — trending/sidebar cards link to work pages.
- [[DR-4]] — "Lire maintenant".
- [[DR-7]] — ranking sidebar.
- [[DR-9]] / [[DR-8]] — "＋ Ma liste".
- [[CS-9]] — scheduled releases source.
- [[PUB-8]] / [[PUB-7]] — announcements link targets.
- [[MC-8]] — partner finder CTA.
- [[F-3]] — creator profiles.

## Notes
- Explicit from prototype. Counter formatting ("8,1k") and growth arrows are explicit. Caching strategy and exact trending window are inferred.
