# MR-6 — Payouts "Versements"

**As a** Creator, **I want** to see my available balance, withdraw my earnings, and manage my payout method, **so that** I can actually receive the money my work has earned, net of fees.

> Screen(s): "Revenus" → "Versements" tab · Priority: Must · Fidelity: Explicit

## Frontend
- [ ] "Solde disponible" prominently shown (e.g. "1 240 €") with "Retirer maintenant" and "Calendrier" actions.
- [ ] "Méthode de versement" block: masked IBAN ("IBAN ····4471") with "Modifier"; fee note "commission 8 % + TVA".
- [ ] Payout history table: columns "Période", "Brut", "Net versé", "Statut" with status values "À venir" and "Versé".
- [ ] "Retirer maintenant" flow: confirmation showing gross, commission (8 %) + VAT, and net amount; disabled when balance is below the minimum or no valid payout method is set.
- [ ] "Modifier" payout method: IBAN form with validation and masked display after save.
- [ ] States: balance with history, no-method-set (prompt to add IBAN before withdrawing), zero/low balance (withdraw disabled with reason), loading, error.
- [ ] Validation (client): IBAN format/checksum; withdrawal ≤ available balance.
- [ ] Accessibility: balance and fee breakdown announced; status values have text labels (not color-only); IBAN field labelled and the masked value readable by screen readers.

## Backend
- [ ] GET /payouts/balance — { availableBalance, currency, nextScheduledDate }.
- [ ] GET /payouts — payout history { periodLabel, gross, netPaid, status: upcoming|paid }.
- [ ] POST /payouts/withdraw — request an immediate withdrawal of the available balance ("Retirer maintenant").
- [ ] GET /payouts/method / PATCH /payouts/method — manage IBAN (returns masked).
- [ ] Entities: Payout { id, creatorId, periodStart, periodEnd, gross, commission, vat, netPaid, status, paidAt }; PayoutMethod { creatorId, ibanMasked, verified }.
- [ ] Business rules: net = gross − (8 % commission) − VAT on the commission; status lifecycle "à venir" → "versé"; available balance accrues from subscriptions ([[MR-1]]) and donations ([[MR-3]]), net of already-paid/pending payouts.
- [ ] Validation (server): withdrawal amount ≤ available balance; a valid, verified IBAN must exist before withdrawal; reject if a payout is already in flight (no double withdrawal); enforce minimum payout threshold if any (designer-confirm).
- [ ] Authorization: a creator manages only their own balance, payouts, and method.
- [ ] Side effects: withdrawal creates a PSP/transfer payout, moves status to processing then "versé", debits balance, and recomputes "prochain versement" shown in [[MR-5]]; method change may require PSP re-verification.
- [ ] Integration note: requires PSP payout/transfer capability and IBAN validation — tech-agnostic.

## Dependencies
- [[MR-5]] — "Versements" is a Revenus tab; "prochain versement" displayed there.
- [[MR-1]] / [[MR-3]] — subscriptions and donations build the balance.
- [[CS-10]] — only the creator's own split share is withdrawable.
- [[F-8]] — payouts run as idempotent, retryable queue jobs (Stripe transfers + webhook confirmation), with dead-letter on permanent failure.

## Notes
- Explicit: "Solde disponible 1 240 €", "Retirer maintenant", "Calendrier", "Méthode de versement" with masked IBAN "····4471" and "Modifier", "commission 8 % + TVA", and the history table (Période / Brut / Net versé / Statut: À venir / Versé) are in the prototype.
- Inferred: minimum payout threshold, IBAN verification flow, double-withdrawal guard, and exact VAT base need designer/finance confirmation.
- Admin oversight — payout freeze/release, balance clawback on refunds/chargebacks ([[MR-7]]), and manual adjustments — is [[AD-12]]; withdraw must honour an admin freeze.
