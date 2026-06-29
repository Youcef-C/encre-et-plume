# CS-9 — Publish scheduling & cadence

**As a** Creator, **I want** to publish now or schedule a chapter at a set cadence, **so that** releases go out on a predictable rhythm without manual effort.

> Screen(s): publication bar within "Réorganiser les pages" · Priority: Should · Fidelity: Explicit

## Frontend
- Publication bar (no standalone calendar screen):
  - Timing radios: "Maintenant" / "Programmée".
  - Date chip "📅 ven. 21 juin · 18:00" (date/time picker), shown when "Programmée" is selected.
  - "Rythme :" cadence dropdown, e.g. "1 chapitre / semaine ▾".
  - Split button "Publier ▾".
- States: "Maintenant" vs "Programmée" toggling (date chip enabled only when scheduled); publishing in progress; scheduled-confirmation state; error (invalid/past date, publish failure).
- Validation: scheduled date must be in the future; cadence required when scheduling a series.
- Accessibility: radios as a group; date picker keyboard-operable; cadence dropdown labelled "Rythme"; split button exposes its menu.

## Backend
- **PATCH /chapters/{id}/publish-settings** — `{ mode: "now"|"scheduled", scheduledAt?, cadence? }`.
- On "now": triggers publish immediately ([[PUB-1]]). On "scheduled": registers a job that publishes at `scheduledAt`, then schedules the next per `cadence`.
- Entity fields on **Chapter/Project**: `{ publishMode, scheduledAt, cadence }`.
- Business rules: validate `scheduledAt` is in the future; cadence drives recurring release scheduling; results surface in home "Sorties programmées".
- Authorization: project members with publish permission ([[CS-10]]).
- Side effects: scheduled job calls publish ([[PUB-1]]); notifications on release ([[F-5]]).

## Dependencies
- [[PUB-1]] — actual chapter publish.
- [[CS-6]] — scheduling lives in the arrangement bar.
- [[CS-10]] — publish permission.

## Notes
- Explicit: timing radios, date chip, cadence dropdown, split button; scheduling lives here (no separate calendar). "Sorties programmées" surfacing noted as cross-screen result.
