# AD-3 — Editor-account verification "Comptes éditeurs"

**As an** Admin, **I want** to review and verify pending publisher accounts, **so that** only legitimate publishers gain access to the editor space and the "✓ compte vérifié" badge.

> Screen(s): "Comptes éditeurs" tab of "Administration & modération" · Priority: Must · Fidelity: Explicit

## Frontend
- Dashed callout summarizing the pending queue, e.g. "2 comptes éditeurs en attente de vérification", with a "Vérifier" action.
- Pending list: each row shows the applicant account (name, submitted publisher info / supporting details) and actions "Vérifier" and "Rejeter".
- "Vérifier" sets the "✓ compte vérifié" flag on the account (which gates the editor space, [[PE-1]]); "Rejeter" requires a reason.
- Verified-state indicator: an account shows "✓ compte vérifié" once approved.
- States:
  - Empty: "Aucun compte en attente" and the callout hidden when the queue is empty.
  - Loading: skeleton rows; spinner on verify/reject submit.
  - Error: toast on failure; row stays pending.
- Validation: rejection requires a reason; confirm before verifying.
- Accessibility: callout count announced; "Vérifier"/"Rejeter" buttons named with applicant context; verified badge has a text label, not icon-only.

## Backend
- **GET /admin/editor-accounts?status=pending** — list of accounts awaiting verification (+ submitted details).
- **PATCH /admin/editor-accounts/{accountId}** — `{ decision: "verify"|"reject", reason? }`; on verify sets `verified=true` (+ `verifiedBy`, `verifiedAt`); on reject records reason.
- Entity **EditorAccount** (or User publisher profile): `id, ownerUserId, orgName, details, status (pending|verified|rejected), verified (bool), verifiedBy, verifiedAt, rejectionReason?`.
- Business rules: the `verified` flag is the gate read by [[PE-1]] / role `editeur` capabilities ([[F-2]]); rejection is reversible by resubmission.
- Validation: `decision` enum; `reason` required on reject; account must currently be `pending`.
- Authorization: `admin` ([[F-2]]).
- Side effects: notify the applicant of the decision ([[F-5]]); verifying unlocks editor-space access ([[PE-1]]); pending count feeds the callout.

## Dependencies
- [[PE-1]] — the verified flag gates editor-space access.
- [[F-2]] — role/verification model; [[F-5]] — applicant notification.
- [[AD-1]] — host tab.

## Notes
- Explicit: the "2 comptes éditeurs en attente de vérification" callout, "Vérifier", and the "✓ compte vérifié" flag.
- Inferred: per-row applicant fields, "Rejeter" + reason, resubmission, notification.
