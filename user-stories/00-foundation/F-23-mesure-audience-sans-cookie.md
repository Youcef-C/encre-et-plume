# F-23 — Mesure d'audience sans cookie

**As a** platform operator, **I want** to know how many people come, how much they read, how much they post and how many visitors become members, **so that** I can steer the product on measured facts instead of guesses.

> Screen(s): none of its own — feeds [[AD-7]] platform stats and [[PE-5]] editor trends · Priority: **Should** · Fidelity: **Inferred**

## Why this story exists

**Nothing is measured today.** No analytics SDK is installed. There is **no event, session or visit table
anywhere**: every behavioural table is a *mutable state* row, not an event. `ReadingProgress` is unique per
(account, chapter) with a `page` overwritten on each save — so we never learn *when* something was read.
`Favorite`, `WatchlistItem` and `Reaction` rows are **deleted** on toggle-off, leaving no history. The only
view signal is `Work.readCount++` (`reader.service.ts:41`): anonymous, undated, and not de-duplicated, so
it also inflates on refresh.

## Decisions already taken (2026-08-05)

- **Cookieless, consent-exempt.** Nothing is written to or read from browser storage, so art. 82 is never
  triggered and no banner gates the measurement.
  **Accepted cost:** uniques are **per-day only**. "Conversion" is `signups ÷ daily uniques`, **a rate, not
  a cohort** — a visitor is not followed to their signup. This must be labelled as such wherever it is
  displayed, or it will be misread.
- The existing `consent.audience` flag (`apps/web/lib/cookie-consent.tsx`) **stays unused, deliberately**.
  It only becomes the gate if a persistent identifier, cross-day cohorts or a third-party SDK ever ship.
- **"Publishing" is three numbers, not one** — see [[AD-7]].

## Backend

### Model — two tables, no more
- **`Event`** — append-only, 90-day rolling window: `id`, `at`, `kind` (`visit|read|signup|publish`),
  `visitorId?`, `accountId?`, `targetType?`, `targetId?`, `path?` (pathname only, never the query string),
  `ref?` (referrer **host** only). Indexes on `at`, `(kind, at)`, `(targetType, targetId, at)`.
- **`DailyStat`** — rollup kept 25 months (the privacy policy's cap): `@@id([day, metric, dim])`, `value`.
  `dim = ''` means platform total; otherwise a workId, genre or referrer host.
- **No `props Json` column.** Fixed columns; add one when a question needs it. A JSON grab-bag is how event
  tables become unqueryable.
- **Rates are never stored** — conversion, interaction rate and share-who-post are computed at read time
  from two series. [[PE-5]]'s missing "audience time-series" is literally
  `DailyStat where metric='reads' and dim=<workId>`.

### Visitor identifier
`visitorId = uuid_from(sha256(daily_salt ‖ ip ‖ user-agent))`, salt random per day in Redis with a 24 h TTL
(`analytics:salt:<yyyy-mm-dd>`). **The IP is never stored**, only the hash, and salt rotation kills the
identifier at midnight. Single site, no third party, no sharing, aggregate output — inside the CNIL
"strictement limitée" exemption.

### Ingestion — no write on the request path
- `POST /events`, optional session guard, returns **204** after: resolving the `visitorId`; **dropping bots**
  (`/bot|crawl|spider|preview/i` on the user-agent — without it the visitor count is wrong the day a
  sitemap ships); `RPUSH analytics:buffer`, **fail-open**.
- A BullMQ repeatable **every minute** pops up to 1000 and does **one** `createMany`. One connection, one
  round-trip, no external I/O inside the transaction — honours the `CLAUDE.md` rule that a connection is
  never held across an external call. Rejected: an in-process buffer flushed on `setInterval` — instances
  are stateless and multiple, so every deploy would lose it.
- **The browser emits `visit` only** — a `<Pageview/>` client component in `apps/web/app/layout.tsx`,
  `usePathname()` + `fetch(..., { keepalive: true, credentials: 'include' })`. Existing CORS already allows
  it; `sendBeacon` cannot carry credentials cross-origin, hence `keepalive`.
- **Everything else is emitted server-side where the write already happens** — a Redis push, no extra DB write:
  - `read` at `reader.service.ts:41`, wrapped in a **Redis `SETNX read:<visitorId>:<chapterId>` 30-minute
    dedupe that also guards the existing `readCount++`** — fixing that counter's inflation at its single
    writer, as a by-product.
  - `signup` in the auth service, **and** increment `signups_total`, declared but never incremented
    (`observability/metrics.service.ts:102`).

### Nightly aggregation (on [[DR-13]]'s cron)
1. Fill `DailyStat` for the previous day from `Event` **plus** from the business tables (`Work`, `Chapter`,
   `Illustration`, `Comment`, `Review`, `Account`). Those carry full history, so the **first run backfills
   every past day** on the publishing side.
2. Prune `Event` beyond 90 days, in batches, via the `at` index.
   **Ceiling to name in a comment:** if the prune slows, move `Event` to monthly partitions — do not
   pre-partition.

### Privacy
- `Event.accountId` is set only when signed in. That makes events personal data → they must appear in the
  [[F-14]] export, and erasure must **anonymise rather than delete** (`accountId = NULL`), so aggregates stay
  correct. This is already the house convention — see `account-erasure.processor.ts:61`
  ("Notification sent — updateMany sourceUserId=null (anonymize)").
- Resolve the `[À CHOISIR]` on the « Mesure d'audience » processing in
  `legal/politique-de-confidentialite.md` to **intérêt légitime, mesure strictement limitée**, and describe
  the rotating cookieless identifier.
- No behavioural profile of an individual, and nothing feeds advertising — DSA art. 28 forbids
  profiling-based ads to minors, and the platform admits users from 15.

## Dependencies
- [[DR-13]] — ships the `analytics` queue and the nightly cron this reuses.
- [[F-8]] — BullMQ queue and worker.
- [[F-14]] — export and erasure hooks.
- [[F-13]] — the consent seam that stays deliberately unused.
- Feeds [[AD-7]] and [[PE-5]].

## Notes
- **Do not merge with [[AD-10]] `ActionLogService`** (14 `ponytail:` seams reference it). The audit log is
  per-actor, identified and retained long, for accountability; analytics is aggregate, pseudonymous and
  retained 90 days. Merging forces the audit retention onto audience data and breaks the CNIL exemption.
- Explicitly excluded: any third-party SDK, any cookie, per-person funnels, a charting library, a `props
  Json` column, partitioning, ClickHouse/Timescale.
- Verification: load a page → a `visit` row exists; reload within 30 min → no duplicate `read`; the
  `visitorId` **changes after salt rotation**; a bot user-agent writes nothing; the rollup matches raw
  counts; and **no cookie or storage entry is created** (browser Application tab).
