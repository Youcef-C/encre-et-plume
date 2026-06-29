# MC-1 — Partner directory "Trouver un·e partenaire"

**As a** Creator, **I want** to browse and filter portfolios of writers and illustrators, **so that** I can find a partner whose style and genre fit my project.

> Screen(s): "Trouver un·e partenaire" · Priority: Must · Fidelity: Explicit

## Frontend
- Page header: title "Trouver un·e partenaire" and subtitle "Scénaristes & dessinateur·rices — parcourez les portfolios ou laissez l'algorithme suggérer."
- Self-role toggle "Je suis :" with options "Dessinateur·rice" / "Scénariste" — sets viewer intent and biases default results (e.g. a writer sees illustrators first).
- Filter bar:
  - Role toggles "Dessinateur·rice" / "Scénariste" (filter the kind of partner shown; multi or single select).
  - Dropdowns "Genre ▾", "Région : Europe ▾" (default value "Europe"), "Dispo ▾" (availability).
- Results: responsive 3-column grid of partner cards. Each card shows: portfolio thumbnail strip (multiple work thumbs), avatar, name (e.g. "Théo M."), role + location line with icon (e.g. "🖌 Dessinateur · Lyon"), style/genre tag chips, and two buttons "Profil" (→ [[F-3]]) and "Proposer" (opens invite modal [[MC-3]]).
- Embedded "Appels à projets" preview block listing a few open calls ([[MC-4]]) with a "Voir tous les appels →" link to the full board.
- States: loading skeleton cards; empty state when no partner matches filters ("Aucun·e partenaire ne correspond à ces filtres."); error state with retry; pagination or infinite scroll for long result sets.
- Interactions: changing any filter or the self-role toggle refetches results; active filters are visually marked and clearable.
- Accessibility: toggles and dropdowns keyboard-operable with labels; cards are reachable as a list; thumbnail strip images have alt text; buttons "Profil"/"Proposer" have descriptive accessible names including the partner name.

## Backend
- `GET /partners` — paginated partner listings.
  - Query params: `role` (dessinateur·rice | scénariste), `genre`, `region` (default Europe), `availability`, `viewerRole` (self-role intent), `page`, `pageSize`.
  - Response: `{ items: [{ userId, name, avatarUrl, role, location, region, styleTags[], genreTags[], portfolioThumbs[], availability }], page, pageSize, total }`.
- Entities: User/Creator profile fields drawn from [[F-3]] — role, location/region, availability status, style & genre tags, portfolio sample asset references.
- Business rules: only users with a creator role ([[F-2]]) and a public profile appear; banned users ([[AD-6]]) excluded; default region filter "Europe"; results may be ordered to surface relevant partners for the viewer's self-role.
- Validation: reject unknown enum values for role/availability; clamp `pageSize` to a max.
- Authorization: readable by any authenticated creator; viewer's own card excluded from results.
- Side effects: none (read-only listing).

## Dependencies
- [[F-3]] — profile data, portfolio, and tags shown on cards and used for filtering.
- [[F-2]] — creator roles drive role filters and self-role toggle.
- [[MC-3]] — "Proposer" opens the collaboration invite modal.
- [[MC-4]] — embedded "Appels à projets" preview and "Voir tous les appels →".
- [[F-5]] — (indirect) actions taken from cards generate notifications.

## Notes
- Explicit: title, subtitle, filter bar, self-role toggle, card layout/contents, embedded calls preview, and the listing endpoint with role/genre/region/availability filters + pagination.
- Inferred: empty/loading/error copy and exact pagination mechanism (page vs infinite scroll).
