# MR-7 — Refunds & receipts "Reçus & remboursements"

**As a** Supporter or Donor, **I want** a receipt for every payment and a way to request a refund, **so that** I have proof of what I paid and a recourse when something goes wrong.

> Screen(s): none drawn (a "Mes paiements" history in account settings) · Priority: Should · Fidelity: Inferred

## Frontend
- [ ] **"Mes paiements"** view (account settings): reverse-chronological table of the caller's payments — columns "Date", "Description" (palier/don + créateur·rice ou projet), "Montant", "Statut" ("Payé", "Remboursé", "Remboursement demandé", "Échoué") — with per-row "Reçu (PDF)" and, when eligible, "Demander un remboursement".
- [ ] **Receipt**: downloadable PDF per successful payment — plateforme (mentions légales, [[F-13]]), numéro de reçu, date, description, montant TTC avec détail TVA le cas échéant; also e-mailed on payment ([[F-16]]).
- [ ] **Refund request flow**: modal with reason selector ("Paiement par erreur", "Montant incorrect", "Contenu indisponible", "Autre") + "Détails" textarea; submit → "Demande envoyée — vous serez notifié·e de la décision."; status visible in the table; decision notified ([[F-5]] + e-mail).
- [ ] Eligibility surfaced client-side (window, one open request per payment) but enforced server-side.
- [ ] States: table loading/empty ("Aucun paiement pour l'instant."), request submitting, request accepted/denied badges, receipt generating, errors.
- [ ] Accessibility: table semantics; statuses text-labelled (not color-only); modal focus-trapped; download links named per payment.
- [ ] Responsive: table stacks to cards at 375 px; usable at 768/1280 px.

## Backend
- [ ] Entity **Payment** *(read-model unifying charges)*: `{ id, payerId, kind (subscription|donation), refId, amount, currency, vatAmount?, status (paid|failed|refund_requested|refunded|partially_refunded), receiptNumber, pspChargeId, createdAt }` — written by the [[MR-1]]/[[MR-3]] payment webhooks ([[F-8]] `stripe-events`).
- [ ] Entity **RefundRequest**: `{ id, paymentId, requesterId, reason, details?, status (pending|approved|denied), decidedBy?, decidedAt?, decisionNote?, createdAt }`.
- [ ] **GET /me/payments** — paginated payment history with refund status.
- [ ] **GET /me/payments/{id}/receipt** — the receipt PDF (generated on demand or at payment time via an [[F-8]] job; stored as private media, [[F-10]], signed-URL delivery).
- [ ] **POST /me/payments/{id}/refund-request** — `{ reason, details? }`; creates a pending request.
- [ ] Business rules: eligibility window (e.g. 14 days, EU-withdrawal-aligned — finance-confirm) and one open request per payment; approval is a **staff decision in [[AD-12]]** (no auto-refund), except product may auto-approve clear duplicate charges; an approved refund executes as an idempotent [[F-8]] job — PSP refund + ACID transaction updating `Payment.status` and **clawing back the creator's balance** ([[MR-6]]); receipt numbering is sequential and gap-free per legal requirements.
- [ ] Validation: reason from enum; payment must belong to the caller and be refund-eligible; amounts never client-supplied.
- [ ] Authorization: strictly self-service on own payments ([[F-2]]); decisions happen in [[AD-12]] (admin).
- [ ] Side effects: refund decision notifies the payer ([[F-5]], e-mail via [[F-16]]); creator sees the adjustment in [[MR-5]]; `ActionLogService.record()` emits `refund_requested` ([[AD-10]]).
- [ ] Shared contracts in `packages/shared/src/payments.ts` (`PaymentDto`, `RefundRequestDto`, enums) + barrel export.

## Dependencies
- [[MR-1]] / [[MR-3]] — the charges this story receipts and refunds.
- [[AD-12]] — staff review/approval + admin-initiated refunds share the same refund machinery.
- [[MR-6]] — refunds claw back the creator balance before/after payout.
- [[F-8]] — refund execution + receipt generation as idempotent queue jobs; payment read-model fed by `stripe-events`.
- [[F-10]] — receipt PDFs stored privately, delivered via signed URLs.
- [[F-16]] — receipt + refund e-mails.

## Notes
- Inferred: no prototype frame — "Mes paiements" reuses the drawn table patterns ([[MR-4]]/[[MR-6]]) and manga-zine tokens.
- Money correctness per [[F-8]]: PSP refund + local writes are idempotent (keyed on the refund id) inside ACID transactions; the reconciliation job also picks up refunds initiated directly in the PSP dashboard.
- Open questions (finance-confirm): exact eligibility window, partial-refund policy for subscriptions (current period vs pro-rata), and the VAT treatment on refunds.
