# F-6 — Light/Dark theme

**As a** logged-in user, **I want** to switch between light and dark themes and have my choice remembered, **so that** the interface matches my preference and environment.

> Screen(s): avatar menu theme toggle · Priority: Should · Fidelity: Explicit

## Frontend
- [ ] Theme toggle in the avatar dropdown (see [[F-4]]): actions "setLight" / "setDark".
- [ ] Applying a theme re-skins the whole app immediately (no reload).
- [ ] Initial theme respects the system default (prefers-color-scheme) until the user sets an explicit preference.
- [ ] Persist the chosen preference per user across sessions and devices.
- [ ] States: light active, dark active, "system" (no explicit choice yet).
- [ ] Accessibility: toggle labelled and operable by keyboard; sufficient contrast maintained in both themes.

## Backend
- [ ] PATCH /accounts/me/preferences — body { theme: "light" | "dark" | "system" } persists the preference.
- [ ] GET /auth/me includes preferences.theme.
- [ ] Entity: Account.preferences.theme.
- [ ] Business rules: absent/"system" → resolve from system default at render time.
- [ ] Authorization: user updates only their own preference.

## Dependencies
- [[F-4]] — toggle lives in the avatar dropdown.
- [[F-1]] — preference persists on the account.

## Notes
- Explicit: theme toggle (setLight/setDark) is present in the prototype.
- Per-user persistence and "respect system default initially" are stated in the design; client-only fallback (e.g. localStorage) is acceptable if account-level persistence is deferred.
