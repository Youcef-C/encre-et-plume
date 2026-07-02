# F-18 — Account security (change credentials, sessions, 2FA)

**As a** user — especially a creator earning money here — **I want** to change my e-mail and password, see and revoke my active sessions, and optionally enable two-factor authentication, **so that** my account and earnings stay under my control.

> Screen(s): none drawn (a "Sécurité" section in account settings — to be designed) · Priority: Could · Fidelity: Inferred

## Frontend
- **"Sécurité"** settings section with three blocks:
  - **Identifiants**: "Modifier l'adresse e-mail" (new e-mail + current password → verification of the new address before switch) and "Modifier le mot de passe" (current + new + confirmation).
  - **Sessions actives**: list of sessions (appareil/navigateur, localisation approx., "Dernière activité", badge "Session actuelle") with per-row "Déconnecter" and a global "Déconnecter toutes les autres sessions".
  - **Double authentification (2FA)** — strictly **optional / opt-in** (never forced, never required at signup or login unless the user enabled it; disabled by default): enable flow — QR code + manual secret for a TOTP app, confirm with a first code, then display one-time **codes de secours** ("Conservez-les précieusement — ils ne seront plus affichés."); disable flow requires password + a valid code. The activation toggle lives in the [[F-19]] settings page ("Paramètres").
- Login ([[F-1]]) gains a 2FA step when enabled: "Code de vérification" input + "Utiliser un code de secours" fallback.
- States: each block loading/saving/error; e-mail change pending-verification state; 2FA setup/confirm/enabled/disabled; session revoke spinner.
- Accessibility: forms labelled; QR code has a copyable text alternative; backup codes selectable/copyable; destructive actions confirmed.
- Responsive: settings blocks and login step usable at 375/768/1280 px.

## Backend
- **PATCH /me/email** — `{ newEmail, password }`; sends verification to the NEW address ([[F-11]] token flow); the switch commits only on confirmation; notice e-mail to the OLD address ([[F-16]]).
- **PATCH /me/password** — `{ currentPassword, newPassword }`; invalidates all other sessions; "password changed" notice ([[F-16]]).
- **GET /me/sessions** / **DELETE /me/sessions/:id** / **DELETE /me/sessions** (others) — backed by the Redis session store ([[F-1]]); sessions carry `userAgent`, `ip`, `lastSeenAt`.
- **2FA (TOTP)**: **POST /me/2fa/setup** (returns provisioning URI + secret, pending state) → **POST /me/2fa/confirm** `{ code }` (activates, returns hashed-stored backup codes once) → **POST /me/2fa/disable** `{ password, code }`. Login flow: password OK + 2FA enabled → short-lived challenge, **POST /auth/2fa/verify** `{ challengeToken, code }` completes the session; backup codes single-use.
- Entity **TwoFactorCredential**: `{ accountId, secretEncrypted, enabledAt, backupCodeHashes[] }`; secret encrypted at rest, never logged ([[F-9]] redact).
- Business rules: all three blocks require a fresh password proof for sensitive changes; rate-limit code attempts (Redis); e-mail change resets `emailVerifiedAt` until the new address confirms ([[F-11]]).
- Validation: password strength shared with [[F-1]]/[[F-12]]; TOTP window ±1 step; session ids validated as the caller's own.
- Authorization: strictly self-service, authenticated ([[F-2]]).
- Side effects: `ActionLogService.record()` emits `email_change`, `password_change`, `session_revoked`, `2fa_enabled`, `2fa_disabled` with `ip`/`userAgent` ([[AD-10]]).
- Shared contracts in `packages/shared/src/security.ts` (DTOs) + barrel export.

## Dependencies
- [[F-19]] — the "Paramètres" settings page hosts this story's "Sécurité" section (incl. the optional 2FA activation).
- [[F-1]] — credentials + the Redis session store this story surfaces and revokes.
- [[F-11]] — e-mail change reuses the verification token flow.
- [[F-12]] — shared password rules; both flows invalidate sessions the same way.
- [[F-16]] — security notice e-mails.

## Notes
- Inferred: no prototype frame — settings blocks reuse profile-settings patterns and manga-zine tokens.
- Priority "Could": ship after the Must-level auth stories; creators handling money ([[MR-6]]) are the audience that justifies 2FA.
