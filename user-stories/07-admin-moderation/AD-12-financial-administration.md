# AD-12 — Financial administration "Finances"

**As an** Admin, **I want** a financial administration tab where I can inspect any user's payments, subscriptions, and payouts, and act on them — refund, cancel, freeze, resolve disputes, adjust balances — **so that** support, fraud, and finance operations have real tooling instead of raw database access.

> Screen(s): admin console "Finances" tab (within PANNEAU ADMIN, not drawn) · Priority: Should · Fidelity: Inferred

## Frontend
- **"Finances"** tab in the [[AD-1]] console — **`admin` only** (hidden from `maintainer`, unlike the moderation tabs). Sub-views:
  - **Transactions**: platform-wide, filterable table (type: abonnement/don/versement/remboursement; statut; période; recherche par utilisateur) — columns "Date", "Type", "Payeur·se / Bénéficiaire", "Montant", "Statut", with a detail drawer per row (PSP ids, receipt link, related refunds/disputes, timeline).
  - **Par utilisateur**: from the [[AD-6]] user detail (or search here), a per-user financial summary — payments made, active subscriptions, donations, creator balance, payout history/method status ([[MR-6]] data, read-only IBAN masked).
  - **Remboursements**: the [[MR-7]] refund-request queue — "En attente" list with per-request "Approuver" (full or partial amount + note) / "Refuser" (motif, sent to the requester); plus **admin-initiated refund** from any transaction row ("Rembourser", motif obligatoire).
  - **Litiges**: Stripe dispute/chargeback queue — status ("Reçu", "Preuves requises", "Gagné", "Perdu"), linked charge + user, due date; lost disputes show the executed balance clawback.
  - **Versements**: platform payout oversight — upcoming/paid payouts across creators; per-creator "Geler les versements" / "Réactiver" (motif obligatoire) shown as a "Versements gelés" badge; frozen creators' withdraw stays disabled with a support message ([[MR-6]]).
  - **Ajustements**: manual balance adjustment on a creator (montant ±, motif obligatoire, confirmation) — the exception tool for reconciliation drift.
- Every destructive/money action: confirmation modal restating amount + target + motif field; success/error toasts; the acting admin's name recorded and displayed in the row timeline.
- States: each sub-view loading/empty ("Aucune transaction", "Aucun litige en cours", …)/error; queue count badges (e.g. "Remboursements [3]").
- Accessibility: tables with real semantics; statuses text-labelled; modals focus-trapped; amounts announced with currency.
- Responsive: tables reflow/stack at 375 px; console usable at 768/1280 px.

## Backend
- **GET /admin/finance/transactions?type=&status=&userId=&from=&to=&page=** — unified read across Payment ([[MR-7]]), Payout ([[MR-6]]), refunds, disputes.
- **GET /admin/finance/users/:id/summary** — the per-user financial summary.
- **GET /admin/finance/refund-requests?status=** / **POST /admin/finance/refund-requests/:id/approve** `{ amount?, note? }` / **POST /admin/finance/refund-requests/:id/deny** `{ note }` — decisions on [[MR-7]] requests.
- **POST /admin/finance/payments/:id/refund** — `{ amount?, reason }` — admin-initiated refund (same execution path as approvals).
- **GET /admin/finance/disputes** + **PATCH /admin/finance/disputes/:id** — dispute worklist; rows created/updated by `charge.dispute.*` events on the [[F-8]] `stripe-events` queue; entity **Dispute**: `{ id, paymentId, pspDisputeId, status, amount, dueBy?, resolvedAt?, outcome? }`.
- **POST /admin/finance/creators/:id/payout-freeze** / **…/payout-unfreeze** — `{ reason }`; sets `PayoutMethod`-level freeze consulted by [[MR-6]] withdraw + the payout job.
- **POST /admin/finance/creators/:id/adjustments** — `{ amount, reason }`; entity **BalanceAdjustment**: `{ id, creatorId, amount, reason, adminId, createdAt }` feeding the [[MR-6]] balance computation.
- **Money correctness** (per [[F-8]], non-negotiable): every mutation (refund, clawback, adjustment) executes as an idempotent queue job doing the PSP call + local writes inside an **ACID Postgres transaction** with an idempotency key; a lost dispute claws back the creator's balance (allowing negative balances that net against future earnings); the reconciliation job's discrepancies surface in the Transactions view.
- Business rules: motif obligatoire on every mutation; refunds capped at the un-refunded remainder; freeze blocks withdrawals but never accrual; adjustments are append-only (corrections are new entries).
- Validation: amounts positive, currency-consistent, server-computed caps; enums validated.
- Authorization: **`admin` only** for the whole tab and all endpoints ([[F-2]]) — `maintainer` is excluded from financial data; role loaded fresh server-side.
- Side effects: every action writes the admin's [[AD-10]] action log (`refund_issued`, `payout_frozen`, `balance_adjusted`, …) AND a domain audit row; affected users notified ([[F-5]], e-mails via [[F-16]]); creator dashboards ([[MR-5]]/[[MR-6]]) reflect changes.
- Shared contracts in `packages/shared/src/admin-finance.ts` (DTOs, enums) + barrel export.

## Dependencies
- [[AD-1]] — console host; this tab extends its tab bar (admin-only visibility).
- [[MR-7]] — refund requests decided here; shared refund execution machinery.
- [[MR-6]] — payout data, freeze enforcement, balance clawback/adjustments.
- [[MR-1]] / [[MR-3]] / [[MR-4]] — the subscriptions and donations being inspected/refunded/cancelled.
- [[F-8]] — `stripe-events` (disputes), idempotent money jobs, reconciliation.
- [[AD-10]] — every admin financial action is logged.
- [[AD-6]] — user detail links into the per-user financial summary.

## Notes
- Inferred: no prototype frame — a new tab inside the drawn PANNEAU ADMIN console, reusing its table/badge/modal patterns (like [[AD-7]]/[[AD-10]]).
- Deliberate role boundary: financial data and actions are `admin`-only; `maintainer` keeps moderation-only access per [[AD-1]].
- Admin cancel/comp of a subscription on a user's behalf rides [[MR-4]]'s cancel machinery (admin override, motif + log) — support-driven, e.g. after an account-access loss.
- RGPD: financial views expose payment metadata, never full card data (PSP-side); access to this tab is itself logged ([[AD-10]]) like [[AD-11]] message oversight.
