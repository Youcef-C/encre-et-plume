import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { CloseCallJob } from '@encre-et-plume/shared';
import type { JobProcessor } from '../job-processor';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * MC-4: flips an "Appels à projets" call to `closed` when its deadline job fires. Scoped to
 * still-open rows, so an owner's early close (or a re-delivery) is a harmless no-op. The board's
 * derived-status read guarantees correctness even if this worker is down.
 */
@Injectable()
export class CloseCallProcessor implements JobProcessor<CloseCallJob> {
  readonly queue = 'calls' as const;
  private readonly logger = new Logger(CloseCallProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(data: CloseCallJob, _job: Job): Promise<void> {
    const { count } = await this.prisma.projectCall.updateMany({
      where: { id: data.callId, status: 'open' },
      data: { status: 'closed' },
    });
    if (count > 0) this.logger.log(`Auto-closed call ${data.callId}`);
  }
}
