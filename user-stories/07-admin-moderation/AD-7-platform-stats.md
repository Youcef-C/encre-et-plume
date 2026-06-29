# AD-7 — Platform stats

**As an** Admin, **I want** a dashboard of platform-wide metrics, **so that** I can monitor the health and growth of the platform at a glance.

> Screen(s): admin stats view (prototype tab `data-adminview=stats`, not drawn) · Priority: Could · Fidelity: Inferred

## Frontend
- Stats view within the admin console showing headline metrics (conservative set): total users, total works, total reads, active contests, and reports volume (e.g. open vs resolved).
- Presented as metric cards / simple counts; optional time-range selector (inferred).
- States:
  - Loading: skeleton cards while metrics load.
  - Empty: zero values render plainly (no special empty screen).
  - Error: toast / inline error if metrics fail to load.
- Accessibility: each metric exposes a label + value pair readable in order; cards are not color-only.

## Backend
- **GET /admin/stats** — returns platform-wide aggregates: `{ users, works, reads, contestsActive, reports: { open, resolved } }`.
- Read-only aggregation over existing entities (users, works, read events, contests, reports); no new write paths.
- Business rules: counts reflect current totals; figures are platform-wide, not per-user.
- Authorization: `admin` ([[F-2]]).
- Side effects: none.

## Dependencies
- [[AD-1]] — host console.
- [[F-2]] — authorization.

## Notes
- Inferred: entire story exists only as prototype tab CSS (`data-adminview=stats`) with no rendered frame; metric set kept deliberately conservative and may expand once designed.
