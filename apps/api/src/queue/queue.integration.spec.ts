/**
 * Integration tests for the queue system (real Redis required).
 * Uses a unique prefix per run to avoid polluting dev queues.
 */
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

// Set prefix before any queue module is imported so QueueService/WorkerRunner pick it up
const TEST_PREFIX = `{test}:${randomUUID().replace(/-/g, '').slice(0, 8)}`;
process.env['BULLMQ_PREFIX'] = TEST_PREFIX;
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

let redisAvailable = false;

import { Test } from '@nestjs/testing';
import { DEAD_LETTER_QUEUE, QUEUE_NAMES } from '@encre-et-plume/shared';
import type { NotificationsFanoutJob } from '@encre-et-plume/shared';
import { QueueService } from './queue.service';
import { WorkerRunner } from './worker-runner';
import { JobMetrics } from './job-metrics';
import { NotificationsFanoutProcessor } from './processors/notifications-fanout.processor';
import { NotificationsService } from '../notifications/notifications.service';
import { QUEUE_PROCESSORS } from './job-processor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForQueueEmpty(
  queueService: QueueService,
  queueName: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const q = queueService.getQueue(queueName);
    const counts = await q.getJobCounts('waiting', 'active', 'delayed');
    if ((counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) === 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Queue '${queueName}' did not empty within ${timeoutMs}ms`);
}

async function waitForMock(fn: jest.Mock, times = 1, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn.mock.calls.length >= times) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Mock was called ${fn.mock.calls.length} times; expected ${times}`);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Queue integration (real Redis)', () => {
  let queueService: QueueService;
  let workerRunner: WorkerRunner;
  let mockNotifService: { create: jest.Mock };
  let mockMetrics: { onJobCompleted: jest.Mock; onJobFailed: jest.Mock; onDeadLetter: jest.Mock };

  const fanout: NotificationsFanoutJob = { recipientId: 'u-test', type: 'like' };

  beforeAll(async () => {
    // Check Redis availability
    const probe = new Redis(process.env['REDIS_URL'] as string, { lazyConnect: true });
    try {
      await probe.connect();
      await probe.ping();
      redisAvailable = true;
    } catch {
      redisAvailable = false;
    } finally {
      await probe.quit().catch(() => {});
    }

    if (!redisAvailable) return;

    mockNotifService = { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
    mockMetrics = {
      onJobCompleted: jest.fn(),
      onJobFailed: jest.fn(),
      onDeadLetter: jest.fn(),
    };

    const processor = new NotificationsFanoutProcessor(
      mockNotifService as unknown as NotificationsService,
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        QueueService,
        WorkerRunner,
        { provide: JobMetrics, useValue: mockMetrics },
        { provide: NotificationsService, useValue: mockNotifService },
        { provide: NotificationsFanoutProcessor, useValue: processor },
        {
          provide: QUEUE_PROCESSORS,
          useFactory: (p: NotificationsFanoutProcessor) => [p],
          inject: [NotificationsFanoutProcessor],
        },
      ],
    }).compile();

    queueService = moduleRef.get(QueueService);
    workerRunner = moduleRef.get(WorkerRunner);
    workerRunner.run();
  }, 20000);

  afterAll(async () => {
    if (!redisAvailable) return;

    await workerRunner.close();

    for (const name of [...QUEUE_NAMES, DEAD_LETTER_QUEUE]) {
      try {
        await queueService.getQueue(name).obliterate({ force: true });
      } catch {
        // queue may not exist
      }
    }

    await queueService.onModuleDestroy();
  }, 20000);

  beforeEach(() => {
    if (!redisAvailable) return;
    mockNotifService.create.mockReset();
    mockNotifService.create.mockResolvedValue({ id: 'notif-1' });
    mockMetrics.onJobCompleted.mockReset();
    mockMetrics.onJobFailed.mockReset();
    mockMetrics.onDeadLetter.mockReset();
  });

  // ── happy path ────────────────────────────────────────────────────────────

  it('happy path: enqueued notifications-fanout job is processed; create() called once (BE-5)', async () => {
    if (!redisAvailable) return;

    await queueService.enqueue('notifications-fanout', 'notify', fanout);
    await waitForQueueEmpty(queueService, 'notifications-fanout');
    await waitForMock(mockNotifService.create, 1);

    expect(mockNotifService.create).toHaveBeenCalledTimes(1);
    expect(mockNotifService.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'u-test', type: 'like' }),
    );
  }, 15000);

  // ── retry + backoff ───────────────────────────────────────────────────────

  it('retry: processor dep throws once then succeeds; job completes (BE-4)', async () => {
    if (!redisAvailable) return;

    mockNotifService.create
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValue({ id: 'notif-retry' });

    await queueService.enqueue('notifications-fanout', 'notify', fanout, { attempts: 3, backoffMs: 10 });
    await waitForQueueEmpty(queueService, 'notifications-fanout');
    await waitForMock(mockNotifService.create, 2); // called twice: fail then succeed

    expect(mockNotifService.create).toHaveBeenCalledTimes(2);
    expect(mockMetrics.onJobCompleted).toHaveBeenCalledTimes(1);
  }, 15000);

  // ── dead-letter ───────────────────────────────────────────────────────────

  it('dead-letter: permanently failed job lands in dead-letter queue; metrics.onDeadLetter called (BE-4)', async () => {
    if (!redisAvailable) return;

    mockNotifService.create.mockRejectedValue(new Error('permanent failure'));

    await queueService.enqueue('notifications-fanout', 'notify', fanout, { attempts: 2, backoffMs: 10 });

    // Wait for onDeadLetter to fire (async .then() in worker failed handler)
    await waitForMock(mockMetrics.onDeadLetter, 1, 10000);

    expect(mockMetrics.onDeadLetter).toHaveBeenCalledTimes(1);
    expect(mockMetrics.onDeadLetter).toHaveBeenCalledWith(
      'notifications-fanout',
      expect.any(String),
      expect.any(Error),
    );

    // Verify dead-letter job has the right shape
    await new Promise((r) => setTimeout(r, 200)); // brief wait for job to land in queue
    const dlJobs = await queueService
      .getQueue(DEAD_LETTER_QUEUE)
      .getJobs(['waiting', 'active', 'delayed', 'failed']);
    expect(dlJobs.length).toBeGreaterThanOrEqual(1);
    expect(dlJobs[0].data).toMatchObject({
      queue: 'notifications-fanout',
      failedReason: 'permanent failure',
    });
  }, 20000);

  // ── idempotency ───────────────────────────────────────────────────────────

  it('idempotency: duplicate enqueue with same key runs processor once (BE-2)', async () => {
    if (!redisAvailable) return;

    const key = `idem-${randomUUID()}`;

    // Include idempotencyKey in data so WorkerRunner can resolve it even if job.opts.jobId is unavailable
    const payload: NotificationsFanoutJob = { ...fanout, idempotencyKey: key };

    await queueService.enqueue('notifications-fanout', 'notify', payload, { idempotencyKey: key });
    await waitForQueueEmpty(queueService, 'notifications-fanout');
    await waitForMock(mockNotifService.create, 1);

    // Brief wait for markProcessed to finish writing to Redis
    await new Promise((r) => setTimeout(r, 100));

    // Verify key is actually marked
    expect(await queueService.isProcessed(key)).toBe(true);

    // Second enqueue with same key — should be skipped by idempotency check
    await queueService.enqueue('notifications-fanout', 'notify', payload, { idempotencyKey: key });
    await waitForQueueEmpty(queueService, 'notifications-fanout');
    // Small extra wait in case the second job fires
    await new Promise((r) => setTimeout(r, 200));

    // Only processed once
    expect(mockNotifService.create).toHaveBeenCalledTimes(1);
  }, 15000);

  // ── concurrency ───────────────────────────────────────────────────────────

  it('concurrency: worker with concurrency=1 never runs more than one job at a time (BE-4)', async () => {
    if (!redisAvailable) return;

    let concurrentCount = 0;
    let maxConcurrent = 0;

    // Slow processor (150ms each) — with concurrency=1 they should serialise
    mockNotifService.create.mockImplementation(async () => {
      concurrentCount++;
      if (concurrentCount > maxConcurrent) maxConcurrent = concurrentCount;
      await new Promise((r) => setTimeout(r, 150));
      concurrentCount--;
      return { id: 'notif-concurrent' };
    });

    // Close the default worker (concurrency=5) and restart with concurrency=1
    await workerRunner.close();

    // Temporarily patch the processor's concurrency to 1
    const processor = (workerRunner as unknown as { processors: { concurrency?: number }[] }).processors[0];
    const originalConcurrency = processor.concurrency;
    processor.concurrency = 1;
    workerRunner.run();

    // Enqueue 3 jobs
    await Promise.all([
      queueService.enqueue('notifications-fanout', 'notify', fanout),
      queueService.enqueue('notifications-fanout', 'notify', { ...fanout, recipientId: 'u-2' }),
      queueService.enqueue('notifications-fanout', 'notify', { ...fanout, recipientId: 'u-3' }),
    ]);

    await waitForMock(mockNotifService.create, 3, 10000);
    // Wait for all to complete
    await waitForQueueEmpty(queueService, 'notifications-fanout', 10000);

    expect(mockNotifService.create).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBe(1); // never more than 1 simultaneous

    // Restore
    processor.concurrency = originalConcurrency;
    await workerRunner.close();
    workerRunner.run();
  }, 20000);

  // ── graceful shutdown ─────────────────────────────────────────────────────

  it('graceful shutdown: in-flight job drains before close() resolves (BE-6)', async () => {
    if (!redisAvailable) return;

    let jobFinished = false;

    // Processor takes 400ms
    mockNotifService.create.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 400));
      jobFinished = true;
      return { id: 'notif-drain' };
    });

    await queueService.enqueue('notifications-fanout', 'notify', fanout);

    // Wait briefly so worker picks up the job
    await new Promise((r) => setTimeout(r, 100));

    // Close should drain the in-flight job before resolving
    await workerRunner.close();

    expect(jobFinished).toBe(true);

    // Restart workers for cleanup
    workerRunner.run();
  }, 15000);
});
