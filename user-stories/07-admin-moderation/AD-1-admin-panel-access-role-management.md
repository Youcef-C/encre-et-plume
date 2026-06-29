# AD-1 — Admin panel access & role management

**As an** Admin, **I want** a role-gated admin console where I can reach moderation tools and change user roles, **so that** only authorized staff operate the platform and the right people hold the right permissions.

> Screen(s): "Panneau admin" (nav link), "Administration & modération" console · Priority: Must · Fidelity: Explicit

## Frontend
- "Panneau admin" nav link rendered only when the signed-in user has role `admin` ([[F-2]]); hidden for everyone else.
- Console route `/admin` titled "Administration & modération" with tab navigation: "Signalements" (with a pending-count badge, e.g. "Signalements [4]"), "Utilisateurs", "Comptes éditeurs", "Contenus".
  - Each tab loads its respective view ([[AD-2]], [[AD-6]], [[AD-3]], [[AD-4]]).
- Role management (within "Utilisateurs", see [[AD-6]]): per-user role switcher with options "utilisateur", "éditeur", "maintainer", "admin"; changing it shows a confirmation and persists.
- States:
  - Loading: skeleton tabs/badge while console + counts load.
  - Empty: tabs with no items show their own empty copy (delegated to each tab story).
  - Error: toast on load failure; role-change failure reverts the switcher and toasts.
- Validation: prevent an admin from demoting their own last admin role (guard against lockout); confirm destructive role changes.
- Accessibility: nav link and tabs have accessible names; active tab exposes selected state; badge count announced; role switcher is a labelled select.

## Backend
- **GET /admin/users?role=&search=&page=** — paginated user list with current roles (see [[AD-6]]).
- **PATCH /admin/users/{userId}/role** — `{ role: "utilisateur"|"editeur"|"maintainer"|"admin" }`; returns updated user.
- Entity **User** role field; **RoleChangeAudit**: `id, userId, oldRole, newRole, changedBy, reason?, createdAt`.
- Business rules: role is single-valued per user; `maintainer` gets moderation tabs but not role-management; only `admin` may grant/revoke `admin`/`maintainer`.
- Validation: `role` must be a known enum value; cannot remove the last remaining `admin`.
- Authorization: all `/admin/*` endpoints require `admin` (role management) or `maintainer` (moderation-only tabs) per route ([[F-2]]).
- Side effects: every role change writes a **RoleChangeAudit** row; optionally notify the affected user ([[F-5]]).

## Dependencies
- [[F-2]] — role model that gates the link, tabs, and endpoints.
- [[F-1]] — authenticated session.
- [[AD-2]], [[AD-3]], [[AD-4]], [[AD-6]] — tab contents.
- [[F-5]] — optional role-change notification.

## Notes
- Explicit: "Panneau admin" link (admin-only), "Administration & modération" console, the four tabs with the "[4]" badge, and the four role values.
- Inferred: last-admin lockout guard, role-change audit, pagination/search params.
