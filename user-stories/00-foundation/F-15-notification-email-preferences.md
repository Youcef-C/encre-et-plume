# F-15 — Notification & e-mail preferences

**As a** logged-in user, **I want** per-type notification settings for in-app and e-mail channels — and a working unsubscribe link in every non-essential e-mail — **so that** I control what reaches me and the platform respects opt-outs.

> Screen(s): none drawn (a "Notifications" section in account settings — to be designed) · Priority: Should · Fidelity: Inferred

## Frontend
- **"Préférences de notification"** settings section: a matrix of notification types × channels (Dans l'app / E-mail), each a labelled toggle. Types grouped in French, e.g. "Messages", "Demandes & candidatures", "Nouveaux chapitres des créateur·rices suivi·es", "Soutiens & dons", "Actualités & concours".
- Transactional/security items (reçus de paiement, sécurité du compte, modération) are listed but **locked on** with the note "Toujours envoyé" — they cannot be disabled.
- Changes save immediately (optimistic toggle + revert on error) with a confirmation toast "Préférences enregistrées."
- **Unsubscribe landing** (`/desabonnement?token=…`, public): one-click confirmation "Vous ne recevrez plus ces e-mails." with a link to the full preferences when logged in.
- States: loading skeleton, save error (toast + revert), unsubscribe success/invalid-token.
- Accessibility: toggles are labelled switches grouped under fieldset legends; state changes announced.
- Responsive: matrix stacks to a single column at 375 px; usable at 768/1280 px.

## Backend
- Entity **NotificationPreference**: `{ accountId, type, channel (in_app|email), enabled }` — unique `(accountId, type, channel)`; absent row = default (defaults defined per type in shared contracts).
- **GET /me/notification-preferences** — full matrix with defaults applied.
- **PATCH /me/notification-preferences** — `{ changes: [{ type, channel, enabled }] }`.
- **POST /unsubscribe** — `{ token }`, public; token identifies `(accountId, type-group)` (signed, no login required — standard e-mail unsubscribe UX); disables the matching e-mail preferences.
- Business rules:
  - Every **non-transactional** e-mail sent via [[F-16]] includes an unsubscribe link (signed token) and a `List-Unsubscribe` header; the e-mail dispatcher checks `NotificationPreference` **before** enqueueing/sending — an opted-out mail is never sent.
  - In-app fan-out ([[F-5]]) checks the `in_app` channel the same way.
  - Transactional/security/moderation notices are exempt from opt-out (legal or safety necessity) and marked as such in the [[F-16]] catalog.
- Validation: `type`/`channel` from allowed enums; unsubscribe token signature + TTL verified.
- Authorization: preferences strictly self-service (authenticated account); unsubscribe public via signed token.
- Side effects: `ActionLogService.record()` emits `preferences_update` ([[AD-10]] — already an `ActionType`).
- Shared contracts in `packages/shared/src/notification-preferences.ts` (`NOTIFICATION_TYPES` with per-type metadata `{ group, defaultInApp, defaultEmail, mandatory }`, DTOs) + barrel export.

## Dependencies
- [[F-5]] — the in-app notification system whose fan-out these preferences filter.
- [[F-16]] — the e-mail catalog declares each e-mail's type + mandatory flag; its dispatcher enforces the opt-outs.
- [[F-8]] — e-mail jobs run on the `email` queue.
- [[F-1]] — authenticated settings surface.

## Notes
- Inferred: no prototype frame — the settings section reuses profile-settings patterns and manga-zine tokens.
- Compliance: unsubscribe on every marketing/engagement e-mail is a legal requirement (and deliverability basic); enforcement lives server-side at dispatch, not in the client.
