# MC-7 — Received applicants "Candidatures reçues"

**As a** Creator, **I want** to review the people who applied to my calls and accept or reject them, **so that** I can choose collaborators for my project.

> Screen(s): "Candidatures reçues" (avatar-menu entry `goCandidatsRecus`) · Priority: Should · Fidelity: Inferred

## Frontend

- Rename "Candidatures reçues" to "Mes appels à projets"
- List of applicants who responded to the current user's own calls, reached from the avatar menu entry `goCandidatsRecus`, grouped or filterable by call.
- Ability to see the call in details in a press of a button.
- Each applicant row: avatar, name, role, the submitted work sample (viewable/expandable), the message, and actions "Accepter" / "Refuser".
- Each row links to the applicant's profile ([[F-3]]) and the related call ([[MC-4]]).
- States: loading; empty ("Aucune candidature reçue pour le moment."); per-row pending/processing on accept/reject; error/retry; rows reflect resolved status once decided.
- Accessibility: sample preview has alt/label; accept/reject buttons named with applicant context; status announced after action.

## Backend

- `GET /me/calls/applications` — applications on calls owned by the current user. Response grouped by call: `[{ callId, callTitle, applications: [{ id, applicantId, name, role, sampleAssetUrl, message, status }] }]`.
- `PATCH /applications/{id}` — `{ status: accepted | rejected }`.
- Entities: `Application` ([[MC-5]]) and `Call` ([[MC-4]]).
- Business rules: only the call owner may change status; accepting may start a connection/collaboration with the applicant ([[MC-8]] / [[CS-2]]); a decision is final or re-openable per design (kept simple: pending → accepted/rejected).
- Validation: application must belong to a call owned by the requester; status transitions limited to accept/reject from pending.
- Authorization: authenticated; owner-only on the parent call.
- Side effects: accept and reject both notify the applicant ([[F-5]]); accept may create a connection/collaboration and surface in "Contacts & connexions" ([[MC-8]]); updates status shown in the applicant's "Mes candidatures" ([[MC-6]]).

## Dependencies

- [[MC-5]] — source applications.
- [[MC-4]] — owner's calls being reviewed.
- [[MC-6]] — status decisions reflected back to applicants.
- [[F-3]] — applicant profile link.
- [[F-5]] — applicant notified on accept/reject.
- [[MC-8]] / [[CS-2]] — accept may start a connection/collaboration.

## Notes

- Inferred: this view exists only as the avatar-menu entry `goCandidatsRecus` with no wireframe. Kept conservative — review sample + accept/reject. Grouping, re-open semantics, and copy are inferred.
