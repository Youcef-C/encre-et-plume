import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

/**
 * F-9 seam: logs via Nest Logger now; F-9 swaps in Sentry + queue depth/throughput/duration metrics
 * and dead-letter/backlog alerts.
 * ponytail: named stub — log calls are the upgrade path markers for F-9.
 */
@Injectable()
export class JobMetrics {
  private readonly logger = new Logger(JobMetrics.name);

  onJobCompleted(job: Job): void {
    this.logger.debug(`completed queue=${job.queueName} id=${job.id}`);
  }

  onJobFailed(job: Job | undefined, err: Error): void {
    this.logger.warn(`failed queue=${job?.queueName} id=${job?.id} reason=${err.message}`);
  }

  /** F-9 alert hook: fires when a job moves to the dead-letter queue. */
  onDeadLetter(queue: string, jobId: string | undefined, err: Error): void {
    this.logger.error(`dead-letter queue=${queue} jobId=${jobId} reason=${err.message}`);
  }
}
