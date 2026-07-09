# F-19 — Application settings "Paramètres"

**As a** logged-in user, **I want** one organized "Paramètres" page grouping all my application configuration — appearance, notifications, cookies, security (incl. optional 2FA activation), and my data — **so that** every setting has a predictable home instead of being scattered across the app.

> Screen(s): `/parametres` (exists since F-14, grown ad hoc — this story structures it) · Priority: Should · Fidelity: Inferred

## Frontend
- `/parametres` becomes a **sectioned settings page** with an in-page section nav (anchor links or tabs; stacked accordion on mobile). Sections, in order, with French headings:
  - **"Apparence"** — the theme preference (Clair / Sombre / Système) as a labelled control persisting via the existing [[F-6]] preference (same mechanism as the header toggle; both stay in sync).
  - **"Préférences de notification"** — the existing [[F-15]] matrix (moved into this section, unchanged).
  - **"Confidentialité"** (user-specified 2026-07-09) — **"Qui peut m'envoyer des messages"** as an on-brand single-select (`OnBrandSelect`): **Tout le monde / Demandes de message** (default) **/ Contacts uniquement** — governs how a new DM from a non-contact is handled ([[MC-9]]). (Room for other privacy toggles later; DM policy is the first.)
  - **"Cookies"** — current consent summary per category + a "Gérer les cookies" button reopening the [[F-13]] banner/panel.
  - **"Sécurité"** — hosts [[F-18]]: "Modifier l'adresse e-mail", "Modifier le mot de passe", "Sessions actives", and the **optional** "Double authentification (2FA)" activation block (état "Désactivée" by default, "Activer" starts the [[F-18]] TOTP flow; "Désactiver" per F-18 rules). Until F-18 is implemented, the section renders the placeholders the F-18 build replaces.
  - **"Mes données"** — the existing [[F-14]] export + deletion blocks (moved into this section, unchanged).
- Section nav: current section indicated; keyboard navigable; headings are real landmarks (`h2` per section).
- States: each section keeps its own states (delegated to its story); the page itself handles loading (session) and logged-out redirect to `/connexion` (existing behavior).
- Accessibility: one `h1` "Paramètres"; section nav labelled; controls keep their per-story a11y.
- Responsive: section nav collapses gracefully at 375 px (no horizontal overflow); usable at 768/1280 px.

## Backend
- No new entities. This story is a **surface reorganization**: it consumes existing endpoints —
  - theme: `PATCH /accounts/me/preferences` ([[F-6]]),
  - notifications: `GET/PATCH /me/notification-preferences` ([[F-15]]),
  - privacy: the DM-privacy preference (`dmPolicy: 'anyone'|'requests'|'contacts'`, default `'requests'`) persisted on the account/preferences and read by [[MC-9]] when routing a new DM (this story adds that one preference field + control),
  - cookies: client-side consent state ([[F-13]]),
  - data: `GET/POST /me/data-export`, `DELETE /me/account` ([[F-14]]),
  - security: the [[F-18]] endpoints when that story lands.
- Business rule: 2FA remains **opt-in** — no server flow may require it for accounts that never enabled it ([[F-18]]).
- Authorization: the page is authenticated; each section's endpoints keep their own guards ([[F-2]]).

## Dependencies
- [[F-14]] — created `/parametres` and the "Mes données" blocks this story re-homes.
- [[F-15]] — the notification-preferences matrix re-homed here.
- [[F-13]] — cookie consent state + banner reopening.
- [[F-6]] — the theme preference surfaced as an "Apparence" section.
- [[F-18]] — fills the "Sécurité" section (optional 2FA activation lives there).

## Notes
- Inferred: no prototype frame — the page reuses the manga-zine card/section patterns; keep it quiet and scannable.
- Deliberately thin: no new data model, no new endpoints — structure + the "Apparence" and "Cookies" sections are the only net-new UI; everything else is re-homed from F-13/F-14/F-15 without behavior change.
- Ordering: build AFTER [[F-18]] closes the epic — F-18 lands its Sécurité machinery, F-19 organizes the whole page around it (F-18's placeholders clause above covers the reverse order if needed).
