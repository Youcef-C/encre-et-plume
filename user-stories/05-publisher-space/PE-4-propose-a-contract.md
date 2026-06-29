# PE-4 — Propose a contract "Proposer un contrat"

**As a** Publisher/Editor, **I want** to propose a contract to a talent and track its progress, **so that** I can move a scouted creator toward a signature.

> Screen(s): "Radar de talents" — "Proposer un contrat" action + contract modal (prototype `data-contract-modal`) · Priority: Must · Fidelity: Explicit (action) / Inferred (modal body)

## Frontend
- "Proposer un contrat" button on a talent row opens the contract modal (`data-contract-modal`).
- Modal body (inferred): terms fields — work/scope, contract type, royalty/advance terms, message to the creator — plus "Envoyer la proposition" and "Annuler".
- Status tracker showing the proposal's state: proposed → negotiation → signed → declined (e.g. badges "Proposé", "En négociation", "Signé", "Refusé").
- States: empty form, validating, sending, sent (confirmation), error. Disable submit until required terms present.
- Empty/loading/error: spinner on send; on failure keep the modal open with an inline error ("Échec de l'envoi de la proposition.").
- Accessibility: modal is focus-trapped, labelled, dismissible with Esc; status badges have text labels, not color-only.

## Backend
- `POST /editeur/contracts` — body `{ talentId, terms }`; creates a proposal in state `proposed`.
- `PATCH /editeur/contracts/{id}` — updates `status` (negotiation/signed/declined).
- `GET /editeur/contracts` — list proposals for the editor org (with status).
- Entities: ContractProposal { id, editorOrgId, talentId, terms, status (proposed|negotiation|signed|declined), createdBy, createdAt, updatedAt, signedAt }.
- Business rules:
  - Allowed transitions: proposed → negotiation → signed; proposed/negotiation → declined.
  - A `signed` contract is the **billable event** — record it for the platform's revenue percentage ([[MR-5]]). Capture the contract value/terms needed to compute the cut.
- Validation: required terms present; status transitions validated server-side.
- Authorization: verified editors only ([[PE-1]]); proposal scoped to caller's org. Status changes that represent the creator's acceptance/refusal authorized for the talent.
- Side effects: on proposal, route to messaging ([[MC-9]]) and notify the talent ([[F-5]]); on status changes, notify the relevant party; on `signed`, emit a revenue/billing event ([[MR-5]]).

## Dependencies
- [[PE-1]] — access gate. [[PE-2]] — provides the "Proposer un contrat" action.
- [[MC-9]] — proposal routes into messaging. [[F-5]] — talent notification.
- [[MR-5]] — signed contracts feed the revenue percentage.

## Notes
- Explicit: the "Proposer un contrat" action, the `data-contract-modal` prototype hook, and the proposed→negotiation→signed→declined states.
- Inferred: the modal's exact fields, badge copy, and the revenue/billing event shape.
