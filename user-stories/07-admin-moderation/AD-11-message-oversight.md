# AD-11 — Message oversight (private messages & salon chat)

**As an** Admin or editorial staff (`maintainer`), **I want** read access to user-to-user messages — private DMs and project/"salon" group chats — **so that** I can investigate harassment, abuse, and safety reports with the full conversation context and enforce the platform's rules.

> Screen(s): admin console "Surveillance des messages" view + jump-in from a report ([[AD-2]]) / a user detail ([[AD-6]]); not drawn · Priority: Should · Fidelity: Inferred

## Frontend
- A staff **"Surveillance des messages"** view inside the admin console (host: [[AD-1]] console), accessible to `admin` and `maintainer`:
  - Browse / search conversations (DMs and groups), showing participants, type (dm | groupe), the linked project for salon chats ([[CS-8]]), last activity, and message count.
  - Open a conversation to read its **full message history** as a read-only thread (sender, timestamp, body, attachments inline). Clearly marked **"Lecture seule · accès modération"** — there is no composer; staff cannot post or impersonate.
- **Investigation entry points**: open a user's conversations from the [[AD-6]] user-detail view, and jump straight to the reported conversation/message from a report ([[AD-2]]).
- States: loading skeleton; empty ("Aucune conversation."); error inline/toast; a clear read-only banner on every opened thread.
- Accessibility: thread as a log region; sender/time read in order; controls labelled; not color-only.
- Responsive: conversation list + thread reflow/stack on mobile (no horizontal overflow); reuses admin-console manga-zine tokens/components. French UI copy verbatim.

## Backend
- Reuses the [[MC-9]] messaging backend and entities — `Conversation` (`id`, `type` dm|group, `name?`, `participants[]`, `projectId?`) and `Message` (`id`, `conversationId`, `senderId`, `body`, `attachments[]`, `createdAt`, `readBy[]`) — and the [[CS-8]] project/salon chat that shares that backend. No new message storage.
- **GET /admin/conversations?type=&q=&participantId=&page=&limit=** — list/search all conversations (DM + group/salon); `admin` + `maintainer`; paginated, newest-activity first.
- **GET /admin/conversations/:id/messages?page=&limit=** — full message history of ANY conversation, newest or chronological; `admin` + `maintainer`. This is the deliberate, role-gated exception to MC-9's "participants only may read" rule.
- **GET /admin/users/:id/conversations** — conversations a given user participates in (for [[AD-6]] / [[AD-10]] investigations).
- **Read-only**: there is NO staff endpoint to post, edit, or send messages. Removing/hiding an abusive message is moderation, handled the [[AD-5]] way (related, not part of this story).
- Authorization: `admin` + `maintainer` only; the MC-9/CS-8 participant-only read rule is bypassed **solely** on these `/admin/...` endpoints, with the role loaded fresh from the DB ([[F-2]]) — never trust a client claim.
- **Accountability (required)**: every staff read of a conversation/thread is recorded via [[AD-10]]'s `ActionLogService.record()` (e.g. `action: message_oversight_view`, `targetType: conversation`, `targetId`, `metadata: { conversationId, participantIds }`) so message access is itself auditable.
- Validation: query params bounded (`page`/`limit`), `type` ∈ {dm, group}, ISO dates if a range is added.
- Side effects: none on the conversations themselves (read-only); only an action-log entry per access.

## Dependencies
- [[MC-9]] — private DMs + group chat backend and `Conversation`/`Message` entities being overseen.
- [[CS-8]] — project/"salon" chat shares the MC-9 backend; covered by the same oversight.
- [[F-2]] — `admin` + `maintainer` authorization; the role-gated exception to participant-only access.
- [[AD-1]] — admin console host surface.
- [[AD-2]] — message reports jump into the reported conversation here.
- [[AD-6]] — user-detail view lists a user's conversations.
- [[AD-10]] — staff access to private content is logged into the user action log.

## Notes
- Inferred: no rendered prototype frame — a new admin oversight surface plus jump-ins from reports/user detail; reuse the PANNEAU ADMIN tokens/components (like [[AD-7]]/[[AD-10]]).
- Scope is **read-only visibility** (what was asked). Acting on a message (delete/hide/warn) is moderation and follows the [[AD-5]] pattern — out of scope here, noted as the natural follow-up.
- **Privacy (RGPD)**: private messages are confidential. Staff oversight is restricted to `admin`/`maintainer`, every access is logged ([[AD-10]]), and the capability must be disclosed in the platform Terms. End users do NOT get oversight access; they only ever see their own conversations ([[MC-9]]). Retention of messages and of access logs are open questions for design/legal.
