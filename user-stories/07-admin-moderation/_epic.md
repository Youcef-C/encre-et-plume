# Epic 07 — Admin & Moderation

This epic covers the platform's trust-and-safety and operations console: the role-gated "Administration & modération" panel where admins and maintainers handle user reports, verify publisher accounts, moderate works/illustrations/comments/reviews, manage and ban users, oversee contests, author news, and read platform stats. It consumes the public-facing report flow ([[PUB-6]]), gates the publisher space ([[PE-1]]), and surfaces moderation controls inline on content pages ([[DR-3]], [[DR-6]], [[PUB-2]], [[PUB-3]]). It depends heavily on the role model ([[F-2]]) and feeds notifications ([[F-5]]).

## Personas
- **Admin** — full access to the console; manages roles, reports, content moderation, bans, contests, articles, stats.
- **Editorial staff (maintainer)** — elevated moderation role below admin; handles reports and content moderation.
- **Publisher/Editor** — subject of account verification ([[AD-3]]); creates contests overseen here ([[AD-9]]).
- **Creator** — subject of content revocation and bans ([[AD-4]], [[AD-6]]).
- **Reader** — files the reports that feed the queue ([[PUB-6]] → [[AD-2]]).

## Stories
- [[AD-1]] — Admin panel access & role management ("Panneau admin")
- [[AD-2]] — Reports handling "Signalements"
- [[AD-3]] — Editor-account verification "Comptes éditeurs"
- [[AD-4]] — Content moderation (works & illustrations)
- [[AD-5]] — Comment & review moderation
- [[AD-6]] — User management & ban
- [[AD-7]] — Platform stats
- [[AD-8]] — Article / news management
- [[AD-9]] — Contest administration

## Cross-epic dependencies
- [[F-1]] Account, [[F-2]] Roles, [[F-5]] Notifications
- [[DR-3]] Work page, [[DR-6]] Illustration detail
- [[PUB-2]] Comments, [[PUB-3]] Reviews, [[PUB-6]] Report, [[PUB-7]] Contest participation, [[PUB-8]] News feed
- [[PE-1]] Editor space access, [[PE-6]] Branded contests

## Notes
- Explicit: AD-1 through AD-6 are anchored on drawn surfaces — the console tabs ("Signalements [4] · Utilisateurs · Comptes éditeurs · Contenus"), the reports table, the "comptes éditeurs en attente" callout, the inline admin bars/visibility filter, the contextual `data-adminctl` controls, and the "⛔ Bannir l'auteur·rice" affordance.
- Inferred: AD-7 (stats), AD-8 (articles), AD-9 (contests) exist only as prototype tab CSS / modal hooks (`data-adminview=stats`, `data-article-modal`/`data-artedit`, `concours` tab) with no rendered frames — kept deliberately conservative.
