# AD-13 — Graduated sanctions & appeals

**As an** Admin or editorial staff (`maintainer`), **I want** graduated enforcement — warning, temporary suspension, ban — and a user-facing appeal flow, **so that** moderation is proportionate and contestable instead of ban-or-nothing.

> Screen(s): extends the [[AD-6]] ban modal + a user-facing "Sanction" notice & appeal form (not drawn) · Priority: Should · Fidelity: Inferred

## Frontend
- **Staff side** — the [[AD-6]] modal becomes a sanction modal with a level selector: "Avertissement", "Suspension temporaire" (durée: 24 h / 7 j / 30 j), "Bannissement définitif"; motif obligatoire; context preserved (profil / œuvre / illustration / signalement).
  - The [[AD-6]] "Utilisateurs" tab shows the sanction state ("Actif", "Averti", "Suspendu jusqu'au {date}", "Banni") and a per-user sanction history (from [[AD-10]] data).
  - **Appeals queue**: an "Appels" list (inside the Utilisateurs tab or the [[AD-2]] queue pattern): pending appeals with the sanction, the user's message, and "Maintenir" / "Réduire" / "Lever" actions + response note.
- **User side** — a sanctioned user sees, at login or on the blocked action, a clear notice: level, motif, durée ("Votre compte est suspendu jusqu'au {date}."), and — once per sanction — "Faire appel" → a form (message, max length) with state "Appel envoyé — en cours d'examen." Warnings are an in-app notice to acknowledge ("J'ai compris").
- States: modal per level; appeal form idle/submitted/decided (decision + note shown); queues loading/empty ("Aucun appel en attente.")/error.
- Accessibility: sanction notice readable and announced; appeal form labelled; staff actions named with the target user; statuses text-labelled.
- Responsive: notice, form, and staff queue usable at 375/768/1280 px.

## Backend
- Entity **Sanction**: `{ id, userId, level (warning|suspension|ban), reason, sourceContext?, sourceId?, startsAt, endsAt? (null = permanent), issuedBy, liftedAt?, liftedBy?, createdAt }` — generalises [[AD-6]]'s ban fields; `User.status` derives from the active sanction (index `(userId, endsAt)`).
- Entity **Appeal**: `{ id, sanctionId, userId, message, status (pending|upheld|reduced|lifted), decidedBy?, decisionNote?, decidedAt?, createdAt }` — one appeal per sanction.
- **POST /admin/users/:id/sanctions** — `{ level, reason, durationHours?, sourceContext?, sourceId? }` (supersedes the bare ban endpoint; [[AD-6]] ban = `level: ban`).
- **POST /admin/sanctions/:id/lift** — early lift (unban/unsuspend) with motif.
- **GET /admin/appeals?status=** / **PATCH /admin/appeals/:id** — `{ status, decisionNote }`; "réduire" adjusts the sanction (`endsAt`), "lever" lifts it.
- **GET /me/sanctions** — the caller's active/past sanctions + appeal state; **POST /me/sanctions/:id/appeal** — `{ message }`.
- Business rules: suspension blocks the same surfaces as ban (sign-in allowed but read-only: no publish/comment/message/pay) until `endsAt`, then auto-expires (checked at request time — no cron needed); warnings don't restrict, they're recorded and acknowledged; ban keeps [[AD-6]] semantics (content cascade-hide); one pending appeal per sanction; appeal decisions are final (no re-appeal).
- Validation: `level`/`status` enums; `durationHours` required for suspensions; reason + appeal message required, length-capped.
- Authorization: sanctions + appeals staff = `admin` and `maintainer` except permanent bans stay `admin`-only ([[AD-6]]); self endpoints strictly self ([[F-2]]).
- Side effects: sanction + decision notify the user with the motif ([[F-5]], e-mail via [[F-16]]); every action logs to [[AD-10]] (`sanction_issued`, `sanction_lifted`, `appeal_decided`); reports resolution ([[AD-2]]) can issue any level, not just ban.
- Shared contracts in `packages/shared/src/sanctions.ts` (enums, DTOs) + barrel export.

## Dependencies
- [[AD-6]] — the ban machinery this story generalises (modal, status, cascade, guards: no self/last-admin sanction).
- [[AD-2]] — report resolutions issue sanctions at any level.
- [[AD-10]] — sanction history + audit trail.
- [[F-5]] / [[F-16]] — sanction and appeal-decision notifications.

## Notes
- Inferred: no prototype frame — extends the drawn ban modal (`openBan`) and "Utilisateurs" tab; the user-facing notice reuses the alert/modal patterns.
- [[AD-6]]'s "optional scope/duration" hint becomes the explicit suspension level here; existing bans migrate as `level: ban` sanctions.
- DSA alignment: users get the motif and a contestation path for every restriction — this story is that path.
