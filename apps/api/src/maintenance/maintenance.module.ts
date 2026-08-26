import { Module, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';

/**
 * F-25: no controllers, no providers — this module exists only to own the nightly `maintenance`
 * cron (the retention sweeps live in MaintenanceProcessor). Loaded by AppModule, so the API and
 * the worker both register it; BullMQ de-dups repeatables by pattern, so that is idempotent.
 *
 * 04:00 — one hour after DR-13's 03:00 analytics recompute, so the two nightly jobs do not contend.
 */
@Module({})
export class MaintenanceModule implements OnModuleInit {
  constructor(private readonly queue: QueueService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.schedule('maintenance', 'gc', {}, { pattern: '0 4 * * *' });
    } catch {
      // Non-fatal: the sweeps are best-effort; Redis may be unavailable at startup
    }
  }
}
