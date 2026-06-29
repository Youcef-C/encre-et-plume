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
