# DR-13 — Défiger les compteurs de tendance

**As a** reader browsing the platform, **I want** the "Tendances" surfaces to reflect what is actually popular right now, **so that** the home page, the catalogue and the gallery stop showing a ranking frozen at seed time.

> Screen(s): home "Tendances cette semaine", catalogue tri « tendance », galerie, [[MC-2]] matching · Priority: **Must** · Fidelity: **Inferred** (defect, not a drawn screen)

## Why this story exists (defect, not a feature)

`Work.weeklyLikeDelta`, `Work.priorWeekLikeDelta`, `Illustration.weeklyLikeDelta` and
`Profile.trendingScore` have **no writer anywhere in `apps/api`** — verified by audit, 2026-08-05. Only
`prisma/seed.js` ever sets them.

They are nonetheless **read in production** by:
- the home page « Tendances cette semaine » (`home.service.ts`, with `growthPercent()` at `:145`),
- the catalogue's *tendance* sort (`catalog.service.ts:60`),
- the gallery's trending illustrations,
- `matches.service.ts:207` (tie-break) and `partners.service.ts:25` (primary sort).

So every one of those rankings is frozen at whatever the fixtures contain and would never move in
production. `schema.prisma:557-558` says "DR-9/DR-4 recompute from events" — DR-9 shipped the like toggle
but never the recompute, and there are no events to recompute from.

**This story needs no events and no new tables**: `Favorite.createdAt` and `Reaction.createdAt` already
exist. That is what makes it shippable before [[F-23]].

## Backend
- **Nightly scheduled job** recomputing, over a rolling window:
  - `Work.weeklyLikeDelta` = `count(Favorite where workId = … and createdAt > now() - 7d)`;
    `Work.priorWeekLikeDelta` = the same for days 8→14.
  - `Illustration.weeklyLikeDelta` = `count(Reaction where targetType='illustration' and kind='like')` on the same window.
  - `Profile.trendingScore` = weighted sum over those windows. **Starting formula to confirm:** `reads7d + 3×likes7d`.
- Add `'analytics'` to `QUEUE_NAMES` (`packages/shared/src/queue.ts` — closed union) and register the cron
  in a module's `onModuleInit`, **copying the proven precedent** at `apps/api/src/media/media.module.ts:33`
  (`QueueService.schedule(queue, name, data, { pattern })` inside a try/catch so a Redis outage at boot is
  not fatal; BullMQ de-dups repeatables, so registering from both API and worker is safe).
- Processor registered per `apps/api/src/queue/README.md:78-83` — remember the `QUEUE_PROCESSORS` factory
  takes both an `inject` array **and** matching arguments (`queue.module.ts:53-65`).
- Business rule: deltas are **gross, not net** — un-liking deletes the row, so a removed like is invisible.
  Record this as a `ponytail:` comment; it is precisely what allows this to ship without an event table.

## Dependencies
- [[DR-9]] — shipped the like/save toggles whose `createdAt` this reads.
- [[F-8]] — the BullMQ queue and worker this schedules on.
- Unblocks nothing, but is **superseded in accuracy** by [[F-23]], which can later feed real read counts
  into `trendingScore`.

## Notes
- Ships the `analytics` queue + nightly cron seam that [[F-23]] and [[AD-7]] both hang off. That is a
  deliberate side benefit of doing this first.
- Verification: run the job by hand, assert in SQL that a work's `weeklyLikeDelta` equals
  `count(Favorite … last 7 days)`; add a like, re-run, watch it move; confirm the home and catalogue
  orderings change. Unit-test the processor on the `close-call.processor.spec.ts` pattern (mocked Prisma,
  assert the exact update arguments).
