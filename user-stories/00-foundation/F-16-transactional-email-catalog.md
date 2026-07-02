# F-16 — Transactional e-mail catalog & delivery

**As a** platform operator, **I want** a defined catalog of every e-mail the platform sends — trigger, audience, template — behind one delivery seam, **so that** e-mail is a specified product surface instead of an ad-hoc side effect, and opt-outs/compliance are enforced in one place.

> Screen(s): none (technical/infra — the e-mails themselves) · Priority: Should · Fidelity: Inferred

## Frontend
- No app UI. The deliverables are the **e-mail templates** (French, manga-zine-flavoured but e-mail-safe HTML + plain-text fallback), each with the platform header, the legal footer (mentions légales link, [[F-13]]), and — for non-mandatory mail — the unsubscribe link ([[F-15]]).

## Backend
- **Service seam** `EmailService.send(template, to, data)` — mirrors `QueueService.enqueue()` / `ActionLogService.record()`; validates the template exists, checks [[F-15]] preferences (skip if opted out and not mandatory), renders, and enqueues on the [[F-8]] `email` queue. Provider-agnostic transport behind an env-configured adapter (SMTP or API provider); a no-op/log transport for dev & CI.
- **Catalog** (each entry: trigger → template, audience, `mandatory` flag):
  - **Compte (mandatory)**: bienvenue + vérification d'e-mail ([[F-11]]); réinitialisation du mot de passe + avis de changement ([[F-12]]); avis de changement d'e-mail ([[F-18]]); export de données prêt ([[F-14]]).
  - **Argent (mandatory)**: reçu de paiement / don ([[MR-1]], [[MR-3]], [[MR-7]]); échec de paiement + relance ([[MR-4]]); versement effectué ([[MR-6]]); remboursement effectué ([[MR-7]]).
  - **Modération (mandatory)**: sanction / avertissement / bannissement avec motif ([[AD-6]], [[AD-13]]); décision sur un signalement soumis ([[PUB-6]]).
  - **Engagement (opt-out via [[F-15]])**: nouveau chapitre d'un·e créateur·rice suivi·e ([[PUB-4]]/[[PUB-1]]); nouvelle demande de collab / candidature reçue ([[MC-3]], [[MC-5]]); réponse à une candidature ([[MC-6]]); nouveau soutien / don reçu ([[MR-1]], [[MR-3]]); résumé d'activité (digest, optional).
- Templates versioned in the repo (one file per template + shared layout); rendering with typed data payloads.
- Job semantics from [[F-8]]: retries with backoff, dead-letter on permanent failure, idempotency key per (template, recipient, triggering event) so retries never double-send.
- Business rules: preference check at **dispatch time** (not enqueue time alone); every non-mandatory e-mail carries the unsubscribe token + `List-Unsubscribe` header; no PII beyond what the template needs is logged ([[F-9]] `redact()`).
- Authorization: server-side only; no public endpoint. Optional dev-only preview route gated to non-production.
- Shared contracts in `packages/shared/src/email.ts` (`EMAIL_TEMPLATES` with `{ key, group, mandatory }`, payload types) + barrel export.

## Dependencies
- [[F-8]] — the `email` queue carries all sends.
- [[F-15]] — preference/opt-out enforcement + unsubscribe tokens.
- [[F-11]] / [[F-12]] — first consumers (verification + reset e-mails).
- [[F-13]] — legal footer content in every template.
- [[F-9]] — delivery failures tracked; send metrics.

## Notes
- Inferred/technical: no prototype frame — e-mail design derives from the manga-zine identity, constrained to e-mail-client-safe HTML.
- This story ships the seam, transport adapter, layout, and the **Compte** group; other groups' templates land with their feature stories, registering into the same catalog.
- Provider choice (SES, Postmark, Resend, SMTP…) is an env/deploy decision — code stays provider-agnostic like the S3 client in [[F-10]].
