# F-26 — Une seule fabrique de clients Redis

**As a** platform operator, **I want** every Redis connection in the API to be built by one factory with tested outage behaviour, **so that** the next connection someone adds cannot silently reintroduce the hang that shipped undetected for four stories.

> Screen(s): none — infrastructure · Priority: **Should** · Fidelity: **Inferred** (prevention, not a live defect)

## Why this story exists

[[F-23]] took **three review rounds**, and two of them were spent on the same class of bug: a Redis
client constructed without the options that make failure *fail*. All three sites are fixed today. What is
not fixed is the thing that produced them.

**The failure mode.** ioredis defaults to `enableOfflineQueue: true` and no `commandTimeout`. During an
outage a command is therefore **queued awaiting reconnection rather than rejected** — so a `.catch()`
fail-open never fires, and the caller waits forever. Measured directly during F-23 round 3 (a throwaway
client against a closed port): **unconfigured `get()` was still pending after 1 s; the configured one
rejected.** In production this hung chapter reads and signups, and crashed the worker process via
`WorkerRunner`'s idempotency check.

**Why nobody saw it.** Every Redis mock in the suite rejects *instantly*. That exercises the `.catch()`
branch while proving nothing about whether the promise settles at all — the exact case an outage produces.
2 700 green tests said nothing. The only test that catches this is one that uses a **real** client against
a dead port.

**Why it happened three times.** There is no shared constructor. Four construction paths exist, in four
files, each with different correct options:

| Site | Client | Correct profile |
|---|---|---|
| `redis/redis.service.ts:10` | general commands | `commandTimeout`, `maxRetriesPerRequest: 1`, `enableOfflineQueue: false` |
| `queue/queue.service.ts:51` | BullMQ idempotency | same as above |
| `messaging/redis-io.adapter.ts:25` | socket.io pub/sub | `enableOfflineQueue: false`, **no `commandTimeout`**, **and an awaited `ready` before first use** — see the boot bug below |
| `queue/queue.service.ts:15-27` (`parseBullmqOpts`) | BullMQ's own connection | **`maxRetriesPerRequest: null`** — BullMQ requires it; the opposite of the others |

Three of those four are subtly different, and one is the *inverse* of the rest. That is not a rule anyone
holds in their head while adding a fifth client — it is a factory.

**The pub/sub profile proved that the hard way, after F-23 had already "fixed" all three sites.** Commit
`04c7b67` set `enableOfflineQueue: false` on the socket.io clients — correct for bounding memory, and it
made the API **fail to boot every time**. A subscriber's first command is issued *before* ioredis finishes
connecting, and with the offline queue disabled ioredis throws
`Stream isn't writeable and enableOfflineQueue options is false` instead of buffering it, so the process
died before `listen()`. Reproduced directly: the shipped options threw on `psubscribe`; the same options
plus an awaited `ready` succeeded. Nothing caught it because no Jest spec boots the WS adapter and
`pnpm build` never starts a server — it surfaced only when the next story tried to run e2e.

So the pub/sub profile is not "the command profile minus `commandTimeout`". It additionally needs a
**capped wait for `ready` before the client is handed to `createAdapter`**. That is three non-obvious
rules for one of four profiles, which is the argument for this story in one paragraph.

## Backend

### One module, three named profiles
- `apps/api/src/redis/redis-client.factory.ts` — exports a single `createRedisClient(profile)` where
  `profile` is `'command' | 'pubsub'`, plus the existing `parseBullmqOpts` moved here as the `'bullmq'`
  case. The per-profile options and **the reason each differs** live in this one file, as a table, not
  scattered across four.
- Every site above constructs through it. `RedisService`, `QueueService` and `RedisIoAdapter` keep their
  current behaviour exactly — this is a move, not a redesign.
- The `quit().catch(() => disconnect())` shutdown fallback is currently copy-pasted three times (disabling
  the offline queue makes `QUIT` itself reject while Redis is down, and without the fallback the socket and
  its reconnect timer hold the process open). Fold it into the factory's returned client or a shared
  `closeRedis(client)` helper.

### The guard that actually prevents a fifth one
- **A test that fails on a bare `new Redis(`** outside the factory file — a `grep`-style assertion over
  `apps/api/src`, or an ESLint `no-restricted-syntax` rule. Cheap, and it is the only thing that stops this
  recurring. Without it the factory is a convention, and conventions lost three times already.

### The outage test, promoted
- `queue.service.outage.spec.ts` and the `RedisService` outage block ([[F-23]]) both point a **real ioredis
  at `127.0.0.1:1`** and assert the call settles within ~1 s. Generalise that into one parameterised suite
  covering every profile the factory produces, so a new profile inherits the test by construction.
- **Do not replace it with a mock.** A mock that rejects instantly is precisely the blind spot being closed.

### Explicitly NOT in scope
- **Do not change any fail-open/fail-closed decision.** The split is deliberate and correct: `getOrThrow` /
  `incrOrThrow` fail **closed** (rate limiting → 429 at `auth.controller.ts:204`, session denylist →
  request rejected at `session-token.ts:42`), while `get` / `set` fail **open** for caches. F-26 moves
  construction, not policy.
- No connection pooling, no Redis Cluster/Sentinel support, no retry/backoff redesign, no new health check
  beyond the [[F-9]] probe that already exists.
- Not a rewrite of `RedisService`'s method surface.

## Dependencies
- [[F-23]] — fixed all three sites and produced the measurement this story is built on.
- [[F-8]] — owns BullMQ's connection and the `parseBullmqOpts` constraint.
- [[F-9]] — the readiness probe and dashboards that surface a degraded Redis.
- [[MC-9]] — owns the socket.io Redis adapter, the one client that must **not** take a `commandTimeout`.

## Notes
- **Accepted, do not re-flag:** a merely *slow* Redis (>200 ms) now converts to 429s on auth, rejected
  sessions, and 503s on 18+ content, where it previously waited. That is the correct direction for
  fail-closed controls and was decided in F-23 round 3. F-26 must preserve it, not "improve" it.
- Verification:
  - Every `new Redis(` in `apps/api/src` outside the factory is gone, and the guard test fails when one is
    reintroduced (prove it by adding one temporarily).
  - The parameterised outage suite passes for each profile against a dead port, and the pub/sub profile is
    asserted to carry **no** `commandTimeout` **and** to wait for `ready` before its first subscribe —
    `messaging/redis-io.adapter.spec.ts` is the existing regression test for that and must keep passing.
  - `pnpm test` and a real `docker stop <redis>` smoke both behave exactly as they do after F-23: the
    ingest endpoint 204s, chapter reads and signups complete, the worker does not crash.
