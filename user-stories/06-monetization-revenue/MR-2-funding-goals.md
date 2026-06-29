# MR-2 — Funding goals "Objectifs de financement"

**As a** Creator, **I want** to set monthly funding goals with progress bars, **so that** supporters see what their contributions unlock and are motivated to help reach the next milestone.

> Screen(s): "Objectifs de financement" (work page [[DR-3]] & support config) · Priority: Should · Fidelity: Explicit

## Frontend
- [ ] "Objectifs de financement" section listing goal cards: title, description, a progress bar with percentage, and current/target in "€/mois" (e.g. "180 € / 300 € par mois").
- [ ] Read view (supporters, on the work/support page): goals with live progress %.
- [ ] Owner config view: per-goal "Modifier" and "✕" (delete) controls, plus "＋ Ajouter un objectif".
- [ ] Add/edit form: title, description, target monthly amount ("€/mois"); validate title required and target > 0.
- [ ] States: list with goals, empty ("Aucun objectif défini"), reached goal (progress ≥ 100 %, visual completed state), loading, save error.
- [ ] Accessibility: progress bar exposes value via `aria-valuenow`/`aria-valuemax`; percentage and current/target announced.

## Backend
- [ ] GET /support/goals?scope={project|profile}&id={id} — ordered goals with title, description, targetMonthly, currentMonthly, progressPct.
- [ ] POST /support/goals — { scope, scopeId, title, description, targetMonthly }.
- [ ] PATCH /support/goals/{id} — edit title/description/targetMonthly/order ("Modifier").
- [ ] DELETE /support/goals/{id} — remove ("✕").
- [ ] Entity Goal { id, scope, scopeId, title, description, targetMonthly, order }.
- [ ] Business rules: currentMonthly computed from the sum of active subscriptions' monthly amounts for the scope ([[MR-1]]); progressPct = min(100, current/target × 100).
- [ ] Validation: title required; targetMonthly > 0.
- [ ] Authorization: anyone may read goals; only the scope owner may create/edit/delete.
- [ ] Side effects: reaching a goal may trigger a notification/celebration (designer-confirm).

## Dependencies
- [[MR-1]] — active subscriptions provide the current monthly amount.
- [[DR-3]] / [[F-3]] — goals shown on work page / support page.
- [[MR-5]] — goals appear in the "Ma page de soutien" tab.

## Notes
- Explicit: goal list with title/description, progress %, current/target "€/mois", "Modifier"/"✕"/"＋ Ajouter un objectif" are in the prototype.
- Inferred: goal-reached celebration/notification behavior.
