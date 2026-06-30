# AD-10 — User action log

**As an** Admin or editorial staff (`maintainer`), **I want** a chronological action log of everything a given user has done — and to let each user see their own activity — **so that** trust-&-safety and support investigations have a complete trail, and users have transparency into their own account activity.

> Screen(s): admin console "Journal d'activité" tab (within PANNEAU ADMIN) + user self "Mon activité" view (not drawn) · Priority: Should · Fidelity: Inferred

## Frontend
- **Staff view** — a "Journal d'activité" view inside the admin console (host: the [[AD-1]] console / the [[AD-6]] user-detail view), accessible to `admin` and `maintainer`. For a selected user, render their action log as a reverse-chronological **table**: timestamp, action label (French), target (type + a link where the target has a page), and an expandable details/metadata cell.
  - Pagination: page through results, newest first; show the current page / total.
  - Filtering (inferred, conservative): by action type and/or date range.
- **Self view** — each logged-in user can see **their own** "Mon activité" (a security/transparency "recent activity" view, e.g. a `/mon-activite` route or a section in account settings). Same table component, scoped to the caller's own log; no other user's log is reachable.
- States:
  - Loading: skeleton rows while the page loads.
  - Empty: "Aucune activité enregistrée." rendered plainly.
  - Error: inline error / toast if the log fails to load.
- Accessibility: real table semantics; each row readable in order; status not color-only; pagination and filter controls are labelled.
- Responsive: the table reflows / stacks into readable cards on mobile (no horizontal overflow); reuses the admin-console manga-zine tokens/components. French UI copy verbatim.

## Backend
- Entity **UserActionLog**: `{ id, actorId, action, targetType?, targetId?, metadata? (Json), ip?, userAgent?, createdAt }`. `actorId` is the user who performed the action. Index `(actorId, createdAt)` for the per-user, newest-first query.
- Enum **ActionType** (extensible): `signup`, `login`, `logout`, `profile_update`, `preferences_update`, `role_change` to start; later stories add their own values as they emit.
- **Service seam** `ActionLogService.record({ actorId, action, targetType?, targetId?, metadata?, ip?, userAgent? })` — mirrors `NotificationsService.create()` ([[F-5]]); exported from `ActionLogModule` so any service can inject it. **Best-effort**: a logging failure must never block or break the underlying user request.
- **GET /admin/users/:id/action-log?page=&limit=&action=&from=&to=** — `admin` + `maintainer`; paginated, newest-first; returns `{ items: UserActionLogItem[], page, total }`.
- **GET /me/action-log?page=&limit=&action=&from=&to=** — the authenticated caller's OWN log; `actorId` taken from the session (`req.accountId`), no id in the path (structurally own-only).
- **GET /admin/action-log** *(optional, inferred)* — global feed across all users; `admin` only.
- **Initial emitters wired now** (so the log holds real data): `signup`, `login`, `logout` (auth — capture `ip` + `userAgent`), `role_change` (on the admin role change, with `targetId` = the affected user), `profile_update`, `preferences_update`. Domains built in later stories (posts, comments, likes, applications, moderation, bans) call the `record()` seam from their own services — this story ships the **system + seam**, not a retrofit of the whole app.
- Business rules: actor-based semantics — the log records what the authenticated user did; an admin action on another user appears in the **admin's** log with `targetId` set. The log is append-only: there is no edit or delete endpoint exposed via the API.
- Validation: query params bounded (`page` ≥ 1, `limit` capped), `action` must be a valid `ActionType`, `from`/`to` valid ISO dates.
- Authorization: staff per-user endpoint = `admin` + `maintainer`; global feed = `admin`; self endpoint = any authenticated user (own log only). Enforced server-side with the role loaded fresh from the DB ([[F-2]]); never trust a client role claim.
- Side effects: none beyond writing log rows.
- Shared contracts in `packages/shared/src/actionlog.ts` (`ACTION_TYPES`, `ActionType`, `UserActionLogItem`, `ActionLogPage`) + a barrel export in `index.ts`. New Prisma model + migration.

## Dependencies
- [[F-1]] — sessions provide the actor identity and the login/logout/signup events to record.
- [[F-2]] — role-based authorization (admin + maintainer for the staff endpoint; self for own log).
- [[AD-1]] — admin console host surface; generalises its narrow `RoleChangeAudit`.
- [[AD-6]] — the user-management detail view is the natural per-user host; ban events emit into this log too.

## Notes
- Inferred: no rendered prototype frame. The staff view is a new tab inside the drawn PANNEAU ADMIN console (reuse its tokens/components, like [[AD-7]]); the self view is a conservative "recent activity" surface.
- **Unifying layer**: [[AD-1]] (role changes), [[AD-5]] (moderation), [[AD-6]] (bans) keep their own specific audit records but should ALSO call `ActionLogService.record()` so those actions surface in the per-user timeline. Future emitters hook the same seam.
- **Privacy (RGPD)**: logs hold activity plus `ip`/`userAgent`. Staff (admin + maintainer) may view any user's log; a user may view only their own and never another user's. A retention policy (e.g. purge after N months) is an open question for design.
