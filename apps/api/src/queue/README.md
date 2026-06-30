# Queue system — F-8

BullMQ on the existing Redis ([[F-1]]), with a dedicated worker process that shares the full NestJS module graph (NOT a microservice). Queue wiring is encapsulated in `QueueModule`; feature code only calls `QueueService.enqueue()`.

## Queues and owners

| Queue | Owner story | Status |
|-------|-------------|--------|
| `notifications-fanout` | F-8 (this story) | **Live** — `NotificationsFanoutProcessor` |
| `email` | future email story | Named seam; processor lands with owner |
| `image-processing` | F-10 (media storage) | Named seam; processor lands with F-10 |
| `stripe-events` | MR-1/MR-3/MR-4/MR-6 | **DEFERRED to MR** — see below |
| `payouts` | MR-3/MR-4 | **DEFERRED to MR** — see below |
| `dead-letter` | all | Permanent failures land here; never silently dropped |

---

## DEFERRED: Stripe / money path (builds in the MR epic)

**Do NOT implement this in F-8.** Stripe is not installed. This section documents the exact flow the MR epic must wire.

### Reliable Stripe webhook flow

```
Stripe → POST /webhooks/stripe
  1. Verify signature (stripe.webhooks.constructEvent) → 400 if invalid
  2. Persist raw event in ProcessedEvent table (dedup on event.id):
       prisma.processedEvent.upsert({ where: { eventId: event.id }, ... })
     If already exists → return 200 immediately (already enqueued on first receipt)
  3. Return 200 fast (< 5 s, Stripe times out otherwise)
  4. queueService.enqueue('stripe-events', event.type, { eventId: event.id, raw: event },
       { idempotencyKey: event.id, attempts: 5, backoffMs: 2000 })
```

### Stripe worker processor (inside ACID transaction)

```ts
// StripeEventsProcessor.process(data)
await prisma.$transaction(async (tx) => {
  // Re-check idempotency inside txn — Redis key guards at-most-once delivery,
  // Postgres ProcessedEvent guards exactly-once money writes.
  const already = await tx.processedEvent.findUnique({ where: { eventId: data.eventId } });
  if (already?.processedAt) return; // already handled — no-op

  // ... handle event.type: subscription created/updated, payment succeeded, etc.

  await tx.processedEvent.update({
    where: { eventId: data.eventId },
    data: { processedAt: new Date() },
  });
});
```

### Reconciliation (scheduled job)

```ts
// Runs nightly via queueService.schedule('stripe-events', 'reconcile', {}, { pattern: '0 2 * * *' })
// Compares local subscription/payment state vs Stripe API; patches drift.
```

### Money correctness rule

The queue does NOT replace DB transactions. Money writes happen in `prisma.$transaction` + the `ProcessedEvent` idempotency key; the queue provides reliable async retrying/ordering AROUND them. A permanently failed payout job lands in `dead-letter` for manual review — never silently dropped.

### Future Prisma model (MR seam)

```prisma
model ProcessedEvent {
  id          String   @id @default(cuid())
  eventId     String   @unique   // Stripe event.id
  createdAt   DateTime @default(now())
  processedAt DateTime?          // null = enqueued but not yet processed
}
```

---

## Adding a new processor

1. Create `src/queue/processors/<name>.processor.ts` implementing `JobProcessor<T>`.
2. Add the class to `QueueModule` providers.
3. Extend the `QUEUE_PROCESSORS` factory: add it to `inject` and the factory return array.
4. Write a unit test + integration test.

## Running the worker

```bash
# Dev (watch mode):
pnpm --filter @encre-et-plume/api worker

# Prod:
node apps/api/dist/worker.js
```

## Environment variables

| Var | Default | Description |
|-----|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection (shared with BullMQ) |
| `BULLMQ_PREFIX` | `{bull}` | Queue key prefix (override in tests for isolation) |
| `JWT_SECRET` | `dev-secret-change-in-prod` | Session JWT secret |
