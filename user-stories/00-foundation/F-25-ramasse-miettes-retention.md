# F-25 — Ramasse-miettes : purge des données périmées

**As a** platform operator, **I want** every table that only ever grows to be swept on a schedule, **so that** the database and the object storage don't accumulate expired tokens, dead archives and stale rows forever.

> Screen(s): none of its own — infrastructure · Priority: **Must** · Fidelity: **Inferred** (defect, not a drawn screen)

## Why this story exists (defect, not a feature)

Audited 2026-08-26: **the platform has exactly one garbage collector, and it covers one table.**

`MediaModule.onModuleInit` (`media.module.ts:33`) schedules an hourly `orphan-cleanup` that deletes
`Media` rows still `pending` after an hour (`media.service.ts:729`). That is the whole of it. Everything
else that expires is either swept only when an account is erased, or never:

- **`EmailVerificationToken`, `PasswordResetToken`, `EmailChangeToken`** all carry an `expiresAt`
  (24 h / 1 h / 24 h). Nothing ever deletes an expired row. They are only removed by
  `account-erasure.processor.ts:100-101`, i.e. when the whole account goes. A used or lapsed token stays
  in the table for the life of the platform — a growing set of live secret hashes, which is also the
  wrong answer for RGPD minimisation.
- **`DataExport`** declares `@@index([status, expiresAt]) // purge sweep` in `schema.prisma:208`, and
  `PrivacyService.purgeExpiredExports()` (`privacy.service.ts:183`) is **fully written** — carrying its own
  `ponytail:` comment, *"not wired to a live cron yet"*. Nothing calls it: the only references in
  `apps/api` are a spec asserting the method exists and a doc comment. So the index is unused, the sweep
  is dead code, and the real behaviour is `privacy.service.ts:95`'s *lazy-expire* — an export is purged
  only if its owner happens to open the page again. An account that requests an archive once and never
  returns keeps its zip in S3 forever, past the 7-day promise made to the user.
- **`Notification`** has no retention at all. `notification.deleteMany` appears exactly once in
  `apps/api/src`, in the erasure processor. Every notification ever fanned out is still there.
- **`ScenarioUpdate`** is compacted by each autosave (`scenario-documents.service.ts:186`), so it is
  bounded *while a document is being worked on*. An abandoned editing session leaves its update log
  behind, and nothing ever collects it.
  **Do not gate this sweep on the document's `updatedAt`** (round 1 shipped that and it deleted nothing —
  see the sweep table): `scenario-documents.service.ts:182` is the *only* write that advances
  `ScenarioDocument.updatedAt`, and it sits in the same `$transaction` as the `deleteMany` that empties
  the log. So every row that survives was written *after* the last save, and a
  "document newer than update" test is false for all of them — it protects exactly the garbage this
  sweep exists to collect.
- **`cleanupOrphans` itself is unbounded**: `findMany` with no `take`, then one `deleteObject` per row
  in a serial loop. It works today because the backlog is small; the first real backlog loads every
  orphan into memory and holds the worker for as long as S3 takes.

The blast radius is storage cost and RGPD exposure, not correctness — which is why it has survived
23 foundation stories. It stops being harmless at the scale `ARCHITECTURE.md` targets.

## Backend

### One queue, one processor, one table of sweeps
- Add `'maintenance'` to `QUEUE_NAMES` (`packages/shared/src/queue.ts` — closed union). Not the
  `analytics` queue from [[DR-13]]: a token purge is not audience data, and sharing the queue would make
  queue-depth alerting ([[F-9]]) unreadable. Not `image-processing` either — that one is `concurrency: 2`
  and CPU-bound for sharp.
- **Nightly repeatable** registered in `onModuleInit`, copying the precedent at `media.module.ts:33`
  verbatim (`QueueService.schedule(...)` inside a `try/catch`, so a Redis outage at boot is not fatal;
  BullMQ de-dups repeatables, so registering from both API and worker is safe).
- The processor is **a list of sweeps, not a framework**. Each sweep is `{ name, run() }`; the processor
  loops, times each one, logs `swept=<n>` per sweep, and **an individual sweep's failure must not abort
  the others** — catch per sweep, rethrow at the end if any failed so [[F-8]]'s dead-letter still sees it.
  No plugin registry, no config file, no per-sweep queue.

### The sweeps
| Sweep | Deletes | Cutoff |
|---|---|---|
| `auth-tokens` | `EmailVerificationToken`, `PasswordResetToken`, `EmailChangeToken` | `expiresAt < now()` |
| `data-exports` | `DataExport` **and its S3 object** | `expiresAt < now()` |
| `notifications` | `Notification` where `readAt` is not null | `createdAt < now() - 90d` |
| `scenario-updates` | `ScenarioUpdate`, unconditionally | `createdAt < now() - 30d` |

- **`data-exports` is a wiring task, not a new sweep** — `PrivacyService.purgeExpiredExports()` already
  exists and already deletes the archive via `deleteMediaById`. Call it; delete its "not wired to a live
  cron yet" `ponytail:` comment; add the batching below. Do **not** write a second purge — two purges that
  must agree is how the 7-day promise gets broken on one path only.
- **Unread notifications are never swept.** A 91-day-old unread badge is a product decision, not garbage.
- **The `scenario-updates` sweep is safe precisely because the model is write-only.** `ScenarioUpdate` is
  created at `editor.gateway.ts:196` and deleted at `scenario-documents.service.ts:186`; nothing in
  `apps/api` ever reads the bytes back. A row older than 30 days therefore belongs to an editing session
  that ended without a save, and no code path can surface it to any user. If a "recover unsaved changes"
  feature is ever built, *that* is when this cutoff needs revisiting — not before.

### Batching — the rule for every sweep
Every sweep is bounded: `take: 1000` per pass, loop until a pass returns fewer, hard cap per run so a
backlog cannot hold the worker all night. This applies to **`cleanupOrphans` too — fix it here**, at the
one place all callers route through, rather than leaving the unbounded `findMany` in place next to four
bounded siblings. Sweeps that touch S3 delete the object first, then the row: an orphaned row is
recoverable, an orphaned object is not visible to anything that could clean it up.

**Ceiling to name in a `ponytail:` comment:** the cutoffs are constants in the processor, not settings.
If an operator ever needs to change one without a deploy, that is when they move to config — not before.

### What this story does NOT own
- **Redis** — sessions, the denylist, rate-limit counters and [[F-23]]'s daily salt all carry a TTL.
  Redis expires them itself. Adding a sweep for keys the server already reaps is pure ceremony.
- **[[F-23]]'s `Event` 90-day prune** — F-23 ships after this story, so it adds **one row to this table**
  instead of writing its own prune loop. That is why this is sequenced before it.
- **[[AD-10]]'s `ActionLog`** — the audit log is retained long *on purpose*, for accountability. It is not
  garbage and must not be swept on a storage argument.

## Dependencies
- [[F-8]] — the BullMQ queue, worker and dead-letter this schedules on.
- [[DR-13]] — establishes the nightly-cron precedent this copies (separate queue, same shape).
- [[F-10]] — owns `cleanupOrphans`, whose unbounded `findMany` is fixed here.
- [[F-14]] — owns `DataExport` and the erasure processor whose deletes stay untouched.
- Unblocks [[F-23]], which adds its `Event` prune as one more sweep.

## Notes
- Excluded by design: a cron library (BullMQ repeatables already do this), a `Retention` config table, an
  admin UI for retention, soft-delete-then-hard-delete tombstones, table partitioning, per-sweep queues.
- Verification:
  - Unit-test the processor on the `close-call.processor.spec.ts` pattern (mocked Prisma, assert the exact
    `deleteMany` arguments and cutoffs), plus: one sweep throwing still runs the others, and the job then
    fails; the batch loop stops when a pass returns fewer than `take`.
  - Insert an expired `PasswordResetToken`, a `DataExport` past `expiresAt` with a media row, and a read
    `Notification` dated 100 days back; run the job by hand; assert all three are gone, the S3 object is
    gone, and that an **unread** 100-day-old notification and a live token both survive.
  - Assert `cleanupOrphans` issues a bounded query (`take`), not a full-table `findMany`.
