import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { QueueService } from './queue.service';
import { QUEUE_NAMES, DEAD_LETTER_QUEUE } from '@encre-et-plume/shared';
import type { QueueHealthResponse } from '@encre-et-plume/shared';

/** admin-only queue health endpoint — reads Redis only, no DB, no Stripe. */
@Controller('admin/queues')
@UseGuards(SessionGuard, RolesGuard)
export class QueueHealthController {
  constructor(private readonly queueService: QueueService) {}

  @Get('health')
  @Roles('admin')
  async health(): Promise<QueueHealthResponse> {
    const [queueCountsArr, dlCounts] = await Promise.all([
      Promise.all(
        QUEUE_NAMES.map(async (name) => {
          const counts = await this.queueService.getCounts(name);
          return {
            name,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
          };
        }),
      ),
      this.queueService.getCounts(DEAD_LETTER_QUEUE),
    ]);

    return {
      queues: queueCountsArr,
      deadLetter: (dlCounts.waiting ?? 0) + (dlCounts.delayed ?? 0),
      generatedAt: new Date().toISOString(),
    };
  }
}
