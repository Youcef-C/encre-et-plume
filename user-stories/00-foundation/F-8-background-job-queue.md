# F-8 — Background job queue & reliable processing

**As a** platform operator, **I want** a background job queue with retries, dead-letter handling, and idempotent processing, **so that** slow and money-critical work (Stripe webhooks, payouts, emails, notification fan-out, image processing) runs reliably off the request path without losing or double-processing events.

> Screen(s): none (technical/infra); optional admin "Files d'attente · santé" health panel (not drawn) · Priority: Must · Fidelity: Inferred

## Frontend
- No user-facing UI required.
- (Optional, Inferred) an admin **"Files d'attente"** panel in the admin console ([[AD-1]]) showing per-queue depth, in-flight, failed, and dead-letter counts, with a retry/requeue action — or rely on an admin-gated BullMQ dashboard. `admin` only.

## Backend
- **BullMQ on the existing Redis** ([[F-1]] stack), with a dedicated **worker process** — a second entrypoint into the SAME NestJS monolith that shares all modules (NOT a microservice). App servers stay request-only; workers do async work.
- A **`QueueService.enqueue(queue, name, data, opts)`** seam (mirrors the `NotificationsService.create()` / `ActionLogService.record()` seams) so feature services enqueue work without touching queue wiring.
- Queues (created as their features land; the infra + the `stripe-events` queue ship here): `stripe-events`, `payouts`, `email`, `notifications-fanout`, `image-processing`.
- **Job semantics**: configurable **retries with exponential backoff**; a **dead-letter** path for permanent failures (never silently dropped); **idempotency keys** so re-delivered or retried jobs are no-ops; concurrency limits; **graceful shutdown** (drain in-flight jobs); **scheduled/repeatable** jobs (cron) for reconciliation, cleanup, and retention purges.
- **Stripe webhook reliability** (the money path, [[MR-1]]/[[MR-3]]/[[MR-4]]/[[MR-6]]): the webhook endpoint **verifies the signature, persists the raw event (dedup on Stripe `event.id`), returns 200 immediately**, then enqueues a `stripe-events` job. The worker processes it **idempotently inside an ACID Postgres transaction**; a periodic **reconciliation job** compares local state vs Stripe to catch any drift.
- **Money correctness rule**: the queue does NOT replace DB transactions. Money writes happen in ACID Postgres transactions + idempotency keys; the queue provides reliable async retrying/ordering AROUND them.
- Observability hooks for [[F-9]]: emit job metrics (depth, throughput, duration), send job failures to error tracking, and alert on dead-letter growth / webhook backlog. Audit-relevant jobs may also write [[AD-10]].
- Authorization: the optional queue health panel is `admin` only ([[F-2]]); the worker runs server-side with service credentials.

## Dependencies
- [[F-1]] — Redis (already in the stack) backs BullMQ; sessions for any admin surface.
- [[F-2]] — admin authorization for the optional health panel.
- [[AD-1]] — host for the optional health panel.

## Notes
- Inferred/technical: no prototype frame. Ships **before the monetization epic** so [[MR-1]], [[MR-3]], [[MR-4]], [[MR-6]] are built on reliable, idempotent, transactional payment processing from day one; [[F-5]] notification fan-out and future email/image jobs reuse the same queue.
- Still firmly a **monolith** — a worker is a second entrypoint to the shared codebase, not a separate service. Microservices are explicitly out of scope (see the "Scaling & reliability" section in `CLAUDE.md` / `ARCHITECTURE.md`).
- The reserved `image-processing` queue is the worker side of [[F-10]] (media storage): it generates thumbnails / responsive variants and transcodes on media finalize.
