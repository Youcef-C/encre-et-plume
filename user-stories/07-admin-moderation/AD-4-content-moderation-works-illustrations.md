# AD-4 — Content moderation (works & illustrations)

**As an** Editorial staff member (maintainer), **I want** inline moderation controls on works and illustrations plus a visibility filter, **so that** I can revoke, restore, and triage published content without leaving the page.

> Screen(s): admin bar on Work page ([[DR-3]]) and Illustration detail ([[DR-6]]); visibility filter on listings · Priority: Must · Fidelity: Explicit

## Frontend
- Admin moderation bar, shown only to `admin`/`maintainer`, on a work ([[DR-3]]) and an illustration ([[DR-6]]):
  - "⚑ Révoquer l'œuvre" / "⚑ Révoquer l'illustration" — opens a motif prompt, then revokes.
  - "⛔ Bannir l'auteur·rice" — opens the ban flow ([[AD-6]]).
  - "↪ Dashboard" — jumps to the admin console ([[AD-1]]).
- Revoked state: a banner on the content (e.g. "Œuvre révoquée") plus a "Rétablir" action to restore visibility.
- Visibility filter on content listings (`data-oeuvrefilter`): "Tous" / "Visible" / "Signalé" / "Masqué" — scopes the list to all, public, reported, or hidden items.
- States:
  - Loading: spinner on revoke/restore submit; skeleton on filtered list.
  - Empty: filtered listing shows "Aucun contenu" for the chosen filter.
  - Error: toast on revoke/restore failure; state unchanged.
- Validation: revocation requires a motif before submit; confirm revoke/restore.
- Accessibility: bar buttons have accessible names (icon + text); revoked banner announced; filter is a labelled control with selected state; the bar is visually distinct from reader UI.

## Backend
- **PATCH /admin/content/{type}/{id}/status** — `type ∈ {work|illustration}`, body `{ action: "revoke"|"restore", motif? }`.
- **GET /admin/content?type=&visibility={tous|visible|signale|masque}&page=** — filtered listing.
- Entities **Work** / **Illustration** gain a moderation `visibility` state: `visible | signale | masque (revoked)`, plus `revokedBy, revokedAt, revokeMotif`.
- Business rules: revoked content is hidden from public/reader surfaces and from its author's public profile but retained for the author and audit; "signalé" reflects having open reports ([[AD-2]]); restore returns it to `visible`.
- Validation: `action`/`visibility` enums; `motif` required on revoke.
- Authorization: `admin` or `maintainer` ([[F-2]]).
- Side effects: revoke removes the item from public discovery/reading and notifies the author with the motif ([[F-5]]); links back from a report resolution ([[AD-2]]).

## Dependencies
- [[DR-3]], [[DR-6]] — host surfaces for the admin bar.
- [[AD-6]] — "⛔ Bannir l'auteur·rice".
- [[AD-1]] — "↪ Dashboard" target; [[AD-2]] — "signalé" state + report-driven revocation.
- [[F-2]] — authorization; [[F-5]] — author notification.

## Notes
- Explicit: the admin bar buttons ("⚑ Révoquer l'œuvre/l'illustration", "⛔ Bannir l'auteur·rice", "↪ Dashboard"), revoked banner + "Rétablir", and the "Tous / Visible / Signalé / Masqué" filter (`data-oeuvrefilter`).
- Inferred: motif prompt details, listing pagination, retention-for-author behavior.
