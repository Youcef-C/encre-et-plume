import type Redis from 'ioredis';
import {
  REDIS_PROFILES,
  bullmqConnectionOpts,
  closeRedis,
  createRedisClient,
  redisUrl,
  whenRedisReady,
  type RedisProfile,
} from './redis-client.factory';

/**
 * F-26 B6/B7/V2 — the outage test, promoted from `queue.service.outage.spec.ts` and the
 * `RedisService` outage block to a parameterised suite over every profile the factory produces, so
 * a new profile inherits the test by construction.
 *
 * These use a REAL ioredis client against a closed port, deliberately. Every Redis mock in the
 * suite rejects instantly — that exercises the `.catch()` branch while proving nothing about
 * whether the promise settles at all, which is the exact case an outage produces. 2 700 green tests
 * said nothing. Do not replace this with a mock.
 */
const HUNG = Symbol('hung');
const DEAD_PORT_URL = 'redis://127.0.0.1:1'; // closed everywhere: like a stopped container

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

const PROFILES = Object.keys(REDIS_PROFILES) as RedisProfile[];

describe.each(PROFILES)('createRedisClient(%s) — survives a Redis outage', (profile) => {
  let client: Redis;

  beforeAll(() => {
    client = createRedisClient(profile, DEAD_PORT_URL);
  });

  afterAll(async () => {
    await closeRedis(client);
  });

  it('settles a command against a dead port instead of queueing it forever', async () => {
    const outcome = client.get('f26-probe').then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    );
    // Unconfigured, this is still pending after 1 s (measured in F-23 round 3) and the caller hangs.
    await expect(settlesWithin(outcome, 1_000)).resolves.toBe('rejected');
  });

  it('closeRedis settles rather than parking on a QUIT that cannot be delivered', async () => {
    const throwaway = createRedisClient(profile, DEAD_PORT_URL);
    await expect(settlesWithin(closeRedis(throwaway), 1_000)).resolves.toBeUndefined();
  });

  it('never enables the offline queue (an outage must reject, not buffer)', () => {
    expect(client.options.enableOfflineQueue).toBe(false);
  });

  it('attaches an error listener so an outage cannot raise an unhandled error event', () => {
    expect(client.listenerCount('error')).toBeGreaterThan(0);
  });
});

describe('profile options (F-26 B2 — the per-profile differences, asserted)', () => {
  it("'command' bounds every command at 200 ms and retries once", async () => {
    const client = createRedisClient('command', DEAD_PORT_URL);
    expect(client.options.commandTimeout).toBe(200);
    expect(client.options.maxRetriesPerRequest).toBe(1);
    expect(client.options.enableOfflineQueue).toBe(false);
    await closeRedis(client);
  });

  it("'pubsub' carries NO commandTimeout — subscribe is long-lived and would be torn down", async () => {
    const client = createRedisClient('pubsub', DEAD_PORT_URL);
    expect(client.options.commandTimeout).toBeUndefined();
    expect(client.options.maxRetriesPerRequest).toBeNull();
    expect(client.options.enableOfflineQueue).toBe(false);
    await closeRedis(client);
  });

  it('bullmqConnectionOpts keeps maxRetriesPerRequest null — BullMQ requires it', () => {
    expect(bullmqConnectionOpts('redis://:pw@example.test:6380/3')).toEqual({
      host: 'example.test',
      port: 6380,
      password: 'pw',
      db: 3,
      maxRetriesPerRequest: null,
    });
  });

  it('bullmqConnectionOpts falls back to localhost on an unparseable URL', () => {
    expect(bullmqConnectionOpts('not-a-url')).toEqual({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('redisUrl reads REDIS_URL, defaulting to localhost', () => {
    const previous = process.env['REDIS_URL'];
    process.env['REDIS_URL'] = 'redis://from-env:6379';
    expect(redisUrl()).toBe('redis://from-env:6379');
    delete process.env['REDIS_URL'];
    expect(redisUrl()).toBe('redis://localhost:6379');
    if (previous !== undefined) process.env['REDIS_URL'] = previous;
  });
});

describe('whenRedisReady (F-26 — the pub/sub boot rule, capped)', () => {
  it('resolves within the cap when Redis is unreachable instead of hanging the boot', async () => {
    const client = createRedisClient('pubsub', DEAD_PORT_URL);
    const started = Date.now();
    await expect(settlesWithin(whenRedisReady(client, 300), 2_000)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2_000);
    client.disconnect(); // sync: the reconnect loop is still mid-dial, QUIT has nowhere to go
  });
});
