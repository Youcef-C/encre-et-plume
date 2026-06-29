# MR-1 — Support a creator / work (subscription tiers)

**As a** Reader/Supporter (mécène), **I want** to subscribe to a recurring monthly tier on a work or a creator's profile, **so that** I unlock perks and premium chapters while supporting them every month.

> Screen(s): "★ Soutenir" (work page [[DR-3]], profile [[F-3]], illustration) · support page "Paliers & récompenses" · Priority: Must · Fidelity: Explicit

## Frontend
- [ ] "★ Soutenir" entry point on the work page, creator profile, and illustration; opens the support page for that scope.
- [ ] Support page section "Paliers & récompenses": list of tier cards, each showing tier name, price (e.g. "à partir de 3 €/mois"), subscriber count, and the bullet list of perks ("récompenses").
- [ ] Known tiers rendered as cards: "Lecteur·rice" 3 €, "Apprenti·e" 6 €, "Mécène" 12 €, "Atelier" 25 €.
- [ ] "POPULAIRE" badge on the highlighted tier.
- [ ] Two scopes selectable/contextual: per-project support (from work page) and per-creator support (from profile); the page header names the scope (the work title or the creator name).
- [ ] Subscribe interaction: select a tier → confirm → payment step (PSP-hosted form/redirect); on success show confirmation and granted perks.
- [ ] States: not-subscribed (CTA "Soutenir"/"S'abonner"), already-subscribed to this/another tier (show current tier + "Gérer" → [[MR-4]]), loading tiers, empty ("Aucun palier proposé pour l'instant"), payment error, payment-cancelled.
- [ ] Visitor (unauthenticated): tapping "Soutenir" prompts sign-in/sign-up ([[F-1]]) before payment.
- [ ] Owner-only tier editor (CRUD): "Ajouter un palier", edit/reorder, set name/price/perks/popular flag, delete (with warning about existing subscribers); price input validated > 0.
- [ ] Accessibility: tier cards keyboard-selectable; price and "POPULAIRE" badge announced; perks as a real list.

## Backend
- [ ] GET /support/tiers?scope={project|profile}&id={id} — ordered tiers with name, price (monthly, EUR), perks[], subscriberCount, popular flag.
- [ ] POST /subscriptions — body { scope, scopeId, tierId } → creates a recurring monthly subscription for the authenticated supporter; returns subscription + PSP payment intent/redirect.
- [ ] CRUD tiers (owner only): POST/PATCH/DELETE /support/tiers — name, price, perks[], popular, order.
- [ ] Entities: Tier { id, scope, scopeId, name, price, perks[], popular, order }; Subscription { id, supporterId, scope, scopeId, tierId, status, startedAt, currentPeriodEnd } (see [[MR-4]]).
- [ ] Business rules: a supporter holds at most one active subscription per scope+scopeId (changing tier = upgrade/downgrade, not duplicate); recurring monthly billing; subscription grants the tier's perks and unlocks gated premium chapters ([[DR-4]], [[PUB-1]]).
- [ ] Validation: price > 0; tierId must belong to the named scope/scopeId; reject self-subscription where the supporter is the scope owner (designer-confirm).
- [ ] Authorization: anyone may read tiers; only authenticated users may subscribe; only the scope owner (project owner / profile owner) may CRUD tiers.
- [ ] Side effects: PSP customer/subscription created; perk grant + chapter-unlock entitlement issued; subscriberCount and revenue ([[MR-5]]) updated; notification to creator.
- [ ] Integration note: requires a payment service provider (PSP) for recurring billing, mandates, and webhooks (subscription renewed / payment failed / cancelled) — tech-agnostic.

## Dependencies
- [[DR-3]] / [[F-3]] — host the "★ Soutenir" entry points and support pages.
- [[DR-4]] / [[PUB-1]] — premium/locked chapters unlocked by an active subscription.
- [[MR-2]] — funding goals shown alongside tiers.
- [[MR-4]] — managing/cancelling a subscription.
- [[MR-5]] — subscriptions feed the revenue dashboard.
- [[F-1]] — auth required before payment.

## Notes
- Explicit: tier cards, the four named tiers/prices, "à partir de X €/mois", subscriber counts, perks, "POPULAIRE" badge, the two scopes, and "★ Soutenir" are all in the prototype.
- Inferred: exact subscribe→payment flow and PSP choice are tech-agnostic; one-subscription-per-scope and self-subscription handling need designer confirmation.
