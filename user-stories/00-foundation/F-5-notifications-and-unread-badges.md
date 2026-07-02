# F-5 — Notifications & unread badges

**As a** logged-in user, **I want** unread badges across the app and a notifications inbox, **so that** I can see at a glance what needs my attention and review it in one place.

> Screen(s): red count badges app-wide · "Notifications" inbox (nav-wired, body stubbed) · Priority: Should · Fidelity: Explicit (badges) / Inferred (inbox body)

## Frontend
- [ ] Red count badges across the app: Messages "3", "Demandes" "2", "Signalements" "4", message launcher bubble "3", unread dots in the chat list.
- [ ] "Notifications" dropdown entry (see [[F-4]]) navigates to the inbox (wired as `goInvitations`).
- [ ] Notifications inbox: list of notifications with type, source, timestamp, read/unread state; click navigates to the related item.
- [ ] Mark-as-read: per-item and "tout marquer comme lu"; badges decrement accordingly.
- [ ] States: unread (bold + dot), read, empty ("Aucune notification"), loading, error.
- [ ] Accessibility: badge counts announced (aria-label, e.g. "3 messages non lus"); inbox list keyboard-navigable.

## Backend
- [ ] GET /notifications — list current user's notifications (type, refId, sourceUser, createdAt, readAt).
- [ ] GET /notifications/unread-counts — per-area counts { messages, demandes, signalements, ... } for badges.
- [ ] POST /notifications/{id}/read — mark one read.
- [ ] POST /notifications/read-all — mark all read.
- [ ] Entity Notification: id, recipientId, type, refId, sourceUserId, createdAt, readAt (null = unread).
- [ ] Business rules: counts derive from unread (readAt null) notifications grouped by area; "Signalements" count is admin/maintainer-scoped.
- [ ] Authorization: a user sees only their own notifications; report counts gated to admin/maintainer roles ([[F-2]]).
- [ ] Side effects: creating domain events (new message, application received, report filed) generates notifications.

## Dependencies
- [[F-4]] — header hosts the badge and inbox entry.
- [[MC-9]] — messaging unread counts; [[MC-7]] — "Demandes"; [[AD-2]] — "Signalements".

## Notes
- Explicit: badges and counts are shown in the prototype; theme/layout known.
- Inferred: the "Notifications" entry is nav-wired (`goInvitations`) but the inbox body was a stub — treat the inbox list UI and the endpoints above as partly inferred; designers must confirm notification types and grouping.
- Per-type/per-channel opt-outs live in [[F-15]] (notification & e-mail preferences); fan-out must consult them.
