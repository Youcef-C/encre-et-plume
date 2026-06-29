# PE-5 — Trends "Tendances"

**As a** Publisher/Editor, **I want** a dashboard of rising genres and accelerating titles, **so that** I can spot momentum early and scout ahead of the market.

> Screen(s): "Tendances" — editor-hub tab (prototype tab CSS only; not drawn) · Priority: Could · Fidelity: Inferred

## Frontend
- "Tendances" tab within the editor hub. Conservative scope: a list/chart of rising genres and accelerating titles, ordered by momentum.
- States: default ranked trends; time-window selector (e.g. 7 j / 30 j) if scoped in.
- Empty: "Pas encore assez de données pour dégager des tendances." Loading: skeleton cards/rows. Error: retry.
- Accessibility: trend deltas conveyed as text (e.g. "↑ 24%"), not color-only; charts have text alternatives.

## Backend
- `GET /editeur/trends` — trend analytics for editors: rising genres and accelerating works with momentum/acceleration metrics over a recent window.
- Response: { risingGenres: [{ genre, momentum }], acceleratingTitles: [{ workId, title, acceleration }] }.
- Entities: derived from audience/engagement time-series over Works ([[DR-3]]) and genre tags — no new persisted entity required if computed from existing snapshots.
- Business rules: scope deliberately conservative; reuse the same audience time-series that powers radar growth ([[PE-2]]).
- Authorization: verified editors only ([[PE-1]]).
- Side effects: none (read-only analytics).

## Dependencies
- [[PE-1]] — access gate.
- [[PE-2]] — shares the audience growth time-series.
- [[DR-3]] — works/genre data behind the analytics.

## Notes
- Inferred: only the editor-hub tab CSS exists in the prototype plus the pitch reference to real-time rising genres; the view is not drawn. Kept intentionally minimal; designers must define the exact metrics and visualization.
