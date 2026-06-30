# MR-3 — Donations & thank-you "Dons"

**As a** Reader/Supporter, **I want** to send a one-off donation with an optional message — and as a Creator to see my donations and thank donors — **so that** I can support a creator without committing to a subscription and feel acknowledged for it.

> Screen(s): reader donate action · "Revenus" → "Dons" tab · Priority: Should · Fidelity: Explicit

## Frontend
- [ ] Reader side: a donate action (one-off) with amount input and an optional message field; confirm → payment step (PSP); success confirmation.
- [ ] Visitor: donate prompts sign-in ([[F-1]]) before payment (or designer-confirm guest donations).
- [ ] Creator side "Dons" tab — stat cards: "Dons ce mois" (e.g. "168 €"), "Nombre" (e.g. "14"), "Don moyen" (e.g. "12 €"), "Plus gros" (e.g. "50 €").
- [ ] "Derniers dons" list: donor avatar, name, relative time, amount, message, and a "Remercier" action.
- [ ] "Remercier" opens a message composer to the donor ([[MC-9]]); after thanking, show a thanked/acknowledged state.
- [ ] States: list with donations, empty ("Aucun don pour l'instant"), loading, payment error/cancelled, thank-you send error.
- [ ] Validation: donation amount > 0 (and ≥ minimum, designer-confirm); message optional with a max length.
- [ ] Accessibility: stat cards labelled; donation rows keyboard-navigable; "Remercier" has an accessible label naming the donor.

## Backend
- [ ] POST /donations — { scope: creator|project, scopeId, amount, message? } → one-off charge; returns donation + PSP payment intent/redirect.
- [ ] GET /donations?scope=&id= — owner's donations list + aggregates (thisMonthTotal, count, average, largest).
- [ ] POST /donations/{id}/thank — sends a thank-you message to the donor ([[MC-9]]); marks the donation thanked.
- [ ] Entity Donation { id, donorId, scope, scopeId, amount, message, createdAt, thankedAt, status }.
- [ ] Business rules: one-off (non-recurring); counts toward revenue ([[MR-5]]) and payout balance ([[MR-6]]); aggregates computed over the current calendar month.
- [ ] Validation: amount > 0; thank allowed once per donation; only completed (paid) donations appear in lists/aggregates.
- [ ] Authorization: any authenticated user may donate; only the scope owner may view donations and thank donors.
- [ ] Side effects: PSP charge; notification to creator on new donation; "Remercier" creates a conversation/message ([[MC-9]]).
- [ ] Integration note: requires PSP for one-off charges and webhooks (succeeded/failed) — tech-agnostic.

## Dependencies
- [[MC-9]] — "Remercier" thank-you message.
- [[MR-5]] — donations feed the revenue dashboard ("Dons" is a Revenus tab).
- [[MR-6]] — donations add to payout balance.
- [[F-1]] — auth for donating.
- [[F-8]] — donation/Stripe webhook side-effects run through the job queue with idempotent, transactional handling.

## Notes
- Explicit: "Dons" tab, the four stat cards with sample values, "Derniers dons" list fields, and "Remercier" are in the prototype.
- Inferred: reader-side donate form details, minimum amount, and guest-donation policy.
