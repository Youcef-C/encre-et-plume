import { Module, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';

/**
 * DR-13: no controllers, no providers — this module exists only to own the nightly `analytics`
 * cron. Loaded by AppModule, so the API and the worker (same module graph) both register it;
 * BullMQ de-dups repeatables by pattern, so that is idempotent.
 */
@Module({})
export class AnalyticsModule implements OnModuleInit {
  constructor(private readonly queue: QueueService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.schedule('analytics', 'recompute-trending', {}, { pattern: '0 3 * * *' });
    } catch {
      // Non-fatal: the recompute is best-effort; Redis may be unavailable at startup
    }
  }
}
