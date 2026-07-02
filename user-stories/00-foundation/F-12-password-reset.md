# F-12 — Password reset "Mot de passe oublié"

**As a** user who forgot my password, **I want** to request a reset link by e-mail and choose a new password, **so that** I can regain access to my account without contacting support.

> Screen(s): none drawn (request + reset forms — to be designed) · Priority: Must · Fidelity: Inferred

## Frontend
- "Mot de passe oublié ?" link on the login form ([[F-1]]) → request form: e-mail field + "Envoyer le lien".
- Request result is **non-enumerating**: always show "Si un compte existe pour cette adresse, un e-mail de réinitialisation a été envoyé." regardless of whether the e-mail matches an account.
- Reset route (e.g. `/reinitialiser-mot-de-passe?token=…`): new password + confirmation fields, "Réinitialiser le mot de passe" submit; on success, "Mot de passe mis à jour — reconnectez-vous." and redirect to login.
- States:
  - Request: submitting, sent confirmation, rate-limited message.
  - Reset: submitting, success, invalid/expired token ("Lien invalide ou expiré." + link back to the request form), mismatch/weak-password inline errors in French.
- Accessibility: labelled inputs, focus management on error, forms submittable via keyboard; outcome announced.
- Responsive: both forms usable at 375/768/1280 px; manga-zine tokens reused.

## Backend
- Entity **PasswordResetToken**: `{ id, accountId, tokenHash, expiresAt, consumedAt?, createdAt }` — hashed token, single-use, short TTL (e.g. 1 h). Same shape/conventions as [[F-11]]'s token.
- **POST /auth/password-reset/request** — `{ email }`, public; if the account exists, issues a token and enqueues the reset e-mail ([[F-8]] `email` queue, template in [[F-16]]). **Always returns 200** with the same body (no account enumeration). Rate-limited per e-mail + per IP (Redis).
- **POST /auth/password-reset/confirm** — `{ token, newPassword }`, public; validates hash + TTL + single-use, updates the credential, consumes the token.
- Business rules: on success, **invalidate all existing sessions** for the account (Redis session denylist, [[F-1]]) and any outstanding reset tokens; send a "password changed" notice e-mail ([[F-16]]).
- Validation: password strength rules (shared with signup); token errors distinct but non-leaking; rate limits server-side.
- Authorization: both endpoints public — the token is the credential; everything enforced server-side.
- Side effects: `ActionLogService.record()` emits `password_reset` with `ip`/`userAgent` ([[AD-10]]); notification e-mail via [[F-8]]/[[F-16]].
- Shared contracts in `packages/shared/src/auth.ts` (extend with reset DTOs).

## Dependencies
- [[F-1]] — accounts, credentials, and the Redis session store this flow invalidates (its "no password reset" exclusion is lifted by this story).
- [[F-8]] — e-mail delivery on the `email` queue.
- [[F-16]] — reset + password-changed e-mail templates.

## Notes
- Inferred: no prototype frame — forms reuse the login form patterns and manga-zine tokens.
- Security: non-enumerating responses, hashed single-use short-TTL tokens, global session invalidation on success, and rate limiting are all required, not optional.
