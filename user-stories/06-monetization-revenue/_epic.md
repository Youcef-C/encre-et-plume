# Epic 06 — Monetization & Revenue

**Goal:** Let creators earn from their work and let readers support them — recurring subscription tiers ("Paliers & récompenses"), funding goals ("Objectifs de financement"), one-off donations ("Dons"), supporter/subscription management, a creator revenue dashboard ("Revenus"), and payouts ("Versements"). Support has two scopes: per-project and per-creator (profile). Subscribing unlocks perks and may gate premium chapters. Revenue is split across co-authors per the project's revenue-split rules. Every money path requires payment-provider integration (PSP — tech-agnostic here) and strict validation.

## Personas
- **Reader/Supporter** (mécène) — subscribes to tiers and sends one-off donations.
- **Creator** (writer/illustrator) — configures tiers/goals, views revenue, requests payouts.
- **Co-author** — shares revenue per the project split.
- **Visitor** — can view support pages but must authenticate to pay.

## Stories (ordered)
- MR-1 — Support a creator / work (subscription tiers)
- MR-2 — Funding goals "Objectifs de financement"
- MR-3 — Donations & thank-you "Dons"
- MR-4 — Subscriptions management
- MR-5 — Revenue dashboard "Revenus"
- MR-6 — Payouts "Versements"

## Key cross-epic dependencies
- [[CS-10]] — Permissions & revenue split: co-author shares drive per-project revenue allocation in MR-5/MR-6.
- [[DR-4]] / [[PUB-1]] — Reader & publish chapter: tier subscriptions unlock premium/locked chapters.
- [[DR-3]] — Work page hosts "★ Soutenir", tiers, and goals.
- [[F-3]] — Creator profile hosts per-creator support and "Ma page de soutien".
- [[MC-9]] — Messaging powers the donation "Remercier" thank-you flow.
- [[F-1]] — Account/auth is required before any payment.
