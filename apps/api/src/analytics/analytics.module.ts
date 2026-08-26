import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { QueueService } from '../queue/queue.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RedisService } from '../redis/redis.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';

/**
 * DR-13 owns the `analytics` queue's cron; F-23 hangs two more job names off it (`flush-events`
 * every minute, `rollup-daily` nightly) rather than opening a second queue — TrendingProcessor
 * already branches on `job.name`, so one switch stays in one file.
 *
 * Loaded by AppModule, so the API and the worker (same module graph) both register the
 * repeatables; BullMQ de-dups them by (name, pattern), so that is idempotent.
 */
@Module({
  imports: [
    JwtModule.register({ secret: getJwtSecret(), signOptions: { expiresIn: '7d' } }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RedisService, OptionalSessionGuard],
  exports: [AnalyticsService], // ReaderModule + AuthModule emit `read` / `signup` through it
})
export class AnalyticsModule implements OnModuleInit {
  constructor(private readonly queue: QueueService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.schedule('analytics', 'recompute-trending', {}, { pattern: '0 3 * * *' });
      // F-23 B8: the buffer→Postgres flush. One minute is the whole write-batching window; an
      // in-process interval would lose the buffer on every deploy (instances are stateless).
      await this.queue.schedule('analytics', 'flush-events', {}, { pattern: '* * * * *' });
      // F-23 B13: yesterday's rollup, alongside the trending recompute.
      await this.queue.schedule('analytics', 'rollup-daily', {}, { pattern: '0 3 * * *' });
    } catch {
      // Non-fatal: the recompute is best-effort; Redis may be unavailable at startup
    }
  }
}
