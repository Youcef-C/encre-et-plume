import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobProcessor } from '../job-processor';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const DAY_MS = 864e5;
/** B5 starting formula: `reads7d + 3 × likes7d`. */
const LIKE_WEIGHT = 3;
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
    if (job.name !== 'recompute-trending') return; // F-23 / AD-7 branch here on the same queue

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
}
