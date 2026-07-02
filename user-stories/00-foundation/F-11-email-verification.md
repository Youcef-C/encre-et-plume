# F-11 — Email verification (blocking)

**As a** new user, **I want** to confirm my e-mail address before my account becomes usable — landing in onboarding right after I click the link — **so that** every active account has a real, owned address from day one.

> Screen(s): none drawn ("Vérifiez votre e-mail" page + confirmation landing — to be designed) · Priority: Must · Fidelity: Inferred

## Frontend
- **Post-signup page** — signup ([[F-1]]) does NOT enter the app; it lands on a "Vérifiez votre e-mail" page: "Un lien de confirmation vous a été envoyé à **{email}**." with a "Renvoyer l'e-mail" action (rate-limited feedback) and a link back to login.
- **Blocked login** — logging in with an unverified account shows the same page/message instead of a session: "Confirmez votre e-mail pour continuer." + "Renvoyer l'e-mail".
- **Confirmation landing** (`/verifier-email?token=…`): consumes the token; on success "Adresse e-mail vérifiée !" then **redirects into onboarding ([[F-17]])** with a session started (the emailed link proves ownership and signs the user in); on failure "Lien invalide ou expiré." with a resend affordance (asks for the e-mail if no session).
- States:
  - Link-sent page: idle / resend success "E-mail envoyé." / resend cooldown (429).
  - Landing: verifying (loading) / success (→ redirect) / invalid-expired (recovery).
- Accessibility: page outcome announced; actions labelled and keyboard-reachable; the redirect is announced before it happens.
- Responsive: both pages render cleanly at 375/768/1280 px; manga-zine tokens reused.

## Backend
- Entity **EmailVerificationToken**: `{ id, accountId, tokenHash, expiresAt, consumedAt?, createdAt }` — store a **hash** of the token, never the raw value; single-use; TTL (e.g. 24 h).
- `Account.emailVerifiedAt?` timestamp (null = unverified).
- **Signup ([[F-1]]) returns NO session** — it creates the account, issues the first token, enqueues the verification e-mail ([[F-8]] `email` queue, template per [[F-16]]), and returns a "verification required" response carrying only the e-mail for the link-sent page.
- **Login blocks unverified accounts** — valid credentials + `emailVerifiedAt = null` → 403 `EMAIL_NOT_VERIFIED` (never a session); the FE routes to the link-sent page.
- **POST /auth/verify-email/request** — `{ email }`, public (no session exists yet); non-enumerating like [[F-12]] (always the same 200); issues a fresh token when the account exists and is unverified. Rate-limited per e-mail + per IP (Redis).
- **POST /auth/verify-email/confirm** — `{ token }`, public; validates hash + TTL + single-use, sets `emailVerifiedAt`, consumes the token, **and returns a session** (the emailed token is the credential) so the FE can enter onboarding ([[F-17]]) directly.
- Changing e-mail ([[F-18]]) resets `emailVerifiedAt` and re-triggers verification (the account holder keeps their session; only the new address is re-proven).
- Server-side enforcement everywhere: guards must not rely on the FE — an unverified account never receives a session from signup or login, so no unverified session exists to gate (the reusable verified-guard stays for the [[F-18]] e-mail-change window).
- Validation: token format checked; expired/consumed tokens rejected with a distinct error; resend rate limits enforced server-side (Redis).
- Authorization: request + confirm public (token/e-mail are the credentials); everything enforced server-side ([[F-2]]).
- Side effects: `ActionLogService.record()` emits `email_verified` ([[AD-10]]); verification e-mail sent via [[F-8]]/[[F-16]].
- Shared contracts in `packages/shared/src/auth.ts` (verification DTOs incl. the sessionless signup response and `EMAIL_NOT_VERIFIED`).

## Dependencies
- [[F-1]] — signup lands on the link-sent page instead of a session; login gains the `EMAIL_NOT_VERIFIED` branch.
- [[F-17]] — the confirmation landing redirects into onboarding with the fresh session.
- [[F-8]] — e-mail delivery runs on the `email` queue.
- [[F-16]] — the verification e-mail template/trigger catalog.
- [[F-2]] — server-side enforcement.

## Notes
- Inferred: no prototype frame — pages reuse the auth-card patterns and manga-zine tokens.
- Security: raw tokens never stored or logged; hash comparison in constant time; non-enumerating resend; rate limits on Redis like [[F-1]]/[[F-12]]. Confirm returning a session is safe because the token proves e-mail ownership — same trust as a password-reset link.
- **Revision (2026-07-02)**: upgraded from the original non-blocking model (banner + browse-while-unverified) to this blocking model per product decision: no session until the link is clicked; the click redirects into onboarding. The token machinery, resend rate limits, landing route, and dev/e2e seam of the first implementation carry over; the banner and the "unverified can browse" rules are superseded.
