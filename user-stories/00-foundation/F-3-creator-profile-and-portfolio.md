# F-3 — Creator profile & portfolio

**As a** Creator, **I want** a public profile with my portfolio, affinity tags, and a "looking for" status, **so that** readers, collaborators, and editors can discover me and matching can pair me with the right partners.

> Screen(s): "Profil — artiste / scénariste" (route `/<slug>`) · Priority: Must · Fidelity: Explicit

## Frontend
- [ ] Cover banner + round avatar + name (e.g. "Yuki Moreau").
- [ ] Role line, e.g. "🖌 Dessinateur·rice · encre & screentone · Lyon, FR".
- [ ] Dashed-red status banner, e.g. "Cherche actuellement un·e scénariste — Seinen / Thriller, projet long".
- [ ] "Genres & affinités" selectable tag cloud: selected tags filled, unselected outlined, plus a "＋ Ajouter" control to add a custom tag. These tags feed matching ([[MC-2]]).
- [ ] Stats row, e.g. "1 240 abonnés · 3,4k J'aime · 12 œuvres · 48 soutiens".
- [ ] Profile tabs: "Portfolio" / "Œuvres publiées" / "À propos" / "Avis".
- [ ] Portfolio: 3-column image grid.
- [ ] Action buttons: "Suivre" ([[PUB-4]]), "＋ Se connecter" ([[MC-8]]), "★ Soutenir" ([[MR-1]]), "Proposer une collab" ([[MC-3]]).
- [ ] Owner vs visitor: owner can edit own tags and seeking-status (and bio/city/specialty); visitors see the public, read-only view with action buttons.
- [ ] States: empty portfolio ("Aucune œuvre pour l'instant"), loading grid, error; tag selection toggles instantly.
- [ ] Accessibility: tabs as a labelled tablist; tag toggles operable by keyboard; action buttons labelled.

## Backend
- [ ] GET /profiles/{slug} — returns profile by slug (name, avatar, cover, role line, specialty, city, seeking status, tags, aggregate counters, tabs data).
- [ ] PATCH /profiles/me — owner updates: tags, seeking { targetRole, genres, projectLength }, bio, city, specialty.
- [ ] GET /profiles/{slug}/portfolio — list portfolio items (image, caption, order).
- [ ] Entity Profile: accountId, slug, displayName, avatar, coverImage, specialty, city, roleLine, bio, seeking { targetRole, genres[], projectLength }, tags[].
- [ ] Aggregate counters: followers (abonnés), likes (J'aime), works (œuvres), supporters (soutiens) — derived/cached.
- [ ] Business rules: only the owner may PATCH their own profile; tags drive matching input for [[MC-2]].
- [ ] Validation: tag de-duplication; seeking.targetRole within known roles; non-empty custom tag.
- [ ] Authorization: read public; write owner-only.

## Dependencies
- [[F-1]] — profile keyed by account slug.
- [[MC-2]] — consumes "Genres & affinités" tags + seeking status.
- [[PUB-4]], [[MC-8]], [[MR-1]], [[MC-3]] — action buttons.
- [[DR-9]] — likes counter; [[DR-3]] — published works tab.
- [[F-10]] — avatar, cover banner, and portfolio images are stored/served via the media system (uploads + CDN).

## Notes
- Explicit: layout, tags, status banner, stats, tabs, portfolio grid, and action buttons all appear in the prototype.
- "Œuvres publiées" / "Avis" tab contents draw on published works and reviews owned by other epics ([[DR-3]], [[PUB-3]]); list them here but defer their detail to those stories.

## Amendment (bug fix 2026-07-10) — Profile save must not silently drop on a stale hidden field
- **Bug**: editing the profile (e.g. the "Type de création" creator role, [[MC-1]] §9) silently failed to persist for some users. Root cause: `handleSave` resubmitted the whole form including a **hidden, stale `seeking.targetRole`** whose legacy value (`'dessinateur'`) is invalid under the current `SEEKING_TARGET_ROLES` vocab, so the `PATCH /profiles/me` DTO rejected the **entire** request (400) and the client `catch` swallowed it. It correlated with "has an accepted application" only because partner-seekers both set a targetRole and tend to get accepted — coincidental, not causal.
- **Requirement**: the profile edit **only sends `seeking.targetRole` when seeking is active AND the value is a valid `SEEKING_TARGET_ROLES` entry** (otherwise `null`); a hidden/stale/invalid targetRole must never be resubmitted and must never block an unrelated field's save. `creatorRoles` (and every profile field) stays editable regardless of any application; the accepted application's own `Application.appliedAs` is independent and unchanged. Keep the strict server-side DTO validation. Grade against this.
