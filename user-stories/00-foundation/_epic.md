# Epic 00 — Foundation

**Goal:** Establish the cross-cutting plumbing every other epic depends on: identity (sign-up/login/session), the role model that gates access to specialized spaces, the public creator profile that anchors the platform's social and matching features, the persistent navigation header, the notification/badge system, theming, and global search. These stories define the account, the roles, and the shell that all of "Encre & Plume" hangs from.

## Personas
- **Visitor** — unauthenticated browser.
- **Reader** (lecteur·rice) — consumes works.
- **Writer** (scénariste) / **Illustrator** (dessinateur·rice) — collectively **Creator**.
- **Publisher/Editor** (role `editor`, requires admin verification).
- **Editorial staff** (role `maintainer` / rédaction).
- **Admin**.

## Stories (ordered)
- F-1 — Account sign-up & login
- F-2 — Role model & differentiated access
- F-3 — Creator profile & portfolio
- F-4 — Global navigation header
- F-5 — Notifications & unread badges
- F-6 — Light/Dark theme
- F-7 — Global search
- F-8 — Background job queue & reliable processing *(technical / infra)*
- F-9 — Observability: metrics, error tracking & alerts *(technical / infra)*
- F-10 — Media storage, uploads & delivery (object storage + CDN) *(technical / infra)*
- F-11 — Email verification
- F-12 — Password reset "Mot de passe oublié"
- F-13 — Legal consent & pages (CGU, confidentialité, cookies)
- F-14 — RGPD: account deletion & data export
- F-15 — Notification & e-mail preferences
- F-16 — Transactional e-mail catalog & delivery *(technical / infra)*
- F-17 — Onboarding flow (first run)
- F-18 — Account security (credentials, sessions, 2FA — 2FA strictly opt-in)
- F-19 — Application settings "Paramètres" (structured settings page hosting Apparence / Notifications / Cookies / Sécurité incl. optional 2FA / Mes données)
- F-20 — Genre vocabulary & tag picker (shared genres.json base; fixes free-text tag inputs)
- F-21 — Support & contact (aide page, contact/support form, bug report → staff via queue+email)
- F-22 — Clickable genre tags & freetext illustration hashtags
- F-23 — Mesure d'audience sans cookie (événements, agrégats, conversion)
- F-24 — SEO : indexabilité et Search Console

## Key cross-epic dependencies
- [[AD-3]] — Editor verification gates the `editor` role surfaced in F-2/F-3.
- [[MC-2]] — Matching consumes the "Genres & affinités" tags edited in F-3.
- [[PE-1]] / [[PE-7]] / [[AD-1]] — Role-gated spaces linked from the F-4 header / F-2 gating.
- [[DR-2]] — Catalog filtering relates to F-7 global search.
- [[DR-8]], [[MC-6]], [[MC-7]], [[PUB-4]], [[MC-3]], [[MC-8]], [[MR-1]] — Linked from header (F-4) and profile actions (F-3).
