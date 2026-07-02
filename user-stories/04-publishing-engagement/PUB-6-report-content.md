# PUB-6 — Report content "Signaler"

**As a** Reader, **I want** to report a work, illustration, comment, or profile with a reason, **so that** moderators can review and act on problematic content.

> Screen(s): Work page ([[DR-3]]), illustration detail ([[DR-6]]) — "⚑ Signaler"; report modal (`openReport`) · Priority: Should · Fidelity: Explicit (trigger) / Inferred (modal body)

## Frontend
- "⚑ Signaler" trigger on work and illustration; reachable on comments ([[PUB-2]]) and profiles too.
- Opens report modal (`openReport`, body inferred) expected to contain:
  - Reason selector (single-select), reasons matching admin vocabulary: "Spam", "Contenu sensible", "Usurpation" (and similar).
  - Optional "Détails" textarea for context.
  - Submit: "Signaler" / "Envoyer le signalement"; "Annuler" to dismiss.
- States:
  - Submit loading (spinner, disabled).
  - Success confirmation ("Signalement envoyé") + modal closes.
  - Error toast on failure; selections preserved.
  - Already-reported-by-viewer: optional indication (inferred).
- Validation: a reason must be selected before submit.
- Accessibility: modal focus trap, focus returns to trigger; reason list is a labelled radiogroup; "Détails" textarea labelled; success/error announced.

## Backend
- **POST /reports** — `{ targetType: "work"|"illustration"|"comment"|"profile", targetId, reason, details? }`. Response: `{ reportId, status: "queued" }`.
- Entity **Report (signalement)**: `id, targetType, targetId, reporterId, reason, details, status (queued|reviewing|resolved|dismissed), createdAt`.
- Business rules:
  - Each report is enqueued for moderation ([[AD-2]] reports queue, [[AD-4]] content moderation, [[AD-5]] for comments).
  - De-duplicate or rate-limit repeated reports of the same target by the same user (inferred).
- Validation: `targetType` and `reason` from allowed enums; `targetId` must exist.
- Authorization: authenticated user only ([[F-1]]).
- Side effects: create signalement record visible in admin reports queue.

## Dependencies
- [[F-1]] — auth to report.
- [[AD-2]] — reports queue handles signalements.
- [[AD-4]], [[AD-5]] — content and comment moderation act on reports.
- [[DR-3]], [[DR-6]], [[PUB-2]], [[F-3]] — report entry points.

## Notes
- Explicit: "⚑ Signaler" on work & illustration; `openReport` modal trigger; reasons (Spam, Contenu sensible, Usurpation) seen in admin.
- Inferred: full modal body, "Détails" field, de-dup/rate-limit, already-reported indication.
- [[MC-10]] extends `targetType` with `"message"` so private messages are reportable; staff review those via [[AD-11]].
