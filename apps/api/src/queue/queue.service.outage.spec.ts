import { QueueService } from './queue.service';

/**
 * B-4 — the idempotency client is the SECOND of this API's three Redis connections, and round 2 of
 * F-23 only configured the first (`RedisService`). Left unconfigured it queued commands during an
 * outage instead of rejecting, which is how `WorkerRunner`'s `isProcessed()` call took the whole
 * worker process down and how signup hung on the verification-email enqueue.
 *
 * These tests use a REAL ioredis client against a closed port, deliberately. A mock that rejects
 * instantly is exactly the blind spot that let this ship twice: it exercises the `.catch()` while
 * proving nothing about whether the promise settles at all.
 */
describe('QueueService — idempotency survives a Redis outage (B-4)', () => {
  const HUNG = Symbol('hung');
  const previousUrl = process.env['REDIS_URL'];
  let service: QueueService;

  /** Settles to HUNG if the call is still pending after `ms` — an outage-hang looks exactly like this. */
  async function settlesWithin<T>(call: Promise<T>, ms: number): Promise<T | typeof HUNG> {
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<typeof HUNG>((resolve) => {
      timer = setTimeout(() => resolve(HUNG), ms);
    });
    try {
      return await Promise.race([call, guard]);
    } finally {
      clearTimeout(timer);
    }
  }

  beforeAll(() => {
    // Port 1 is closed everywhere: every command meets a dead connection, like a stopped container.
    process.env['REDIS_URL'] = 'redis://127.0.0.1:1';
    service = new QueueService();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
    if (previousUrl === undefined) delete process.env['REDIS_URL'];
    else process.env['REDIS_URL'] = previousUrl;
  });

  it('isProcessed resolves false instead of hanging or rejecting', async () => {
    // false = "we cannot prove it ran, so run it". A duplicate job is absorbed by the processors'
    // idempotent writes; an unhandled rejection here killed the worker.
    await expect(settlesWithin(service.isProcessed('some-key'), 1_000)).resolves.toBe(false);
  });

  it('markProcessed resolves instead of hanging or rejecting', async () => {
    await expect(settlesWithin(service.markProcessed('some-key'), 1_000)).resolves.toBeUndefined();
  });

  it('shutdown completes rather than parking on a QUIT that cannot be delivered', async () => {
    // With enableOfflineQueue:false, QUIT itself rejects while Redis is down; without the
    // disconnect() fallback the socket and its reconnect timer outlive shutdown.
    const throwaway = new QueueService();
    await expect(settlesWithin(throwaway.onModuleDestroy(), 1_000)).resolves.toBeUndefined();
  });
});
