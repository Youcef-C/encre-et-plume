import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobProcessor } from '../job-processor';
import { EVENT_KINDS } from '@encre-et-plume/shared';
import type { DailyMetric, EventKind } from '@encre-et-plume/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BUFFER_KEY } from '../../analytics/analytics.service';
import type { BufferedEvent } from '../../analytics/analytics.service';

const DAY_MS = 864e5;
/** B5 starting formula: `reads7d + 3 × likes7d`. */
const LIKE_WEIGHT = 3;
/** F-23 B8: one round-trip per minute. Ceiling: raise the cron rate before raising this. */
const FLUSH_BATCH = 1000;
/** The 60s read caches whose payloads are ordered by the columns this job rewrites (D-2). */
const CACHE_PREFIXES = [
  'home:*',
  'catalog:list:*',
  'gallery:list:*',
  'collections:list:*',
  'ranking:*',
] as const;

/**
 * DR-13: nightly recompute of the denormalized trending columns
 * (`Work.weeklyLikeDelta` / `Work.priorWeekLikeDelta`, `Illustration.weeklyLikeDelta`,
 * `Profile.trendingScore`). Before this, nothing but `prisma/seed.js` ever wrote them, so every
 * "tendance" ranking was frozen at seed time.
 *
 * ponytail: deltas are GROSS, not net — un-liking deletes the `Favorite`/`Reaction` row, so a
 * removed like is simply invisible to the count rather than subtracted. That is exactly what lets
 * DR-13 ship with no event table and no migration; F-23 (read/like events) is what makes it net.
 */
@Injectable()
export class TrendingProcessor implements JobProcessor<Record<string, never>> {
  readonly queue = 'analytics' as const;
  readonly concurrency = 1; // one full-table recompute at a time
  private readonly logger = new Logger(TrendingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async process(_data: Record<string, never>, job: Job): Promise<void> {
    // One switch, one file — F-23 hangs its two jobs off DR-13's queue rather than opening a second.
    if (job.name === 'flush-events') return this.flushEvents();
    if (job.name === 'rollup-daily') return this.rollupDaily();
    if (job.name !== 'recompute-trending') return;

    const now = Date.now();
    const d7 = new Date(now - 7 * DAY_MS);
    const d14 = new Date(now - 14 * DAY_MS);

    // ── 1 · Work (B2, B3) ────────────────────────────────────────────────────
    const favCur = await this.prisma.favorite.groupBy({
      by: ['workId'],
      where: { createdAt: { gte: d7 } },
      _count: { _all: true },
    });
    const favPrior = await this.prisma.favorite.groupBy({
      by: ['workId'],
      where: { createdAt: { gte: d14, lt: d7 } },
      _count: { _all: true },
    });
    const likesByWork = new Map(favCur.map((r) => [r.workId, r._count._all]));
    const priorByWork = new Map(favPrior.map((r) => [r.workId, r._count._all]));

    // The reset is the whole point: without it, yesterday's winner keeps its stale delta forever
    // because it no longer appears in the groupBy. Scoped to non-zero rows so it is a cheap no-op.
    await this.prisma.work.updateMany({
      where: { OR: [{ weeklyLikeDelta: { not: 0 } }, { priorWeekLikeDelta: { not: 0 } }] },
      data: { weeklyLikeDelta: 0, priorWeekLikeDelta: 0 },
    });
    // ponytail: one UPDATE per row that had activity in the last 14 days. Ceiling: if that set
    // grows past a few thousand rows a night, fold it into one `UPDATE … FROM (VALUES …)`.
    for (const workId of new Set([...likesByWork.keys(), ...priorByWork.keys()])) {
      await this.prisma.work.updateMany({
        where: { id: workId },
        data: {
          weeklyLikeDelta: likesByWork.get(workId) ?? 0,
          priorWeekLikeDelta: priorByWork.get(workId) ?? 0,
        },
      });
    }

    // ── 2 · Illustration (B4) ────────────────────────────────────────────────
    const illCur = await this.prisma.reaction.groupBy({
      by: ['targetId'],
      where: { targetType: 'illustration', kind: 'like', createdAt: { gte: d7 } },
      _count: { _all: true },
    });
    const likesByIllustration = new Map(illCur.map((r) => [r.targetId, r._count._all]));

    await this.prisma.illustration.updateMany({
      where: { weeklyLikeDelta: { not: 0 } },
      data: { weeklyLikeDelta: 0 },
    });
    for (const [id, count] of likesByIllustration) {
      await this.prisma.illustration.updateMany({ where: { id }, data: { weeklyLikeDelta: count } });
    }

    // ── 3 · Profile (B5, D-1) ────────────────────────────────────────────────
    // D-1: `reads7d` comes from ReadingProgress.updatedAt — the only dated read signal that exists
    // before F-23. It under-counts (one row per account+chapter, overwritten in place) but it moves.
    const readCur = await this.prisma.readingProgress.groupBy({
      by: ['workId'],
      where: { updatedAt: { gte: d7 } },
      _count: { _all: true },
    });
    const readsByWork = new Map(readCur.map((r) => [r.workId, r._count._all]));

    const workIds = [...new Set([...likesByWork.keys(), ...readsByWork.keys()])];
    const creators = await this.prisma.workCreator.findMany({
      where: { workId: { in: workIds } },
      select: { workId: true, accountId: true },
    });
    const artists = await this.prisma.illustration.findMany({
      where: { id: { in: [...likesByIllustration.keys()] } },
      select: { id: true, artistId: true },
    });

    const scores = new Map<string, number>();
    const add = (accountId: string, points: number) =>
      scores.set(accountId, (scores.get(accountId) ?? 0) + points);
    for (const c of creators) {
      add(
        c.accountId,
        (readsByWork.get(c.workId) ?? 0) + LIKE_WEIGHT * (likesByWork.get(c.workId) ?? 0),
      );
    }
    for (const a of artists) {
      if (a.artistId) add(a.artistId, LIKE_WEIGHT * (likesByIllustration.get(a.id) ?? 0));
    }

    await this.prisma.profile.updateMany({
      where: { trendingScore: { not: 0 } },
      data: { trendingScore: 0 },
    });
    for (const [accountId, trendingScore] of scores) {
      await this.prisma.profile.updateMany({ where: { accountId }, data: { trendingScore } });
    }

    // ── 4 · D-2: drop the 60s read caches so the new ordering is visible immediately ──
    for (const pattern of CACHE_PREFIXES) await this.redis.delByPattern(pattern);

    this.logger.log(
      `trending recompute: works=${workIds.length} illustrations=${likesByIllustration.size} profiles=${scores.size}`,
    );
  }

  // ── F-23 · flush-events (B8) ───────────────────────────────────────────────

  /**
   * Drain up to FLUSH_BATCH buffered events into ONE createMany.
   *
   * The pop happens FIRST and completes before Prisma is touched: a connection is never held open
   * across a Redis round-trip. The cost of that ordering is that a crash between the two loses one
   * batch — the correct trade for audience data, which is explicitly allowed to be lossy.
   */
  private async flushEvents(): Promise<void> {
    const raw = await this.redis.lpopCount(BUFFER_KEY, FLUSH_BATCH);
    if (raw.length === 0) return; // empty buffer → no DB call at all

    const data = raw.map(parseBufferedEvent).filter((e): e is EventRow => e !== null);
    if (data.length === 0) return;

    await this.prisma.event.createMany({ data });
    this.logger.log(`event flush: buffered=${raw.length} written=${data.length}`);
  }

  // ── F-23 · rollup-daily (B13, B5) ──────────────────────────────────────────

  /**
   * Roll yesterday up into `DailyStat`. Idempotent by construction: every write is an upsert on the
   * composite PK that SETS the value, so re-running a day (a retry, a manual replay) converges
   * instead of doubling. **No rate is ever stored** (B5) — AD-7's conversion and PE-5's interaction
   * rate are two of these series divided at read time, so a stored rate can never go stale against
   * its own numerator.
   */
  private async rollupDaily(): Promise<void> {
    const { start, end } = previousUtcDay(new Date());

    // ── Event side — always exactly yesterday, on the `at` index ─────────────
    const where = { at: { gte: start, lt: end } };

    const byKind = await this.prisma.event.groupBy({ by: ['kind'], where, _count: { _all: true } });
    const counted = new Map(byKind.map((r) => [r.kind, r._count._all]));
    await this.put(start, 'visits', '', counted.get('visit') ?? 0);
    await this.put(start, 'reads', '', counted.get('read') ?? 0);
    await this.put(start, 'signups', '', counted.get('signup') ?? 0);

    // Uniques are PER-DAY ONLY and cannot become a cohort: the salt rotates at midnight, so
    // yesterday's visitorId is unreachable today. That is the accepted cost of the exemption.
    // ponytail: one row per distinct visitor. Ceiling: if a day's uniques reach six figures,
    // swap this for a raw `COUNT(DISTINCT "visitorId")`.
    const visitors = await this.prisma.event.groupBy({
      by: ['visitorId'],
      where: { ...where, kind: 'visit' },
    });
    await this.put(start, 'uniques', '', visitors.filter((v) => v.visitorId !== null).length);

    // PE-5's "audience time-series" is literally `metric='reads' and dim=<workId>`.
    const readsByWork = await this.prisma.event.groupBy({
      by: ['targetId'],
      where: { ...where, kind: 'read', targetType: 'work' },
      _count: { _all: true },
    });
    for (const r of readsByWork) {
      if (r.targetId) await this.put(start, 'reads', r.targetId, r._count._all);
    }

    // Acquisition: visits per referrer HOST. `ref = null` is direct traffic and needs no dim row —
    // it is `visits(dim='') − Σ visits(dim=host)`.
    const visitsByRef = await this.prisma.event.groupBy({
      by: ['ref'],
      where: { ...where, kind: 'visit' },
      _count: { _all: true },
    });
    for (const r of visitsByRef) {
      if (r.ref) await this.put(start, 'visits', r.ref, r._count._all);
    }

    // ── Publishing side — from the business tables, which carry full history ──
    // "Publishing" is three numbers, not one (AD-7): works, chapters and illustrations move
    // independently, and collapsing them hides which one stalled.
    for (const src of this.businessSources()) {
      // First run for this metric → scan the whole history and backfill every past day. After
      // that, yesterday alone. ponytail: the backfill is a one-column scan, run once per metric.
      const done = await this.prisma.dailyStat.findFirst({ where: { metric: src.metric } });
      const dates = await src.dates(done ? start : null, end);
      for (const [day, value] of bucketByDay(dates)) {
        await this.put(new Date(`${day}T00:00:00.000Z`), src.metric, '', value);
      }
    }

    this.logger.log(`daily rollup: day=${start.toISOString().slice(0, 10)}`);
  }

  /** One `DailyStat` cell. `upsert` SETS the value — never increments (idempotence). */
  private async put(day: Date, metric: DailyMetric, dim: string, value: number): Promise<void> {
    await this.prisma.dailyStat.upsert({
      where: { day_metric_dim: { day, metric, dim } },
      create: { day, metric, dim, value },
      update: { value },
    });
  }

  /**
   * The dated column each publishing metric counts. One closure per source, returning just the
   * dates — bucketing in JS keeps this plain Prisma (`groupBy` cannot bucket by day) and keeps the
   * one-time backfill and the nightly pass on a single code path.
   */
  private businessSources(): { metric: DailyMetric; dates: (since: Date | null, until: Date) => Promise<Date[]> }[] {
    const range = (since: Date | null, until: Date) => ({ ...(since ? { gte: since } : {}), lt: until });
    return [
      {
        metric: 'works',
        dates: (since, until) =>
          this.prisma.work
            .findMany({ where: { publishedAt: { not: null, ...range(since, until) } }, select: { publishedAt: true } })
            .then((rows) => rows.map((r) => r.publishedAt as Date)),
      },
      {
        metric: 'chapters',
        dates: (since, until) =>
          this.prisma.chapter
            .findMany({ where: { createdAt: range(since, until) }, select: { createdAt: true } })
            .then((rows) => rows.map((r) => r.createdAt)),
      },
      {
        metric: 'illustrations',
        dates: (since, until) =>
          this.prisma.illustration
            .findMany({ where: { publishedAt: { not: null, ...range(since, until) } }, select: { publishedAt: true } })
            .then((rows) => rows.map((r) => r.publishedAt as Date)),
      },
      {
        metric: 'reviews',
        dates: (since, until) =>
          this.prisma.review
            .findMany({ where: { createdAt: range(since, until) }, select: { createdAt: true } })
            .then((rows) => rows.map((r) => r.createdAt)),
      },
      {
        metric: 'accounts',
        dates: (since, until) =>
          this.prisma.account
            .findMany({ where: { createdAt: range(since, until) }, select: { createdAt: true } })
            .then((rows) => rows.map((r) => r.createdAt)),
      },
    ];
  }
}

/** [00:00, 24:00) UTC of the day before `now`. */
function previousUtcDay(now: Date): { start: Date; end: Date } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start: new Date(end.getTime() - DAY_MS), end };
}

/** `yyyy-mm-dd` → how many of the given dates fall on it. */
function bucketByDay(dates: Date[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const d of dates) {
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return byDay;
}

/** Exactly the columns `Event` declares — anything else in the buffer is dropped, IPs included. */
type EventRow = {
  kind: EventKind;
  at: Date;
  visitorId: string | null;
  accountId: string | null;
  targetType: string | null;
  targetId: string | null;
  path: string | null;
  ref: string | null;
};

/** A corrupt entry must cost its own row, never the whole batch. */
function parseBufferedEvent(raw: string): EventRow | null {
  let e: BufferedEvent;
  try {
    e = JSON.parse(raw) as BufferedEvent;
  } catch {
    return null;
  }
  if (!EVENT_KINDS.includes(e?.kind)) return null;
  const at = new Date(e.at);
  if (Number.isNaN(at.getTime())) return null;

  return {
    kind: e.kind,
    at, // server-stamped at ingest (D-5)
    visitorId: e.visitorId ?? null,
    accountId: e.accountId ?? null,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    path: e.path ?? null,
    ref: e.ref ?? null,
  };
}
