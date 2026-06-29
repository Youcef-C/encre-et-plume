# AD-2 — Reports handling "Signalements"

**As an** Editorial staff member (maintainer), **I want** a queue of user reports I can review and act on, **so that** problematic content and accounts are dealt with consistently and tracked.

> Screen(s): "Signalements" tab of "Administration & modération" · Priority: Must · Fidelity: Explicit

## Frontend
- Reports table with columns "Contenu / Motif / Statut / Action".
  - "Contenu" cell shows target type + title, e.g. "Commentaire · « Néon Sutra »", "Planche · « Spectres d'Avril »", "Profil · Théo M.".
  - "Motif": reason label, e.g. "Spam", "Contenu sensible", "Usurpation".
  - "Statut": status dot + label — "● à traiter", "○ en cours", "résolu".
  - "Action": "Examiner" button per row.
- Status filter to scope the queue: "à traiter" / "en cours" / "résolu" (default shows open items; tab badge counts "à traiter").
- "Examiner" opens a report detail (panel/modal) showing the reported target (with a link through to it), reporter motif/details, report history, and action controls:
  - Hide/remove content (routes to [[AD-4]] / [[AD-5]]), ban author ([[AD-6]]), or "Rejeter"/dismiss; plus an internal note field.
  - Resolving sets the report to "résolu"; taking it up sets "en cours".
- States:
  - Empty: "Aucun signalement" when the filtered queue is empty.
  - Loading: skeleton rows; spinner on the detail panel and on action submit.
  - Error: toast on load/resolve failure; the row stays in its prior status.
- Validation: an action that requires a reason (e.g. content removal, ban) blocks submit until a motif is provided.
- Accessibility: table has column headers; status dots have text equivalents (not color-only); "Examiner" buttons named with their row context; detail panel is a focus-trapped dialog.

## Backend
- **GET /admin/reports?status={a_traiter|en_cours|resolu}&page=** — paginated list with target ref, motif, status.
- **GET /admin/reports/{id}** — detail: target reference + snapshot, reporter, motif, details, status, history.
- **PATCH /admin/reports/{id}** — `{ action: "hide"|"remove"|"ban"|"dismiss"|"claim", motif?, note? }`; updates status (`claim`→en_cours, terminal actions→resolu) and triggers the linked moderation side effect.
- Entity **Report**: `id, targetType (comment|review|work|illustration|profile), targetId, reporterId, motif, details, status (a_traiter|en_cours|resolu), assigneeId?, resolutionAction?, resolutionNote?, createdAt, resolvedAt`. Fed by [[PUB-6]].
- Business rules: terminal actions on a report apply to the target via the matching moderation story; resolving records who/when; a target may have multiple reports.
- Validation: `action` enum; `motif`/`note` required for content removal and ban.
- Authorization: `admin` or `maintainer` ([[F-2]]).
- Side effects: hide/remove → [[AD-4]]/[[AD-5]]; ban → [[AD-6]]; optionally notify reporter of resolution ([[F-5]]); status counts feed the "Signalements [n]" badge ([[AD-1]]).

## Dependencies
- [[PUB-6]] — source of reports.
- [[AD-4]], [[AD-5]], [[AD-6]] — actions taken from a report.
- [[AD-1]] — host tab + pending-count badge.
- [[F-2]] — authorization; [[F-5]] — reporter notification.

## Notes
- Explicit: columns "Contenu / Motif / Statut / Action", the three sample rows, status states "à traiter / en cours / résolu", and the "Examiner" action.
- Inferred: report detail layout, internal note, "claim"/assignee, reporter notification, pagination.
