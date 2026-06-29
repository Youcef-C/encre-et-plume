# F-4 — Global navigation header

**As a** logged-in user, **I want** a persistent header with primary navigation, search, and an avatar menu, **so that** I can move between the platform's main areas and reach my account actions from anywhere.

> Screen(s): persistent header across all pages · Priority: Must · Fidelity: Explicit

## Frontend
- [ ] Logo "Encre & Plume" (links to home).
- [ ] Primary nav links: "Accueil · Découvrir · Lire · Écrire · Projets · Messages"; active link underlined in red.
- [ ] "Rechercher…" field invoking global search ([[F-7]]).
- [ ] Round avatar opening a dropdown with: "Mon profil", "Likes & ma liste" ([[DR-8]]), "Notifications" with unread badge ([[F-5]]), "Mes candidatures" ([[MC-6]]), "Candidatures reçues" ([[MC-7]]), role-gated "Espace éditeur" / "Espace rédaction" / "Panneau admin" (see [[F-2]]), theme toggle ([[F-6]]), and logout ([[F-1]]).
- [ ] Some pages add a dark "＋ Poster" button (e.g. "Découvrir").
- [ ] Known routes: /decouvrir, /ma-liste, /tableau-de-bord, /contacts, /admin, /editeur/talents.
- [ ] States: badges show unread counts; gated links hidden by role; active route highlighted; dropdown open/closed.
- [ ] Accessibility: nav landmark, dropdown as a labelled menu, keyboard open/close and arrow navigation, visible focus.

## Backend
- [ ] No dedicated header endpoint; header consumes GET /auth/me (role, displayName, avatar, slug) and unread counts from [[F-5]].
- [ ] Business rules: role determines which gated links render ([[F-2]]); badge counts come from the notifications/unread service ([[F-5]]).
- [ ] Authorization: avatar menu only for authenticated users; gated entries follow role.

## Dependencies
- [[F-1]] — auth state + logout.
- [[F-2]] — role-gated links.
- [[F-5]] — notification badge counts.
- [[F-6]] — theme toggle.
- [[F-7]] — search field.
- [[DR-8]], [[MC-6]], [[MC-7]], [[PE-1]], [[PE-7]], [[AD-1]] — dropdown destinations.

## Notes
- Explicit: header, nav links, active-underline, search field, avatar dropdown entries, and the contextual "＋ Poster" button all appear in the prototype.
- Routes listed are those observed in the prototype; route names may differ between French slugs and internal labels.
