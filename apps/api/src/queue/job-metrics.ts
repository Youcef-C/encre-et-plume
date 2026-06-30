import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import { MetricsService } from '../observability/metrics.service';
import { isSentryEnabled } from '../observability/sentry';

/**
 * F-9 seam wired: now records Prometheus counters + captures failures to Sentry.
 * ObservabilityModule is @Global() so MetricsService is injectable here via DI.
 * ponytail: @Optional() so F-8 integration tests that don't boot ObservabilityModule still work.
 */
@Injectable()
export class JobMetrics {
  private readonly logger = new Logger(JobMetrics.name);

  constructor(@Optional() private readonly metrics?: MetricsService) {}

  onJobCompleted(job: Job): void {
    this.logger.debug(`completed queue=${job.queueName} id=${job.id}`);
    this.metrics?.incJobCompleted(job.queueName);
    if (job.finishedOn && job.processedOn) {
      this.metrics?.observeJobDuration(job.queueName, (job.finishedOn - job.processedOn) / 1000);
    }
  }

  onJobFailed(job: Job | undefined, err: Error): void {
    this.logger.warn(`failed queue=${job?.queueName} id=${job?.id} reason=${err.message}`);
    if (job?.queueName) this.metrics?.incJobFailed(job.queueName);
    if (isSentryEnabled() && job?.queueName) {
      Sentry.captureException(err, { tags: { queue: job.queueName, jobId: job.id ?? 'unknown' } });
    }
  }

  /** F-9 alert hook: fires when a job moves to the dead-letter queue. */
  onDeadLetter(queue: string, jobId: string | undefined, err: Error): void {
    this.logger.error(`dead-letter queue=${queue} jobId=${jobId} reason=${err.message}`);
    this.metrics?.incDeadLetter(queue);
    if (isSentryEnabled()) {
      Sentry.captureException(err, { tags: { queue, jobId: jobId ?? 'unknown', type: 'dead-letter' } });
    }
  }
}
