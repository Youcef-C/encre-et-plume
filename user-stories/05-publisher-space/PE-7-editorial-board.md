# PE-7 — Editorial board "Rédaction"

**As a** Editorial staff member (maintainer), **I want** an internal editorial workspace, **so that** my house's editorial team can do its work inside the platform.

> Screen(s): "Rédaction" — role link `goRedaction` (prototype role link only; no frame) · Priority: Could · Fidelity: Inferred

## Frontend
- "Rédaction" entry (`goRedaction`) shown only to users with role `maintainer`.
- Minimal placeholder workspace — scope to be defined by designers. Likely candidates (unconfirmed): shared shortlist review, contract-pipeline visibility, contest entry triage.
- States: role-gated landing; "scope à définir" placeholder until designed.
- Empty/loading/error: standard guard message for non-maintainers; loading skeleton on the landing.
- Accessibility: link keyboard-reachable with a clear label "Rédaction".

## Backend
- Role-gated routes for `maintainer` (within an editor org). `403` for other roles.
- Endpoints: **TBD** — no concrete operations defined by the design yet.
- Entities: reuses EditorOrg membership ([[F-2]]); no new entity defined.
- Business rules / scope: **TBD** — designers must define the editorial-board scope before backend work.
- Authorization: `maintainer` role only; scoped to the user's org.
- Side effects: none defined yet.

## Dependencies
- [[F-2]] — provides the `maintainer` role.
- [[PE-1]] — same publisher-space context/org gating.

## Notes
- Inferred: only the `goRedaction` role link for `maintainer` exists in the prototype; there is no frame. Story is intentionally minimal — scope, screens, and endpoints must be defined by designers before implementation.
