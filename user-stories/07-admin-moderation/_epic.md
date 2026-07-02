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
- [[AD-10]] — User action log "Journal d'activité"
- [[AD-11]] — Message oversight (private messages & salon chat)
- [[AD-12]] — Financial administration "Finances"
- [[AD-13]] — Graduated sanctions & appeals

## Cross-epic dependencies
- [[F-1]] Account, [[F-2]] Roles, [[F-5]] Notifications
- [[DR-3]] Work page, [[DR-6]] Illustration detail
- [[PUB-2]] Comments, [[PUB-3]] Reviews, [[PUB-6]] Report, [[PUB-7]] Contest participation, [[PUB-8]] News feed
- [[PE-1]] Editor space access, [[PE-6]] Branded contests

## Notes
- Explicit: AD-1 through AD-6 are anchored on drawn surfaces — the console tabs ("Signalements [4] · Utilisateurs · Comptes éditeurs · Contenus"), the reports table, the "comptes éditeurs en attente" callout, the inline admin bars/visibility filter, the contextual `data-adminctl` controls, and the "⛔ Bannir l'auteur·rice" affordance.
- Inferred: AD-7 (stats), AD-8 (articles), AD-9 (contests) exist only as prototype tab CSS / modal hooks (`data-adminview=stats`, `data-article-modal`/`data-artedit`, `concours` tab) with no rendered frames — kept deliberately conservative.
- Inferred: AD-10 (user action log) has no drawn frame — it's a new "Journal d'activité" tab inside the PANNEAU ADMIN console plus a user-facing "Mon activité" self view; it generalises the narrow per-action audits (AD-1 role changes, AD-5 moderation, AD-6 bans) into one queryable per-user timeline.
- Inferred: AD-11 (message oversight) has no drawn frame — a read-only staff surface giving admins/maintainers access to private DMs and salon/project chats ([[MC-9]], [[CS-8]]), a deliberate role-gated exception to the participant-only read rule; every access is logged via [[AD-10]].
- Inferred: AD-12 (financial administration) has no drawn frame — an `admin`-only "Finances" tab covering platform-wide transactions, refund decisions ([[MR-7]]), Stripe disputes, payout freezes and balance adjustments ([[MR-6]]); every action is money-safe per [[F-8]] and logged via [[AD-10]].
- Inferred: AD-13 (sanctions & appeals) has no drawn frame — it generalises the AD-6 ban into graduated levels (avertissement / suspension / bannissement) and adds the user-facing appeal flow.
