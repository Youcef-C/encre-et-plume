# MC-5 — Apply to a call "Candidater"

**As a** Creator, **I want** to apply to an open call with a work sample and a message, **so that** the call owner can evaluate me as a collaborator.

> Screen(s): "Appels à projets" → "Candidater" application form · Priority: Must · Fidelity: Explicit (action) / Inferred (form)

## Frontend
- "Candidater" button on a call card ([[MC-4]]) opens an application form (modal).
- Fields: work sample attachment ("candidater avec un échantillon" — upload/select a portfolio piece or file) and an optional message to the owner.
- States: default, uploading sample (progress), submitting, success confirmation, error; if the user already applied, the button shows "Candidature envoyée" / disabled; if the call is closed, applying is blocked with explanation.
- Validation: sample required (per "candidater avec un échantillon"); accepted file types/size; message length bounded.
- Accessibility: labelled file input, focus-trapped modal, errors associated with fields, status announcements on submit.

## Backend
- `POST /calls/{callId}/applications` — Request: `{ sampleAssetId, message? }` (applicant = current user).
- Entity `Application`: `id`, `callId`, `applicantId`, `sampleAssetId`, `message?`, `status (pending|accepted|rejected)`, `createdAt`.
- Business rules: one application per user per call (reject duplicates); cannot apply to your own call; cannot apply to a closed/past-deadline call; increments the call's `applicantCount` ([[MC-4]]).
- Validation: callId must exist and be open; sampleAssetId must belong to / be uploadable by the applicant; message length limit.
- Authorization: authenticated creators only; banned users ([[AD-6]]) blocked.
- Side effects: notifies the call owner ([[F-5]]); the application feeds the applicant's "Mes candidatures" ([[MC-6]]) and the owner's "Candidatures reçues" ([[MC-7]]).

## Dependencies
- [[MC-4]] — the call being applied to; applicant count.
- [[MC-6]] — applicant sees this in "Mes candidatures".
- [[MC-7]] — owner reviews it in "Candidatures reçues".
- [[F-5]] — owner notified on new application.
- [[F-3]] — work sample sourced from the applicant's portfolio.

## Notes
- Explicit: the "Candidater" action and the wireframe annotation "candidater avec un échantillon" (sample attachment required).
- Inferred: the full application form layout, duplicate/closed-call guards, and message field — the form itself was not fully specified.
