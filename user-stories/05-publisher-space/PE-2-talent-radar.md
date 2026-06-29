# PE-2 — Talent radar "Radar de talents"

**As a** Publisher/Editor, **I want** a ranked, filterable list of reader-validated talents with audience and growth metrics, **so that** I can scout creators worth signing.

> Screen(s): "Radar de talents" (route `/editeur/talents`) · Priority: Must · Fidelity: Explicit

## Frontend
- Filter bar with dropdowns: "Genre ▾", "Région : Europe ▾", "Dispo signature ▾", and a sort control "Trié par croissance ↑".
- Result rows, each showing: avatar, name, role chip ("🖌 Dessinateur" or "✒ Scénariste"), city, and metrics — number of "abonnés", growth "↑ 38% / 30 j", "3 œuvres complètes", and "compat. ligne édito. 91%".
- Per-row actions: "★ Shortlist" ([[PE-3]]) and "Proposer un contrat" ([[PE-4]]).
- States: default ranked list; filtered list; "★ Shortlist" toggled (filled star when already shortlisted).
- Empty: "Aucun talent ne correspond à ces filtres." Loading: row skeletons. Error: retry affordance, filters preserved.
- Validation: filter values constrained to allowed options; sort direction toggleable (↑/↓).
- Accessibility: role chips and the star toggle have accessible labels; growth metric announced as text not color-only; rows keyboard-navigable; each metric labeled (e.g. "abonnés", "compatibilité ligne éditoriale").

## Backend
- `GET /editeur/talents` — query params: `genre`, `region`, `dispoSignature`, `sort` (default `growth`), `order` (`asc`/`desc`), pagination.
- Response: ranked talents with { creatorId, name, avatar, role ("dessinateur"/"scenariste"), city, abonnes, growth30d (%), completedWorks, editorialCompatibility (%), shortlisted (bool for this editor) }.
- Entities: Creator (profile [[F-3]]); audience snapshots (follower counts over time); Work ([[DR-3]]) for completed-works count.
- Business rules:
  - Only creators already validated by readers appear.
  - Compute `growth30d` = audience growth over the trailing 30 days (specify inputs: follower/subscriber counts at t-30d and t-now).
  - Compute `editorialCompatibility` as a heuristic from the editor org's editorial line vs. the creator's genres/themes/style tags. **Formula left open** — inputs: creator genre/theme/style tags + the editor org's declared editorial-line tags; output 0–100%.
- Authorization: verified editors only ([[PE-1]]); `403` otherwise.
- Side effects: none (read-only).

## Dependencies
- [[PE-1]] — gates access to the radar.
- [[PE-3]] — "★ Shortlist" action.
- [[PE-4]] — "Proposer un contrat" action.
- [[F-3]] — creator profile data. [[DR-3]] — completed works count.

## Notes
- Explicit: filter labels, sort label, role chips, and all listed metric strings are in the prototype.
- Inferred: pagination, empty/error copy, and the editorial-compatibility formula (deliberately left open per the design).
