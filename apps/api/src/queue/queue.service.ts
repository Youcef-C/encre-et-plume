import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import type { EnqueueOptions, QueueName } from '@encre-et-plume/shared';
import { DEAD_LETTER_QUEUE } from '@encre-et-plume/shared';

const IDEMPOTENCY_TTL_S = 60 * 60 * 24 * 7; // 7 days

/**
 * Parses REDIS_URL into a plain options object for BullMQ.
 * ponytail: pass opts not a Redis instance — avoids ioredis version mismatch between BullMQ's
 * bundled ioredis and the project's. BullMQ creates its own internal connection.
 */
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
 * Enqueue seam: feature services inject QueueService and call enqueue() without touching queue wiring.
 * Mirrors NotificationsService.create() / ActionLogService.record() call-site pattern.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  // ponytail: dedicated ioredis client for direct Redis commands (idempotency keys)
  private readonly redis: Redis;
  // BullMQ Queue instances are created lazily (plain connection opts, not a Redis instance)
  private readonly queues = new Map<string, Queue>();
  private readonly bullmqOpts: ReturnType<typeof parseBullmqOpts>;
  private readonly prefix: string;

  constructor() {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.prefix = process.env['BULLMQ_PREFIX'] ?? '{bull}';
    this.bullmqOpts = parseBullmqOpts(url);
    // B-4: the idempotency client is NOT BullMQ's connection (that one is built from
    // `parseBullmqOpts` above and MUST keep `maxRetriesPerRequest: null`). Left unconfigured, this
    // one queued commands during an outage instead of rejecting — which is how a Redis outage
    // crashed the worker via `isProcessed()` and hung signup via the verification-email enqueue.
    this.redis = new Redis(url, {
      commandTimeout: 200,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => {}); // fail-open; suppress unhandled error event
  }

  async enqueue<T>(queue: QueueName | 'dead-letter', name: string, data: T, opts?: EnqueueOptions): Promise<void> {
    const q = this.getQueue(queue);
    const jobOpts: JobsOptions = {
      attempts: opts?.attempts ?? 3,
      backoff: { type: 'exponential', delay: opts?.backoffMs ?? 1000 },
      removeOnComplete: true,
      removeOnFail: false, // never silently drop; keep failed jobs for inspection
      ...(opts?.delayMs !== undefined && { delay: opts.delayMs }),
      ...(opts?.idempotencyKey !== undefined && { jobId: opts.idempotencyKey }),
    };
    await q.add(name, data, jobOpts);
  }

  /** Cron seam — registers a repeatable job. No live cron registered now; concrete jobs land with MR/their stories. */
  async schedule<T>(queue: QueueName, name: string, data: T, repeat: { pattern: string }): Promise<void> {
    const q = this.getQueue(queue);
    await q.add(name, data, { repeat: { pattern: repeat.pattern } });
  }

  // ── Redis-backed idempotency (no DB — Postgres ProcessedEvent table is the MR seam) ─────────

  /**
   * B-4: fail SAFE, not open-ended. An unreachable Redis means "we cannot prove this job already
   * ran", and the safe answer is to run it — BullMQ's own retry semantics and each processor's
   * idempotent writes absorb a duplicate. Letting this reject instead took the whole worker process
   * down, which is strictly worse than one job running twice.
   */
  async isProcessed(key: string): Promise<boolean> {
    const val = await this.redis.get(`idempotency:${key}`).catch(() => null);
    return val !== null;
  }

  /** Same reasoning: a lost mark costs a possible re-run, an unhandled rejection costs the worker. */
  async markProcessed(key: string): Promise<void> {
    await this.redis.set(`idempotency:${key}`, '1', 'EX', IDEMPOTENCY_TTL_S).catch(() => {});
  }

  // ── Queue introspection (health endpoint + integration tests) ───────────────

  async getCounts(queue: QueueName | 'dead-letter') {
    const q = this.getQueue(queue);
    return q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  }

  /** Public so integration tests and WorkerRunner can access the underlying Queue. */
  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(
        name,
        new Queue(name, { connection: this.bullmqOpts, prefix: this.prefix }),
      );
    }
    return this.queues.get(name)!;
  }

  get deadLetterName(): string {
    return DEAD_LETTER_QUEUE;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    // B-4: same as RedisService — with the offline queue disabled QUIT rejects while Redis is down,
    // and without the disconnect() fallback the socket + reconnect timer hold the process open.
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
