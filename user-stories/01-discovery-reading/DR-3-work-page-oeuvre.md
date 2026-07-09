# DR-3 — Work page "Œuvre"

**As a** Visitor, **I want** a detailed page for a work, **so that** I can read its synopsis, browse chapters and illustrations, see the creative team, and decide to read, save, or support it.

> Screen(s): "Œuvre" · Priority: Must · Fidelity: Explicit

## Frontend
- **Header**: back link "‹ Catalogue" (→ [[DR-2]]); cover; badges ("✓ Complet", genre, type); title.
- **Stat row**: "3,4k ♥ · 128k lectures · 340 ★ favoris · X/5 · N avis" (formatted counters).
- **Action buttons**: "Lire" (→ reader [[DR-4]]), "＋ Ma liste" (save, [[DR-8]]/[[DR-9]]), "★ Soutenir" ([[MR-1]]), "Proposer une collab" ([[MC-3]]), "↗ Partager" ([[PUB-5]]), "⚑ Signaler" ([[PUB-6]]).
- **Synopsis** + a tag row of the work's **genre + themes as clickable genre chips** (F-22) linking to the Découvrir genre facet; the freetext work hashtags are no longer displayed (they still feed the « Contenu mature » signal).
- **Prose excerpt block** (roman type only): "Extrait · Chapitre 1" with "Lire la suite →".
- **Chapter list**: rows (cover, "Ch. N — title", planche count + date, ♥, "Lire →"); collapsible "Voir les 12 chapitres ▾".
- **"Illustrations & planches"**: 3-col grid (→ illustration detail [[DR-6]]).
- **Reviews "Avis des lecteur·rices"** ([[PUB-3]]): aggregate X/5, Histoire/Dessin sub-scores, review list, and "Laisser un avis" form.
- **Sidebar "ÉQUIPE CRÉATIVE"**: members with role + city, each with "Suivre" ([[PUB-4]]). **Every creator is listed — no 2-name cap** (user-verified 2026-07-09): the sidebar already maps the full team; additionally, wherever a creator **byline** is shown (hero meta, cards), the names must be **derived from the full creators list**, not the denormalized 2-name `meta` string (a work with >2 authors must show them all, e.g. "A × B × C" or "A, B +2"), so the team is never misrepresented.
- **Sidebar "DÉTAILS"**: Type, Statut, chapter count, Public, Sortie.
- **Support card**: "à partir de 3 €/mois" ([[MR-1]]).
- **"Objectifs de financement"**: progress bars ([[MR-2]]).
- **Admin moderation bar** ([[AD-4]]) — visible to Admin only.
- **States**: loading skeleton; chapter list paginated/expandable with loading on expand; empty illustrations grid hidden; error state on missing work (404 view). Personal actions prompt sign-in [[F-1]] when anonymous.
- **Accessibility**: badges have text equivalents; action buttons labeled with icon+text; collapsible chapter list uses `aria-expanded`; progress bars expose value/max.

## Backend
- **GET /works/{id}** → work with stats (likeCount, readCount, favoriteCount, ratingAvg, reviewCount), synopsis, tags, type/format, status, audience, releaseDate, team members (id, name, role, city), funding goals.
- **GET /works/{id}/chapters?page=** → paginated chapters (id, number, title, plancheCount, publishedAt, likeCount).
- **GET /works/{id}/planches** → illustration/planche grid items.
- **Entities**: Work, Chapter, Planche/Illustration, CreatorMember, FundingGoal, Review (aggregate).
- **Business rules**: prose excerpt only for roman format; chapter list default collapses to a preview count; funding progress = pledged / goal.
- **Authorization**: public read. Moderation bar requires Admin [[AD-4]]. Personal actions require auth [[F-1]].
- **Side effects**: read count may increment on chapter open (see [[DR-4]]), not on work-page view.

## Shipped refinements (2026-07-05)
- The ♥ « j'aime » control is enlarged (bigger heart, ≥44px tap target, bold border + hard offset shadow) and drives a real like toggle; the « ＋ Ma liste » save toggle swaps its icon with a short pop animation (＋ ↔ ✓, label « Ma liste » ↔ « Dans ma liste »), disabled under reduced-motion (DR-9).
- When the viewer has DR-11 reading history for the work, a red **resume progress bar** renders under the CTA (« Ch. N · {Titre} — page X/Y ») and « Lire » becomes « Reprendre la lecture », deep-linking to the saved chapter + page.
- (F-22) the tag row under the synopsis is the work's genre + themes as clickable genre chips linking to the Découvrir facet; freetext hashtags are dropped from display but still feed the « Contenu mature » badge.

## Dependencies
- [[DR-2]] — back to catalog.
- [[DR-4]] — "Lire".
- [[DR-6]] — illustrations grid.
- [[DR-8]] / [[DR-9]] — "＋ Ma liste".
- [[PUB-3]] — reviews. [[PUB-4]] — follow team. [[PUB-5]] — share. [[PUB-6]] — report.
- [[MR-1]] — support. [[MR-2]] — funding goals.
- [[MC-3]] — collab proposal.
- [[AD-4]] — admin moderation.

## Notes
- Explicit from prototype. Whether read count increments on work-page view vs chapter open is inferred (attributed to reader open).
