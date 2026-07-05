# AD-14 — Support ticket triage "Assistance"

**As an** Editorial staff member (maintainer) or Admin, **I want** an inbox of the support / contact / bug-report tickets users submit, that I can read, triage, and reply to, **so that** help requests and bug reports are handled consistently and nothing is lost.

> Screen(s): "Assistance" tab of "Administration & modération" · Priority: Should · Fidelity: Inferred (not drawn; mirrors the [[AD-2]] "Signalements" queue pattern)

## Frontend
- **"Assistance" tab** in the admin panel ([[AD-1]]), role-gated to `maintainer` / `admin`.
- **Tickets table** — columns "Sujet · Catégorie / Expéditeur / Statut / Date / Action"; the category shows `Question générale` / `Problème de compte` / `Signaler un bug` / `Autre`; the sender links to the account profile when the submitter was authenticated.
- **Filters** (on-brand controls, auto-apply — [[F-20]] rule): by **statut** (`Nouveau` / `Ouvert` / `Résolu`) and **catégorie**; default view is open tickets (new + open), newest first; paginated.
- **Ticket detail** (row → drawer/page): the full message, submitter name/e-mail (+ account link), and — for bug reports — the captured technical context (page URL, browser/user-agent, [[F-9]] request/correlation id) laid out for reproduction.
- **Actions**: change **statut** (Nouveau → Ouvert → Résolu); **répondre** (compose a reply that is sent to the submitter's e-mail via [[F-16]]); add an internal note. Every action shows a success/error state.
- **Empty / loading / error** states; responsive 375 / 768 / 1280; accessible table + labelled controls.

## Backend
- **GET /admin/support/tickets** — paginated list, filter by `status` / `category`, newest first. Staff-only.
- **GET /admin/support/tickets/{id}** — full ticket incl. message + context (bug metadata). Staff-only.
- **PATCH /admin/support/tickets/{id}** — update `status` (and optional `assigneeId`). Staff-only, validated against the allowed status set.
- **POST /admin/support/tickets/{id}/reply** — enqueue ([[F-8]]) a reply e-mail to the submitter via the transactional catalog ([[F-16]]); persist the reply on the ticket thread; returns fast.
- **Entities**: reuses the [[F-21]] `SupportTicket` (+ optional `assigneeId`, reply/notes thread).
- **Authorization**: all endpoints require an authenticated `maintainer` / `admin` session ([[F-2]] server-side role check, [[AD-1]]); regular users can never list or read tickets (only submit, per [[F-21]]) — no IDOR on `{id}`.
- **Audit**: every status change / reply / assignment is written to the admin action log ([[AD-10]]).
- **RGPD / observability**: submitter e-mail + message are personal data — surfaced only to staff over authenticated endpoints, never logged / never in Sentry breadcrumbs ([[F-9]]).

## Dependencies
- [[F-21]] — the source of tickets (submission + `SupportTicket` entity); this story is its staff-facing counterpart.
- [[AD-1]] — admin panel shell + role gating hosts the "Assistance" tab.
- [[AD-10]] — action log records every triage action.
- [[F-16]] — transactional e-mail delivers staff replies; [[F-8]] runs the send off the request path.
- [[F-2]] — server-side role enforcement (maintainer/admin only).

## Notes
- Distinct from [[AD-2]] "Signalements" (content/abuse reports flagging a specific work/comment/user): AD-14 is the general help/contact/bug inbox. Kept a separate tab so the two queues don't merge.
- Conservative scope: no SLA timers, no canned-response library, no public ticket-status portal in v1 — add if support volume warrants.
