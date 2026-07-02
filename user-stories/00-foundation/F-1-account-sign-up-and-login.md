# F-1 — Account sign-up & login

**As a** Visitor, **I want** to create an account, log in, and log out, **so that** the app can recognize me and attach my profile, role, and activity to a persistent identity.

> Screen(s): (no auth screen in prototype — to be designed) · Priority: Must · Fidelity: Inferred

## Frontend
- [ ] Sign-up form: at minimum display name and email; flag whether a password field is needed once auth method is confirmed.
- [ ] Sign-up username selector: a "Nom d'utilisateur (@)" field, pre-suggested from the display name (slugified), editable by the user — this IS the public handle/profile slug (`@yuki-moreau`, routes `/yuki-moreau`). Inline French feedback when taken ("Ce nom d'utilisateur est déjà pris.") or invalid format.
- [ ] Sign-up double password: "Mot de passe" + "Confirmer le mot de passe"; inline mismatch error "Les mots de passe ne correspondent pas." (client-side check; only the password is sent).
- [ ] Login form: identifier (email) + chosen credential; "remember me" optional.
- [ ] Logout action available from the avatar dropdown (see [[F-4]]).
- [ ] Validation: required fields, valid email format, display name non-empty; inline error messages in French.
- [ ] States: empty, submitting/loading, success (→ the "Vérifiez votre e-mail" link-sent page, [[F-11]] — no session until the e-mail is confirmed), error (e.g. "Identifiants invalides", "Cet e-mail est déjà utilisé").
- [ ] Login with an unverified account: no session — route to the [[F-11]] link-sent page ("Confirmez votre e-mail pour continuer." + resend).
- [ ] On success, the persistent header (see [[F-4]]) shows the round avatar; logged-out visitors see a sign-in entry point instead.
- [ ] Accessibility: labelled inputs, focus management on error, form submittable via keyboard.

## Backend
- [ ] POST /auth/signup — body { displayName, email, credential? } → creates account, returns session.
- [ ] POST /auth/login — body { email, credential? } → returns session/token.
- [ ] POST /auth/logout — invalidates current session.
- [ ] GET /auth/me — returns the current account (id, displayName, role, slug, avatar).
- [ ] Entity Account: id, displayName, email (unique), role (default `utilisateur`), profileSlug (unique; routes use slugs, e.g. `/yuki-moreau`), avatar, createdAt.
- [ ] Business rules: the signup body may carry a user-chosen `username` (the handle) — validate format (lowercase letters/digits/hyphens, 3–30 chars) and uniqueness (409 `USERNAME_TAKEN`); when absent, generate a unique profileSlug from displayName (de-duplicate on collision). Role defaults to `utilisateur`.
- [ ] Validation: unique email, valid email, non-empty displayName; `username` format + uniqueness when provided.
- [ ] Authorization: signup/login public; me/logout require a valid session.
- [ ] Side effects: create the backing creator profile record consumed by [[F-3]].

## Dependencies
- [[F-2]] — role field (default `utilisateur`) lives on the account created here.
- [[F-3]] — profile is keyed by the slug minted at sign-up.
- [[F-4]] — header reflects logged-in/out state and hosts logout.

## Notes
- Inferred: no auth/onboarding screen exists in the prototype or wireframes; the whole app assumes a logged-in user with an avatar.
- Open decision for designers: auth method — email/password vs OAuth/social (or magic link). Credential fields above are deliberately left abstract until confirmed.
- Keep scope minimal here: email verification is [[F-11]], password reset is [[F-12]], 2FA/session management is [[F-18]], first-run onboarding is [[F-17]], and the CGU-acceptance checkbox is [[F-13]] — this story ships bare signup/login/logout.
