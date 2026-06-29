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

## Key cross-epic dependencies
- [[AD-3]] — Editor verification gates the `editor` role surfaced in F-2/F-3.
- [[MC-2]] — Matching consumes the "Genres & affinités" tags edited in F-3.
- [[PE-1]] / [[PE-7]] / [[AD-1]] — Role-gated spaces linked from the F-4 header / F-2 gating.
- [[DR-2]] — Catalog filtering relates to F-7 global search.
- [[DR-8]], [[MC-6]], [[MC-7]], [[PUB-4]], [[MC-3]], [[MC-8]], [[MR-1]] — Linked from header (F-4) and profile actions (F-3).
