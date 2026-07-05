# F-21 — Support & contact (aide, contact form, bug report)

**As a** visitor or member, **I want** a way to reach the Encre & Plume team — contact information, a contact/support form, and a bug-report channel — **so that** I can get help, ask questions, or report a problem without leaving the platform.

> Screen(s): none drawn ("Aide & contact" page + legal-footer link — to be designed) · Priority: Should · Fidelity: Inferred (not in the prototype; reuse the design system + legal-page/footer patterns from [[F-13]])

## Frontend
- **"Aide & contact" page** (public route, e.g. `/contact`), linked from the legal footer ([[F-13]]) alongside CGU / Confidentialité / Mentions légales, and reachable when signed out.
- **Contact information block**: the support e-mail address (`mailto:`), the expected response window, and a short line pointing content/abuse reports to the in-app report flow ([[PUB-6]] / [[AD-2]]) rather than this form.
- **Contact / support form** — on-brand controls only ([[F-20]] rule: `OnBrandSelect` for the category, no bare native controls):
  - **Sujet / catégorie** (single-select): `Question générale`, `Problème de compte`, `Signaler un bug`, `Autre`.
  - **Nom** + **e-mail** (prefilled and read-only when signed in from [[F-1]]; required for visitors so we can reply), **message** (with a sensible `@MaxLength`).
  - **"Signaler un bug" mode**: when that category is picked, the form auto-captures and submits technical context — the current/last page URL, the browser user-agent, and the request/correlation id from [[F-9]] — shown to the user (transparent, editable/removable) so a bug can be reproduced. No PII beyond what the user typed.
  - Anti-spam: a hidden honeypot field + submit disabled until required fields are valid.
- **States**: idle → submitting → success ("Message envoyé — nous vous répondrons par e-mail.") → error/retry; inline French validation ("Adresse e-mail invalide", "Message requis"); the success view offers a "Nouveau message" reset.
- **Accessibility**: labelled fields, error messages tied via `aria-describedby`, the category as a labelled select, submit reflects busy state; responsive 375 / 768 / 1280.

## Backend
- **POST /support/tickets** — accepts `{ category, name, email, message, context? }`; **auth optional** (visitors and members both submit; when authenticated, bind `accountId` and trust the session e-mail over the body).
- **Entity `SupportTicket`**: id, category (allowlisted), accountId (nullable), name, email, message, context (JSON: url/userAgent/requestId for bug reports), status (`new` | `open` | `resolved`), createdAt.
- **Business rules**: category must be a known value; message/name/email length-capped; on create, **enqueue** ([[F-8]]) a notification to the support/staff channel via the transactional e-mail catalog ([[F-16]]) — the request path just validates, persists, and returns 200 fast (money-path-style: don't send inline).
- **Validation / anti-abuse**: `class-validator` DTO (`whitelist`), reject on honeypot filled, **rate-limit per IP + per account** ([[F-1]] Redis limiter) to stop spam floods, cap payload size.
- **Authorization**: submit is public; **reading/triaging tickets is staff-only** — surfaced in the admin panel ([[AD-1]]); the full triage/response UI is admin-epic scope (extend [[AD-2]] or a dedicated admin story), this story only guarantees tickets are captured, notified, and listable to staff.
- **RGPD / observability** ([[F-9]]): the submitter e-mail and message are personal data — never log them; keep them out of Sentry breadcrumbs; include them in the [[F-14]] export/erasure scope for authenticated submitters.

## Dependencies
- [[F-13]] — footer hosts the "Aide & contact" link (next to the legal links).
- [[F-1]] — prefill name/e-mail + bind `accountId` for signed-in submitters.
- [[F-16]] — transactional e-mail delivers the ticket to the support channel (and an acknowledgement to the submitter).
- [[F-8]] — queue runs the notification off the request path.
- [[F-9]] — request/correlation id enriches bug reports; PII stays out of logs.
- [[F-20]] — on-brand form controls (`OnBrandSelect`, etc.).
- [[AD-1]] / [[AD-2]] — staff triage of submitted tickets lives in the admin panel (report-handling analogue).
- [[F-14]] — support tickets are part of an authenticated user's data export / erasure.

## Notes
- Distinct from **content/abuse reporting** ([[PUB-6]] report → [[AD-2]] signalements): that flags a specific work/comment/user; this is a general help/contact/bug channel to the platform team. The page cross-links to the report flow so the two don't get confused.
- Conservative scope: no live chat, no public ticket portal / status tracking, no file attachments in v1 (bug context is text/metadata only) — add later if support volume warrants.
