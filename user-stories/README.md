# Encre & Plume — User Stories Backlog

User stories derived from the **Encre & Plume** design (imported from Claude Design via the
`claude_design` MCP). **Encre & Plume** is a French manga-creator collaboration platform whose mission
is to grow the French manga market by connecting the whole chain:
**Find a partner → Create together → Publish & be read → Get scouted by a publisher.**

Each story is written for a future implementation as `As a … I want … so that …`, with separate
**Frontend** and **Backend** acceptance criteria, **Dependencies** (`[[ID]]` cross-references), and
**Notes** on fidelity. Stories are in English; French UI labels are quoted from the design.

## How this is organized
- One folder per **feature epic**. Each folder has an `_epic.md` overview + one `.md` per story.
- Story IDs (`F-1`, `DR-3`, `MC-2`, …) are stable and used for cross-references.
- **Fidelity** flag on every story:
  - **Explicit** — fully drawn in the prototype markup or a wireframe frame.
  - **Inferred** — intended by the design but evidenced only by navigation handlers, CSS
    route/tab/modal scaffolding, or the pitch deck (no rendered frame). Criteria are conservative and
    the open questions are called out.

## Personas
| Persona | French | Notes |
|---|---|---|
| Reader | lecteur·rice | Reads, likes, favorites, reviews, supports, enters contests |
| Writer | scénariste | Creator sub-role |
| Illustrator | dessinateur·rice | Creator sub-role |
| Creator | — | Writer or illustrator; owns/co-authors projects |
| Publisher / Editor | maison d'édition (`editor`) | Scouts talent; requires admin verification |
| Editorial staff | rédaction (`maintainer`) | Internal editorial workspace |
| Admin | — | Platform moderation & management |

## Epics & stories

### [00 · Foundation](00-foundation/_epic.md) — `F`
Cross-cutting: accounts, roles, profile, navigation, notifications, theme, search.
- [F-1](00-foundation/F-1-account-sign-up-and-login.md) — Account sign-up & login *(inferred)*
- [F-2](00-foundation/F-2-role-model-and-differentiated-access.md) — Role model & differentiated access
- [F-3](00-foundation/F-3-creator-profile-and-portfolio.md) — Creator profile & portfolio
- [F-4](00-foundation/F-4-global-navigation-header.md) — Global navigation header
- [F-5](00-foundation/F-5-notifications-and-unread-badges.md) — Notifications & unread badges
- [F-6](00-foundation/F-6-light-dark-theme.md) — Light / Dark theme
- [F-7](00-foundation/F-7-global-search.md) — Global search
- [F-8](00-foundation/F-8-background-job-queue.md) — Background job queue & reliable processing *(technical / inferred)*
- [F-9](00-foundation/F-9-observability-metrics-errors-alerts.md) — Observability: metrics, error tracking & alerts *(technical / inferred)*
- [F-10](00-foundation/F-10-media-storage-uploads.md) — Media storage, uploads & delivery (object storage + CDN) *(technical / inferred)*
- [F-11](00-foundation/F-11-email-verification.md) — Email verification *(inferred)*
- [F-12](00-foundation/F-12-password-reset.md) — Password reset "Mot de passe oublié" *(inferred)*
- [F-13](00-foundation/F-13-legal-consent-and-pages.md) — Legal consent & pages (CGU, confidentialité, cookies) *(inferred)*
- [F-14](00-foundation/F-14-rgpd-account-deletion-data-export.md) — RGPD: account deletion & data export *(inferred)*
- [F-15](00-foundation/F-15-notification-email-preferences.md) — Notification & e-mail preferences *(inferred)*
- [F-16](00-foundation/F-16-transactional-email-catalog.md) — Transactional e-mail catalog & delivery *(technical / inferred)*
- [F-17](00-foundation/F-17-onboarding-flow.md) — Onboarding flow (first run) *(inferred)*
- [F-18](00-foundation/F-18-account-security.md) — Account security (credentials, sessions, 2FA) *(inferred)*
- [F-19](00-foundation/F-19-application-settings.md) — Application settings "Paramètres" *(inferred)*
- [F-20](00-foundation/F-20-genre-vocabulary-tag-picker.md) — Genre vocabulary & tag picker *(inferred)*
- [F-21](00-foundation/F-21-support-contact-bug-report.md) — Support & contact (aide, contact form, bug report) *(inferred)*

### [01 · Discovery & Reading](01-discovery-reading/_epic.md) — `DR`
Reader-facing: home, catalog, work page, reader, gallery, ranking, library.
- [DR-1](01-discovery-reading/DR-1-home-accueil.md) — Home "Accueil"
- [DR-2](01-discovery-reading/DR-2-catalog-decouvrir.md) — Catalog "Découvrir"
- [DR-3](01-discovery-reading/DR-3-work-page-oeuvre.md) — Work page "Œuvre"
- [DR-4](01-discovery-reading/DR-4-reader-lecteur.md) — Chapter reader "Lecteur"
- [DR-5](01-discovery-reading/DR-5-gallery-galerie.md) — Illustration gallery "Galerie"
- [DR-6](01-discovery-reading/DR-6-illustration-detail.md) — Illustration detail
- [DR-7](01-discovery-reading/DR-7-ranking-classement.md) — Ranking "Classement"
- [DR-8](01-discovery-reading/DR-8-ma-liste-coups-de-coeur.md) — "Ma liste & coups de cœur"
- [DR-9](01-discovery-reading/DR-9-like-favorite.md) — Like / favorite
- [DR-10](01-discovery-reading/DR-10-age-verification-18-plus-gating.md) — Age verification & 18+ content gating *(inferred)*
- [DR-11](01-discovery-reading/DR-11-reading-history-resume.md) — Reading history & resume "Reprendre la lecture" *(inferred)*

### [02 · Matching & Collaboration](02-matching-collaboration/_epic.md) — `MC`
Find a partner, calls, applications, contacts, messaging.
- [MC-1](02-matching-collaboration/MC-1-partner-directory.md) — Partner directory "Trouver un·e partenaire"
- [MC-2](02-matching-collaboration/MC-2-match-suggestions.md) — Algorithmic match suggestions
- [MC-3](02-matching-collaboration/MC-3-collab-invite.md) — Collaboration invite "Proposer une collab"
- [MC-4](02-matching-collaboration/MC-4-post-call.md) — Post a call "Appels à projets"
- [MC-5](02-matching-collaboration/MC-5-apply-to-call.md) — Apply to a call "Candidater"
- [MC-6](02-matching-collaboration/MC-6-my-applications.md) — My applications "Mes candidatures" *(inferred)*
- [MC-7](02-matching-collaboration/MC-7-received-applicants.md) — Received applicants "Candidatures reçues" *(inferred)*
- [MC-8](02-matching-collaboration/MC-8-contacts-connexions.md) — Contacts & connexions
- [MC-9](02-matching-collaboration/MC-9-messaging-widget.md) — Messaging (floating widget)
- [MC-10](02-matching-collaboration/MC-10-block-mute-users.md) — Block & mute users *(inferred)*
- [MC-11](02-matching-collaboration/MC-11-community-salon-comptoir.md) — Community salon "Le Comptoir" (dock widget)

### [03 · Creation Studio](03-creation-studio/_epic.md) — `CS`
Project creation, workspace, files, collaborative editor, nemu, arrangement, publishing prep.
- [CS-1](03-creation-studio/CS-1-create-project-wizard.md) — Create project wizard
- [CS-2](03-creation-studio/CS-2-project-workspace.md) — Project workspace "Espace projet"
- [CS-3](03-creation-studio/CS-3-import-files.md) — Import files
- [CS-4](03-creation-studio/CS-4-collaborative-script-editor.md) — Collaborative script editor "Éditeur"
- [CS-5](03-creation-studio/CS-5-nemu-review-corrections.md) — Nemu review & corrections
- [CS-6](03-creation-studio/CS-6-page-arrangement.md) — Page arrangement before publish
- [CS-7](03-creation-studio/CS-7-chapter-management.md) — Chapter management
- [CS-8](03-creation-studio/CS-8-project-discussion-chat.md) — Project discussion chat
- [CS-9](03-creation-studio/CS-9-publish-scheduling-cadence.md) — Publish scheduling & cadence
- [CS-10](03-creation-studio/CS-10-coauthor-permissions-revenue.md) — Co-author permissions & revenue split *(inferred)*
- [CS-11](03-creation-studio/CS-11-collaboration-rights-licensing.md) — Collaboration rights & licensing agreement *(inferred)*

### [04 · Publishing & Engagement](04-publishing-engagement/_epic.md) — `PUB`
Publish chapters, comments, reviews, follow, share, report, contests, news.
- [PUB-1](04-publishing-engagement/PUB-1-publish-a-chapter.md) — Publish a chapter
- [PUB-2](04-publishing-engagement/PUB-2-comments.md) — Comments
- [PUB-3](04-publishing-engagement/PUB-3-reviews-avis.md) — Reviews "Avis"
- [PUB-4](04-publishing-engagement/PUB-4-follow-a-creator.md) — Follow a creator
- [PUB-5](04-publishing-engagement/PUB-5-share.md) — Share
- [PUB-6](04-publishing-engagement/PUB-6-report-content.md) — Report content "Signaler"
- [PUB-7](04-publishing-engagement/PUB-7-contest-participation.md) — Contest participation *(partly inferred)*
- [PUB-8](04-publishing-engagement/PUB-8-news-feed-and-article.md) — News feed & article *(inferred)*

### [05 · Publisher Space](05-publisher-space/_epic.md) — `PE`
Editor talent-scouting space: radar, shortlist, contracts, trends, contests, editorial board.
- [PE-1](05-publisher-space/PE-1-editor-space-access.md) — Editor space access
- [PE-2](05-publisher-space/PE-2-talent-radar.md) — Talent radar "Radar de talents"
- [PE-3](05-publisher-space/PE-3-shortlist-talents.md) — Shortlist talents
- [PE-4](05-publisher-space/PE-4-propose-a-contract.md) — Propose a contract
- [PE-5](05-publisher-space/PE-5-trends.md) — Trends "Tendances" *(inferred)*
- [PE-6](05-publisher-space/PE-6-branded-contests.md) — Branded contests "Lancer un concours" *(inferred)*
- [PE-7](05-publisher-space/PE-7-editorial-board.md) — Editorial board "Rédaction" *(inferred)*

### [06 · Monetization & Revenue](06-monetization-revenue/_epic.md) — `MR`
Support tiers, funding goals, donations, subscriptions, revenue dashboard, payouts.
- [MR-1](06-monetization-revenue/MR-1-support-creator-subscription-tiers.md) — Support a creator / work (tiers)
- [MR-2](06-monetization-revenue/MR-2-funding-goals.md) — Funding goals "Objectifs de financement"
- [MR-3](06-monetization-revenue/MR-3-donations-and-thank-you.md) — Donations + thank-you "Dons"
- [MR-4](06-monetization-revenue/MR-4-subscriptions-management.md) — Subscriptions management
- [MR-5](06-monetization-revenue/MR-5-revenue-dashboard.md) — Revenue dashboard "Revenus"
- [MR-6](06-monetization-revenue/MR-6-payouts.md) — Payouts "Versements"
- [MR-7](06-monetization-revenue/MR-7-refunds-receipts.md) — Refunds & receipts "Reçus & remboursements" *(inferred)*

### [07 · Admin & Moderation](07-admin-moderation/_epic.md) — `AD`
Admin console: reports, editor verification, content/comment moderation, users, stats, articles, contests.
- [AD-1](07-admin-moderation/AD-1-admin-panel-access-role-management.md) — Admin panel access & role management
- [AD-2](07-admin-moderation/AD-2-reports-handling-signalements.md) — Reports handling "Signalements"
- [AD-3](07-admin-moderation/AD-3-editor-account-verification-comptes-editeurs.md) — Editor-account verification
- [AD-4](07-admin-moderation/AD-4-content-moderation-works-illustrations.md) — Content moderation
- [AD-5](07-admin-moderation/AD-5-comment-review-moderation.md) — Comment & review moderation
- [AD-6](07-admin-moderation/AD-6-user-management-ban.md) — User management & ban
- [AD-7](07-admin-moderation/AD-7-platform-stats.md) — Platform stats *(inferred)*
- [AD-8](07-admin-moderation/AD-8-article-news-management.md) — Article / news management *(inferred)*
- [AD-9](07-admin-moderation/AD-9-contest-administration.md) — Contest administration *(inferred)*
- [AD-10](07-admin-moderation/AD-10-user-action-log.md) — User action log "Journal d'activité" *(inferred)*
- [AD-11](07-admin-moderation/AD-11-message-oversight.md) — Message oversight (private messages & salon chat) *(inferred)*
- [AD-12](07-admin-moderation/AD-12-financial-administration.md) — Financial administration "Finances" *(inferred)*
- [AD-13](07-admin-moderation/AD-13-sanctions-appeals.md) — Graduated sanctions & appeals *(inferred)*

## Dependency spine
Most stories depend on **F-1** (account) and **F-2** (roles). Creation depends on **CS-1** (project
exists). Engagement & monetization depend on **DR-3** (work exists) and **F-3** (profile). Publisher &
admin stories are gated by **F-2** roles; **PE-1** (editor space) depends on **AD-3** (verification).

## Source
Design project `3c66af36-2b0b-4096-beff-155fb03575bd` — files: `Encre et Plume - Prototype.dc.html`
(interactive prototype), `Wireframes - Encre et Plume.dc.html` (low-fi board), `Pitch Maison
d'Édition - Encre et Plume.dc.html` (vision & business model). Documentation only — no application code.
