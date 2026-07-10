# MC-6 — My applications "Mes candidatures"

**As a** Creator, **I want** to see the calls I've applied to and their status, **so that** I can track which applications are still pending, accepted, or refused.

> Screen(s): "Mes candidatures" (avatar-menu entry `goCandidatures`) · Priority: Should · Fidelity: Inferred

## Frontend
- List of applications the current user submitted, reached from the avatar menu entry `goCandidatures`.
- Each row: the target call's title and direction, the call author, the date applied, and a status badge — "en attente" / "acceptée" / "refusée".
- Each row links to the underlying call ([[MC-4]]).
- States: loading skeleton; empty state ("Vous n'avez pas encore candidaté.") with a link to "Appels à projets"; error/retry.
- Accessibility: status conveyed by text (not color alone); list rows keyboard-navigable; links named with the call title.

## Backend
- `GET /me/applications` — the current user's submitted applications. Response: `[{ id, callId, callTitle, callDirection, ownerName, status, createdAt }]`.
- Entities: reads `Application` ([[MC-5]]) joined to `Call` ([[MC-4]]) for display fields.
- Business rules: returns only the requesting user's applications; status reflects owner decisions made in [[MC-7]].
- Validation: standard pagination clamps (if paginated).
- Authorization: authenticated; scoped to the requesting user.
- Side effects: none (read-only).

## Dependencies
- [[MC-5]] — applications listed here originate from applying.
- [[MC-4]] — each row links to its call.
- [[MC-7]] — status changes here are driven by the owner's accept/reject.

## Notes
- Inferred: this view exists only as the avatar-menu entry `goCandidatures` with no wireframe. Kept conservative — a status list linking to calls. Exact columns, pagination, and copy are inferred.

## Amendment (2026-07-10) — Withdraw allowed even when accepted
- **Was**: withdraw hard-deleted only a *pending* application; an accepted (or rejected) one returned 409 ("déjà traitée … ne peut plus être retirée").
- **Now (approved)**: an applicant may **withdraw even after being accepted**. Withdrawing an accepted application **frees the call seat** (decrement the accepted-seat count for its `appliedAs` role so the call reopens that seat) and removes the application; the social Connection ([[MC-8]]) created on acceptance is left intact. Rejected applications still cannot be withdrawn (nothing to free; keep 409) — or allow removal from the list, implementer's call, but the primary requirement is accepted→withdraw. Server-side, self-scoped. Confirm/notify the call owner ([[F-5]]). Grade against this.

## Amendment (2026-07-10) — View + edit a pending application
- **View details (approved)**: from "Mes candidatures", the applicant can open a **detail view** of an application they sent — the full **message text** and its attached **documents/samples** (images + PDFs), not just the list thumbnail.
- **Edit a PENDING application (approved)**: while an application is **pending**, the applicant can edit it — change the **message** and the **samples/documents** (add/remove, within the 1..`APPLICATION_MAX_SAMPLES` rule) — reusing the [[MC-5]] `ApplyCallModal` fields, pre-filled. Accepted/rejected applications are **view-only** (no edit). Applicant-scoped, server-side.
- **Backend**: `GET /me/applications/:id` (applicant-scoped detail with message + assets) and `PATCH /me/applications/:id` (edit message + samples; **pending only** → 409 otherwise; self-scoped; re-validate sample count 1..MAX and denormalize the first sample's `sampleUrl`). Grade against this.
