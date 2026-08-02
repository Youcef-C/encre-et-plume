# MR-5 — Revenue dashboard "Revenus"

**As a** Creator, **I want** a "Revenus" dashboard summarizing my monthly part, projects, per-tier breakdown, trend, and recent activity, **so that** I can understand where my income comes from and how it's evolving across the projects I co-create.

> Screen(s): "Revenus" · tabs "Aperçu · Ma page de soutien · Dons · Versements" · Priority: Must · Fidelity: Explicit

## Frontend
- [ ] Header "Revenus" with summary line: "3 projets · 154 abonné·es · ma part X €/mois · prochain versement le 1 juil."
- [ ] Header actions: "↗ Ma page publique" (opens public support page) and "Gérer un projet →".
- [ ] Tab bar: "Aperçu", "Ma page de soutien", "Dons" ([[MR-3]]), "Versements" ([[MR-6]]).
- [ ] APERÇU — 4 stat cards: "Ma part mensuelle", "Ce mois-ci", "Abonné·es" (e.g. "154 +11"), "Brut des projets".
- [ ] "Mes projets · revenus & parts" table: columns "Projet", "Rôle", "Abonnés", "Brut/mois", "Ma part", "=/mois", plus a Total row.
- [ ] Bar chart "Ma part mensuelle" over 8 months with "+132 % sur l'année" annotation.
- [ ] "Par palier" breakdown (revenue/subscribers per tier).
- [ ] "Activité récente" feed: new subscription, donation, tier upgrade, cancellation entries with actor, type, amount, time.
- [ ] "Ma page de soutien" tab: the creator's profile-scoped tiers ([[MR-1]]) and goals ([[MR-2]]) editor.
- [ ] States: data loaded, empty (no projects / no revenue yet), loading skeletons for cards/chart/feed, error.
- [ ] Accessibility: stat cards labelled; chart has a text/table alternative; activity feed is a semantic list; "+11"/"+132 %" deltas announced with direction.

## Backend
- [ ] GET /revenue/overview — { mrr (ma part mensuelle), thisMonth, subscribers (count + delta), grossProjects, nextPayoutDate }.
- [ ] GET /revenue/projects — per-project rows { projectId, name, role, subscriberCount, grossMonthly, myShareRatio, myMonthly } + totals; myShareRatio/myMonthly derived from the project's revenue split ([[CS-10]]).
- [ ] GET /revenue/trend?months=8 — monthly "ma part" series + year-over-year change.
- [ ] GET /revenue/by-tier — revenue and subscriber counts grouped by tier.
- [ ] GET /revenue/activity — recent events { type: new_sub|donation|tier_upgrade|cancellation, actor, amount, createdAt }.
- [ ] Entities: read-models aggregating Subscription ([[MR-1]]/[[MR-4]]) and Donation ([[MR-3]]); project share from RevenueSplit ([[CS-10]]).
- [ ] Business rules: gross is the project's total monthly recurring + donations; "ma part" applies the co-author split ratio from [[CS-10]] **as it stood WHEN each amount was earned, never the current one** — [[CS-10]]'s non-retroactivity rule (2026-08-02). Each earning carries the split VERSION it was earned under; applying today's ratio to accumulated gross is exactly the abuse that rule exists to stop, and it would silently restate history the moment a split changes; "prochain versement" comes from the payout schedule ([[MR-6]]); deltas computed vs previous month/year.
- [ ] Validation/authorization: a creator sees only revenue for projects/profile they own or co-author; share figures must reconcile with [[CS-10]] (sum of co-author shares = 100 %).
- [ ] Side effects: none (read-only reporting).

## Dependencies
- [[CS-10]] — co-author revenue split drives "Ma part" per project, **versioned and non-retroactive**: read the version each amount was earned under, not the live one.
- [[MR-1]] / [[MR-2]] — "Ma page de soutien" tab edits profile-scoped tiers & goals.
- [[MR-3]] — "Dons" tab.
- [[MR-4]] — subscriber counts and per-tier data.
- [[MR-6]] — "Versements" tab and "prochain versement".

## Notes
- Explicit: header summary, the four tabs, four stat cards, "Mes projets · revenus & parts" table columns, the 8-month "Ma part mensuelle" chart with "+132 % sur l'année", "Par palier", and "Activité récente" are all in the prototype.
- Inferred: exact aggregation windows and how gross is composed (subscriptions ± donations) need designer confirmation.
