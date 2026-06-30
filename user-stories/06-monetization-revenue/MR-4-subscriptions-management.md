# MR-4 — Subscriptions management

**As a** Creator, **I want** to browse and segment my supporter roster — and as a Supporter to manage or cancel my own subscription — **so that** creators can understand and retain their supporters and supporters stay in control of their recurring payments.

> Screen(s): creator "Abonnés du projet" roster · supporter "Mes abonnements" · Priority: Should · Fidelity: Explicit

## Frontend
- [ ] Creator roster "Abonnés du projet": table with columns "Abonné·e", "Palier", "Depuis", "€/mois", "Message".
- [ ] Filter chips: "Tous", "Nouveaux", "Mécènes", "À risque"; sort by contribution ("€/mois").
- [ ] Per-tier distribution summary and retention metrics: "rétention 96,6 %", "churn 3,4 %".
- [ ] "À risque" subscribers visibly flagged (e.g. badge/row accent).
- [ ] Supporter side "Mes abonnements": list of own subscriptions (scope/work or creator, tier, "€/mois", "Depuis"); actions to change tier ([[MR-1]]) and "Annuler l'abonnement".
- [ ] Cancel flow: confirmation dialog explaining perks/access end at period end; cancelled state shown.
- [ ] States: roster with rows, filtered-empty ("Aucun abonné·e dans ce segment"), no-subscribers empty, loading, error; supporter empty ("Vous ne soutenez personne pour l'instant").
- [ ] Accessibility: table headers associated; filter chips as a toggle group; "À risque" flag has a text label, not color-only.

## Backend
- [ ] GET /subscribers?scope=&id=&filter={all|new|patrons|at_risk}&sort=contribution — owner's subscriber rows { supporter, tierName, since, monthlyAmount, message }.
- [ ] GET /subscribers/metrics?scope=&id= — per-tier distribution, retentionRate, churnRate.
- [ ] GET /me/subscriptions — supporter's own active/cancelled subscriptions.
- [ ] PATCH /subscriptions/{id} — change tier (upgrade/downgrade, [[MR-1]]).
- [ ] POST /subscriptions/{id}/cancel — cancel (effective at currentPeriodEnd).
- [ ] Entity Subscription { id, supporterId, scope, scopeId, tierId, status: active|cancelled|at_risk|past_due, startedAt, currentPeriodEnd, cancelledAt }.
- [ ] Business rules: cancellation keeps access until currentPeriodEnd then revokes perks/chapter unlocks; "Nouveaux" = started within a recent window (e.g. 30 days); "Mécènes" = the "Mécène"/higher tiers; "à risque" heuristic = failed last payment / declining engagement / pending cancellation (designer-confirm); retention/churn computed over a period.
- [ ] Validation: only the subscription owner may change/cancel their subscription; tier change validated against scope tiers.
- [ ] Authorization: roster + metrics visible only to the scope owner; "Mes abonnements" scoped to the authenticated supporter.
- [ ] Side effects: cancel schedules PSP cancellation at period end; tier change triggers PSP proration; status transitions update revenue ([[MR-5]]).

## Dependencies
- [[MR-1]] — tiers and subscription creation/upgrade.
- [[MR-5]] — subscriber counts and per-tier breakdown feed the dashboard.
- [[CS-10]] — co-author roles may scope who can view a project's roster.
- [[F-8]] — subscription lifecycle Stripe webhooks (renewal, cancel, payment-failed) run through the job queue with idempotent, transactional handling.

## Notes
- Explicit: roster columns, the four filters, sort by contribution, per-tier distribution, "rétention 96,6 % / churn 3,4 %", and supporter cancel are in the prototype.
- Inferred: precise "à risque" heuristic, "Nouveaux" window, and retention/churn calculation periods.
