# Architecture — scaling & reliability

Target: a **secure, robust platform for tens of thousands of users** (and far beyond for a product shaped
like this). This document records the architectural decisions and the reasoning. The short version:
**a modular monolith on Postgres + Redis + a CDN + a background job queue scales well past this target —
microservices are not needed and are explicitly out of scope.**

## Stack
- **Web:** Next.js (App Router) — `apps/web`.
- **API:** NestJS (REST + WebSocket gateway), Prisma — `apps/api`. A **modular monolith**: one deployable,
  clean module boundaries per domain (`auth`, `accounts`, `profiles`, `notifications`, `search`, …).
- **Data:** PostgreSQL (source of truth). **Redis** (cache, sessions/denylist, rate-limit, pub/sub, queue).
- **Payments:** Stripe. **Queue:** BullMQ on Redis (`F-8`). **Observability:** Sentry + metrics (`F-9`).

## Why NOT microservices (now)
Microservices solve *organizational* and *independent-scaling* problems, not *user-count* problems. They add
network hops, distributed transactions, eventual consistency, and heavy ops/observability overhead — which
makes a one-team product **slower and more fragile**, the opposite of "robust." Tens of thousands of users is
a modest load. Keep the monolith's module boundaries clean so a single component can be extracted **later**,
only if a measured bottleneck (e.g. realtime, or media processing) forces it.

## What actually matters at this scale (priority order)
1. **Stateless app + horizontal scaling.** Already stateless (JWT in httpOnly cookie; sessions/denylist/
   rate-limit/cache in Redis). Scale = run N identical instances behind a load balancer. **Caveat:** the
   WebSocket gateway must use a **Redis adapter** so messages fan out across instances.
2. **Database.** Postgres handles this easily *if*: good indexes, **pagination on every list**, no N+1
   (Prisma `include` discipline), and a **connection pooler (PgBouncer)** in front. Read replicas only later.
   **PgBouncer is deployed** (2026-08-02) — `infra/pgbouncer/pgbouncer.ini`, transaction pooling, app on
   `:6432`, migrations direct on `:5433` via Prisma `directUrl`. Transaction mode is only safe because the
   API uses **no session-scoped Postgres features** (no `LISTEN/NOTIFY`, no session advisory locks, no
   `SET SESSION`) — **keep it that way**, or the pool mode has to drop to `session` and stops buying
   throughput. Prisma's URL must keep `pgbouncer=true` (transaction mode cannot share prepared statements).
3. **Media delivery — the real concern for a manga platform.** Chapter pages, galleries, avatars, uploads
   belong on a **CDN + object storage (S3/R2)** with an image pipeline (resize/transcode), never served
   from the app server. This matters more than raw user count.
4. **Caching.** Redis already present — cache feeds, rankings (`DR-7`), profiles, search, unread counts.
5. **Background job queue (`F-8`).** Move slow/bursty work off the request path; the reliability backbone
   for payments.

## Background jobs & queue (`F-8`)
**BullMQ on the existing Redis**, with a dedicated **worker process** (a second entrypoint into the same
monolith, sharing all modules — not a service). Queues: `stripe-events`, `payouts`, `email`,
`notifications-fanout`, `image-processing`. Every job: retries with backoff, a **dead-letter** path,
**idempotency keys**, concurrency limits, graceful shutdown, and scheduled/repeatable jobs for reconciliation
and retention purges. Feature code enqueues via a `QueueService.enqueue()` seam.

## Payments — reliability & correctness (`MR-*`)
Money requires **both** a queue **and** ACID DB transactions; they solve different problems:
- **Queue** = reliable async orchestration. The Stripe webhook **verifies the signature, persists the raw
  event (dedup on `event.id`), returns 200 immediately**, then enqueues a `stripe-events` job. (Stripe
  retries if you don't ack fast.)
- **DB transaction** = correctness. The worker does the money write (grant subscription, record donation,
  move balance, payout) inside an **ACID Postgres transaction**, guarded by an **idempotency key** so
  re-delivered/retried jobs are no-ops.
- A periodic **reconciliation job** compares local state vs Stripe to catch drift. Permanent failures land
  in the dead-letter queue for a human — never silently lost.

## Media & images (`F-10`)
Manga is image-heavy (chapter pages, galleries, illustrations, covers, avatars, attachments) — **media
delivery is the dominant scaling concern**, so the app must never store or proxy image bytes.
- **Object storage (S3-compatible, provider-agnostic)** via the AWS SDK (`@aws-sdk/client-s3` +
  `s3-request-presigner`) — works with S3 / Cloudflare R2 / MinIO; provider chosen at deploy via env.
- **Direct-to-storage uploads via presigned URLs**: API validates owner/content-type/size → returns a
  short-lived presigned PUT → client uploads **straight to storage** → calls `finalize`, which creates the
  `Media` row and enqueues an `image-processing` job (`F-8`) for thumbnails / responsive variants / WebP-AVIF
  transcode / EXIF strip. App servers stay stateless and are never a media bandwidth bottleneck.
- **Delivery via CDN**: public assets (avatars, covers, published works, gallery) use public CDN URLs;
  **private** assets (premium chapters, private DM/chat attachments) use API-gated short-lived **signed
  URLs**, governed by the same authz that protects the underlying resource.
- **Rendering** stays plain `<img>` + responsive `srcset` from CDN variants (no `next/image`); a generic
  `Media` model generalises CS-3's per-project `Asset`.
- **Validation/privacy**: content-type allowlist, size + dimension limits, SVG sanitised/rejected, EXIF
  stripped on ingest (RGPD), optional malware/moderation scan; orphan-cleanup for un-finalized uploads.

## Security & robustness
- Server-side authz, role loaded from DB (never trust client claims) — `F-2`.
- Input validation at trust boundaries; Redis-backed rate limiting; JWT revocation via denylist.
- HTTPS, secrets in env/secret-manager (never committed). Backups + disciplined Prisma migrations.
- Audit/accountability: the user **action log** (`AD-10`) and **message-oversight access logging** (`AD-11`).
- **Observability (`F-9`)** — you cannot keep a platform robust if you cannot see it: Sentry error tracking,
  structured logs with request/correlation ids, `/health` + readiness, RED + queue + DB-pool metrics, and
  actionable alerts (error spikes, latency, dead-letter growth, failed-payment backlog, DB/Redis down).
  Scrub PII/secrets from logs and error payloads (RGPD).

## Roadmap — now vs defer
- **Done (2026-08-02 DB pass):** PgBouncer in transaction mode with pool sizing + idle/wait timeouts;
  **every foreign key indexed** (Postgres indexes none automatically, and RESTRICT/SET NULL/CASCADE all
  scan the child table on a parent delete — `F-14` erasure and `CS-16` project delete hit exactly those);
  **UUIDv7 primary keys in native `uuid` columns** (time-ordered so inserts stay local, 16 bytes vs TEXT's
  36+ across every index and FK). Findings deliberately left open are in
  `.claude/pipeline/_db-scalability-pass.md`.
- **Now (cheap, high-leverage):** keep the modular monolith; WS Redis adapter; remaining pagination gaps
  (per-account lists, the salon roster + its message history); Redis caching; CDN + object storage for
  media; stand up observability (`F-9`).
- **Before monetization:** the job queue (`F-8`) — so `MR-*` is built on idempotent, transactional,
  retryable payment processing from day one.
- **When a host is chosen — managed-database checklist.** There is no cloud DB yet (compose only;
  `deploy.yml` is a secret-guarded stub), so instance autoscaling cannot be configured against anything.
  On the day a provider is picked, settle: storage autogrow and its ceiling; compute autoscaling (and
  whether it restarts connections — the pooler must survive a failover); `max_connections` on the managed
  instance vs PgBouncer's `max_db_connections`; whether the provider fronts its own pooler (do **not**
  stack two); PITR/backup retention; and where `DIRECT_DATABASE_URL` points, since migrations must bypass
  every pooler.
- **Later (only on a measured bottleneck):** Postgres read replicas; a real search engine (OpenSearch) if
  Postgres FTS is outgrown; extract a single service (realtime or media) only if its scaling profile demands
  it — measured, never preemptive.
