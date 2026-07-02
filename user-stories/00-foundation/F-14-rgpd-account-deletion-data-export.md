# F-14 — RGPD: account deletion & data export "Mes données"

**As a** user, **I want** to delete my account and download a copy of my data, **so that** my RGPD rights to erasure (art. 17) and portability (art. 20) are honoured without contacting support.

> Screen(s): none drawn (a "Mes données" section in account settings — to be designed) · Priority: Must · Fidelity: Inferred

## Frontend
- **"Mes données"** section in account settings with two blocks:
  - **Export**: "Télécharger mes données" → requests an export; while generating, show "Export en cours de préparation — vous serez notifié·e."; when ready, a time-limited download link ("Télécharger l'archive (.zip)") appears and a notification fires ([[F-5]]).
  - **Deletion**: "Supprimer mon compte" → confirmation modal explaining consequences in French (profil supprimé, œuvres et contributions anonymisées ou retirées, abonnements arrêtés, données de paiement conservées le temps légal), requires typing confirmation (e.g. "SUPPRIMER") + password re-entry; on success, logout + landing "Votre compte a été supprimé."
- States: export idle/generating/ready/expired/error; deletion modal idle/submitting/error (e.g. wrong password, pending payout blocking — see rules).
- Accessibility: destructive modal focus-trapped with explicit title; consequences readable by screen readers; download link labelled with format and expiry.
- Responsive: settings blocks and modal usable at 375/768/1280 px; manga-zine tokens reused.

## Backend
- **POST /me/data-export** — authenticated; enqueues a `data-export` job on the [[F-8]] queue; job gathers the user's data (account, profile, works/chapters they own, comments, reviews, messages they authored, subscriptions/donations metadata, action log) into a zip of JSON files + media manifest, stores it as a **private** media object ([[F-10]]), and notifies when ready ([[F-5]]).
- **GET /me/data-export** — status + (when ready) a short-lived **signed URL** ([[F-10]]) for the archive; archive auto-purged after a TTL (e.g. 7 days).
- **DELETE /me/account** — `{ password }` re-authentication required; runs the erasure flow.
- Entity **DataExport**: `{ id, accountId, status (pending|ready|failed|expired), mediaId?, requestedAt, readyAt?, expiresAt? }`.
- **Erasure semantics** (art. 17 with legal exceptions):
  - Erase/anonymize: credentials, e-mail, display name → "Utilisateur supprimé", profile + portfolio, avatar/cover media deleted from storage ([[F-10]]), sessions revoked, notifications purged.
  - Authored public content (comments, reviews, messages): anonymized (author becomes "Utilisateur supprimé"), not silently deleted from other people's threads.
  - Co-authored works ([[CS-10]]): ownership passes per the project's remaining owners; sole-owned unpublished projects are deleted; published works are unpublished or transferred per product decision (flagged open).
  - **Retention exception**: money records (subscriptions, donations, payouts, invoices — [[MR-1]]/[[MR-3]]/[[MR-6]]) are retained for the legal accounting period, dissociated from the erased identity where possible.
  - Active subscriptions are cancelled at the PSP; a creator with a **non-zero balance or in-flight payout** must resolve it first — deletion is blocked with "Solde à verser en attente — retirez vos gains avant de supprimer votre compte."
- Deletion runs as an idempotent [[F-8]] job (`account-erasure`) after the synchronous checks pass; the account is immediately locked (`status=deleting`) so no new activity occurs while the job completes.
- Validation: password re-check on deletion; export rate-limited (e.g. 1 active export at a time).
- Authorization: strictly self-service — both operate only on the authenticated account; admins use [[AD-6]] ban instead (ban ≠ erasure).
- Side effects: `ActionLogService.record()` emits `data_export_requested` / `account_deletion_requested` ([[AD-10]]); the action-log rows for an erased account are anonymized with it.
- Shared contracts in `packages/shared/src/privacy.ts` (`DataExportDto`, deletion DTOs) + barrel export.

## Dependencies
- [[F-1]] — account, sessions, password re-auth.
- [[F-8]] — export + erasure run as queue jobs.
- [[F-10]] — export archive stored privately with signed-URL delivery; media cleanup on erasure.
- [[F-5]] — "export ready" notification.
- [[CS-10]] — co-authored ownership handoff rules.
- [[MR-6]] — pending-balance guard before deletion.

## Notes
- Inferred: no prototype frame — settings blocks reuse the profile-settings patterns and manga-zine tokens.
- Open questions: fate of published works of a sole author (unpublish vs orphan under an anonymized byline) and the exact retention periods (accounting: typically 10 years FR) need a product/legal decision; the story ships the conservative mechanics either way.
