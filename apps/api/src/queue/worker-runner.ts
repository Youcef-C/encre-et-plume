import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { QueueService } from './queue.service';
import { JobMetrics } from './job-metrics';
import { QUEUE_PROCESSORS } from './job-processor';
import type { JobProcessor } from './job-processor';
import { requestContext } from '../observability/request-context';

/** Parse REDIS_URL into plain BullMQ connection opts (same helper pattern as QueueService). */
function parseBullmqOpts(url: string): { host: string; port: number; password?: string; db?: number; maxRetriesPerRequest: null } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: Number(u.port) || 6379,
      password: u.password || undefined,
      db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}

/**
 * WorkerRunner: starts one BullMQ Worker per registered processor.
 * run() is called ONLY in worker.ts; the HTTP server (main.ts) never calls it.
 * OnModuleDestroy gracefully drains in-flight jobs before the process exits.
 */
@Injectable()
export class WorkerRunner implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerRunner.name);
  private readonly workers: Worker[] = [];

  constructor(
    @Inject(QUEUE_PROCESSORS) private readonly processors: JobProcessor[],
    private readonly queueService: QueueService,
    private readonly metrics: JobMetrics,
  ) {}

  run(): void {
    if (this.workers.length > 0) return; // idempotent

    const connectionOpts = parseBullmqOpts(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
    const prefix = process.env['BULLMQ_PREFIX'] ?? '{bull}';

    for (const processor of this.processors) {
      const worker = new Worker(
        processor.queue,
        async (job: Job) => {
          // F-9: propagate job id as correlation id so job logs carry a traceable requestId
          return requestContext.run({ requestId: job.id ?? randomUUID() }, async () => {
            const key =
              (job.opts.jobId as string | undefined) ??
              (job.data as { idempotencyKey?: string })?.idempotencyKey;
            // Redis-backed idempotency: re-delivered succeeded job → no-op
            if (key && (await this.queueService.isProcessed(key))) {
              this.logger.debug(`idempotent skip queue=${processor.queue} jobId=${job.id} key=${key}`);
              return;
            }
            await processor.process(job.data as never, job);
            // Mark only after success; failed retries must re-run
            if (key) await this.queueService.markProcessed(key);
          });
        },
        {
          connection: connectionOpts,
          concurrency: processor.concurrency ?? 5,
          prefix,
        },
      );

      worker.on('completed', (job) => this.metrics.onJobCompleted(job));
      // BullMQ emits 'failed' after EACH failed attempt, not only the final one.
      // Only dead-letter when all attempts are exhausted.
      worker.on('failed', (job, err) => {
        this.metrics.onJobFailed(job, err);
        const maxAttempts = job?.opts.attempts ?? 1;
        const attemptsMade = job?.attemptsMade ?? 1;
        if (!job || attemptsMade < maxAttempts) return; // retry pending — not the final failure

        // Dead-letter async — never drop permanently failed jobs
        void this.queueService
          .enqueue(
            this.queueService.deadLetterName as 'dead-letter',
            job.name ?? 'unknown',
            {
              queue: processor.queue,
              name: job.name,
              data: job.data,
              failedReason: err.message,
              originalJobId: job.id,
            },
            {},
          )
          .then(() => this.metrics.onDeadLetter(processor.queue, job.id, err))
          .catch((e: Error) => this.logger.error(`dead-letter enqueue failed: ${e.message}`));
      });

      this.workers.push(worker);
      this.logger.log(
        `Worker started: queue=${processor.queue} concurrency=${processor.concurrency ?? 5}`,
      );
    }
  }

  async close(): Promise<void> {
    // BullMQ Worker.close() waits for in-flight jobs to drain (graceful shutdown)
    await Promise.all(this.workers.map((w) => w.close()));
    this.workers.length = 0; // reset so run() is idempotent (integration test restarts)
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
