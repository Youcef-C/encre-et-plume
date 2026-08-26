import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobProcessor } from '../job-processor';
import { PrismaService } from '../../prisma/prisma.service';
import { PrivacyService } from '../../privacy/privacy.service';
import { MediaService } from '../../media/media.service';
import { SWEEP_PAGE, afterCursor, sweepPaged } from '../../maintenance/sweep';

const DAY_MS = 24 * 60 * 60 * 1000;

// ponytail: the cutoffs are constants, not settings. If an operator ever needs to change one
// without a deploy, that is when they move to config — not before.
const NOTIF_RETENTION_D = 90;
const SCENARIO_RETENTION_D = 30;

/** One sweep = a name and something that deletes garbage and says how much. Not a framework. */
type Sweep = { name: string; run: () => Promise<number> };

/**
 * F-25: the nightly garbage collector. Every table that only ever grows gets one sweep here.
 * A sweep failing is logged and the rest still run; the job then fails so F-8's dead-letter sees it.
 */
@Injectable()
export class MaintenanceProcessor implements JobProcessor<Record<string, never>> {
  readonly queue = 'maintenance' as const;
  readonly concurrency = 1;
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly media: MediaService,
  ) {}

  async process(_data: Record<string, never>, _job: Job): Promise<void> {
    const sweeps: Sweep[] = [
      { name: 'auth-tokens', run: () => this.sweepAuthTokens() },
      // Both of these already existed; F-25 wires them to the cron and bounds them.
      { name: 'data-exports', run: () => this.privacy.purgeExpiredExports() },
      { name: 'media-orphans', run: () => this.media.cleanupOrphans() },
      { name: 'notifications', run: () => this.sweepNotifications() },
      { name: 'scenario-updates', run: () => this.sweepScenarioUpdates() },
    ];

    const failed: string[] = [];
    for (const sweep of sweeps) {
      const started = Date.now();
      try {
        const swept = await sweep.run();
        this.logger.log(`gc ${sweep.name}: swept=${swept} in ${Date.now() - started}ms`);
      } catch (err: unknown) {
        failed.push(sweep.name);
        this.logger.error(`gc ${sweep.name} failed: ${(err as Error).message}`);
      }
    }

    if (failed.length > 0) throw new Error(`gc sweeps failed: ${failed.join(', ')}`);
  }

  /** B4 — expired tokens, consumed or not: past `expiresAt` they are equally garbage. */
  private async sweepAuthTokens(): Promise<number> {
    // One `now` for all three tables, so they are swept against the same cutoff.
    const now = new Date();
    const page = (cursor: string | null) => ({
      where: { expiresAt: { lt: now }, ...afterCursor(cursor) },
      take: SWEEP_PAGE,
      orderBy: { id: 'asc' as const },
      select: { id: true as const },
    });
    const ids = (rows: { id: string }[]) => ({ where: { id: { in: rows.map((r) => r.id) } } });

    // Three explicit calls rather than one loop over a cast array: Prisma's per-model generics are
    // what catch a typo in `where`, and a union of the three delegates erases them.
    return (
      (await sweepPaged<{ id: string }>(
        (c) => this.prisma.emailVerificationToken.findMany(page(c)),
        async (rows) => (await this.prisma.emailVerificationToken.deleteMany(ids(rows))).count,
      )) +
      (await sweepPaged<{ id: string }>(
        (c) => this.prisma.passwordResetToken.findMany(page(c)),
        async (rows) => (await this.prisma.passwordResetToken.deleteMany(ids(rows))).count,
      )) +
      (await sweepPaged<{ id: string }>(
        (c) => this.prisma.emailChangeToken.findMany(page(c)),
        async (rows) => (await this.prisma.emailChangeToken.deleteMany(ids(rows))).count,
      ))
    );
  }

  /** B6 + B9 — read notifications past retention. An unread badge is a product decision, not garbage. */
  private async sweepNotifications(): Promise<number> {
    const cutoff = new Date(Date.now() - NOTIF_RETENTION_D * DAY_MS);
    return sweepPaged<{ id: string }>(
      (cursor) =>
        this.prisma.notification.findMany({
          where: { readAt: { not: null }, createdAt: { lt: cutoff }, ...afterCursor(cursor) },
          take: SWEEP_PAGE,
          orderBy: { id: 'asc' },
          select: { id: true },
        }),
      async (rows) =>
        (await this.prisma.notification.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })).count,
    );
  }

  /**
   * B7 — every update past retention, unconditionally. Safe because `ScenarioUpdate` is write-only:
   * it is created by the editor gateway and emptied wholesale by autosave, and **no code path reads
   * a row back**, so a row this old belongs to a session that ended without a save and its bytes
   * cannot surface to any user.
   */
  private async sweepScenarioUpdates(): Promise<number> {
    const cutoff = new Date(Date.now() - SCENARIO_RETENTION_D * DAY_MS);
    return sweepPaged<{ id: string }>(
      (cursor) =>
        this.prisma.scenarioUpdate.findMany({
          where: { createdAt: { lt: cutoff }, ...afterCursor(cursor) },
          take: SWEEP_PAGE,
          orderBy: { id: 'asc' },
          select: { id: true },
        }),
      async (rows) =>
        (await this.prisma.scenarioUpdate.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } }))
          .count,
    );
  }
}
