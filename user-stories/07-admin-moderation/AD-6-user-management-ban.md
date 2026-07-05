# AD-6 — User management & ban

**As an** Admin, **I want** to browse users and ban an author with a recorded reason and context, **so that** repeat or serious offenders are removed from the platform.

> Screen(s): "Utilisateurs" tab of "Administration & modération"; ban modal (`openBan`) reachable from "⛔ Bannir l'auteur·rice" · Priority: Must · Fidelity: Explicit

## Frontend

- "Utilisateurs" tab: searchable/filterable user list showing name, role, status (active/banned), and join date; per-user actions including role switcher ([[AD-1]]) and "⛔ Bannir l'auteur·rice".
- Ban modal (`openBan`), triggered from the user row or from the inline admin bar on a profile/work/illustration ([[AD-4]]):
  - Body (inferred): reason/motif field, context indicator of where it was triggered (profil / œuvre / illustration), optional scope/duration, and confirm/cancel.
  - "Bannir" selects the duration and submits the ban; banned users are flagged in the list with an "Débannir"/unban action.
- States:
  - Empty: "Aucun utilisateur" for an empty search/filter result.
  - Loading: skeleton list; spinner on ban/unban submit.
  - Error: toast on failure; user state unchanged.
- Validation: ban requires a reason; confirm the destructive action; cannot ban another admin without explicit elevation.
- Accessibility: search input labelled; modal is focus-trapped with a clear title; banned status has a text label; action buttons named with the target user.

## Backend

- **GET /admin/users?search=&role=&status=&page=** — paginated users (shared with [[AD-1]]).
- **POST /admin/users/{userId}/ban** — `{ reason, scope?, sourceContext? (profil|oeuvre|illustration), sourceId? }`.
- **POST /admin/users/{userId}/unban** — lifts the ban.
- Entity **User**: `status (active|banned), bannedBy, bannedAt, banReason, banScope?`; **BanAudit** record per action.
- Business rules: a banned user's content is hidden/locked from public surfaces and they cannot sign in / publish / comment; unban restores access and content visibility (subject to any separate content revocations, [[AD-4]]).
- Validation: `reason` required; cannot ban the last admin / self.
- Authorization: `admin` ([[F-2]]).
- Side effects: notify the banned user with reason ([[F-5]]); cascade-hide their content; often invoked from a report resolution ([[AD-2]]) or content admin bar ([[AD-4]]).

## Dependencies

- [[AD-1]] — host tab + shared user list & role switcher.
- [[AD-4]] — "⛔ Bannir l'auteur·rice" entry point + content cascade.
- [[AD-2]] — ban as a report action.
- [[F-2]] — authorization; [[F-5]] — ban notification.

## Notes

- Explicit: "⛔ Bannir l'auteur·rice", the ban modal trigger (`openBan`), the "Utilisateurs" tab, and the profil/œuvre/illustration context.
- Inferred: ban modal body fields, scope/duration, unban, content cascade, search/filter params.
- The "optional scope/duration" hint is generalised by [[AD-13]] into graduated sanctions (warning / temporary suspension / ban) with a user-facing appeal flow; ban here = the top level.
- Ban ≠ erasure: user-initiated RGPD account deletion is [[F-14]].
