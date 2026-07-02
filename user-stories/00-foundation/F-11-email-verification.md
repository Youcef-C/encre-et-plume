# F-11 — Email verification

**As a** new user, **I want** to confirm my e-mail address after signing up, **so that** the platform knows my address is real and can safely send me account, security, and transactional e-mails.

> Screen(s): none drawn (verification banner + confirmation landing — to be designed) · Priority: Must · Fidelity: Inferred

## Frontend
- After signup ([[F-1]]), show a non-blocking banner "Vérifiez votre adresse e-mail — un lien de confirmation vous a été envoyé." with a "Renvoyer l'e-mail" action (rate-limited client-side feedback).
- Confirmation landing route (e.g. `/verifier-email?token=…`): consumes the token and shows success "Adresse e-mail vérifiée !" or failure "Lien invalide ou expiré." with a "Renvoyer l'e-mail" action when logged in.
- Unverified-state limits surfaced contextually: actions gated on verification (see Backend) show an inline prompt "Confirmez votre e-mail pour continuer." instead of the action.
- States:
  - Pending: banner visible while `emailVerifiedAt` is null.
  - Resend: success toast "E-mail envoyé." / cooldown message if rate-limited.
  - Error: invalid/expired token view with recovery action.
- Accessibility: banner is a labelled status region; landing outcome announced; actions keyboard-reachable.
- Responsive: banner and landing render cleanly at 375/768/1280 px; manga-zine tokens reused.

## Backend
- Entity **EmailVerificationToken**: `{ id, accountId, tokenHash, expiresAt, consumedAt?, createdAt }` — store a **hash** of the token, never the raw value; single-use; TTL (e.g. 24 h).
- `Account.emailVerifiedAt?` timestamp (null = unverified).
- **POST /auth/verify-email/request** — authenticated; issues a token and enqueues the verification e-mail on the [[F-8]] `email` queue (template defined in [[F-16]]). Rate-limited (e.g. 1/min, 5/day per account).
- **POST /auth/verify-email/confirm** — `{ token }`, public; validates hash + TTL + single-use, sets `emailVerifiedAt`, consumes the token.
- Signup ([[F-1]]) automatically issues the first token; changing e-mail ([[F-18]]) resets `emailVerifiedAt` and re-triggers verification.
- Business rules: unverified accounts can browse and read, but verification is required before actions that send e-mail to others or move money — publishing ([[PUB-1]]), paying ([[MR-1]]/[[MR-3]]), and payouts ([[MR-6]]) (conservative default; product may relax).
- Validation: token format checked; expired/consumed tokens rejected with a distinct error; resend rate limits enforced server-side (Redis).
- Authorization: request = authenticated; confirm = public (token is the credential). Enforced server-side ([[F-2]]).
- Side effects: `ActionLogService.record()` emits `email_verified` ([[AD-10]]); verification e-mail sent via [[F-8]]/[[F-16]].
- Shared contracts in `packages/shared/src/auth.ts` (extend with verification DTOs).

## Dependencies
- [[F-1]] — account + signup hook issuing the first token (its "no email verification" exclusion is lifted by this story).
- [[F-8]] — e-mail delivery runs on the `email` queue.
- [[F-16]] — the verification e-mail template/trigger catalog.
- [[F-2]] — server-side gating of verification-required actions.

## Notes
- Inferred: no prototype frame — banner and landing reuse the drawn alert/toast patterns and manga-zine tokens.
- Security: raw tokens never stored or logged; hash comparison in constant time; rate limits back on Redis like [[F-1]] login limits.
- Open question: exact set of verification-gated actions is a product decision; the money + outbound-email gates above are the conservative floor.
