import Redis from 'ioredis';
import { RedisIoAdapter } from './redis-io.adapter';

/**
 * Regression test for a boot-breaking bug shipped in F-23 (commit 04c7b67).
 *
 * That commit set `enableOfflineQueue: false` on the socket.io pub/sub clients to bound memory during
 * a Redis outage. It is correct for the *command* clients — but a subscriber's very first command is
 * issued before ioredis has finished connecting, and with the offline queue disabled ioredis throws
 * `Stream isn't writeable and enableOfflineQueue options is false` instead of buffering it. The API
 * died before `listen()`, every time, and no test caught it: nothing in the Jest suite boots the WS
 * adapter, and `pnpm build` never starts a server.
 *
 * The fix is to await both clients' `ready` (capped) before handing them to `createAdapter`.
 *
 * These tests need a real Redis — a mock cannot reproduce "the socket is not writeable yet", which is
 * the entire bug. They skip when none is reachable rather than failing the suite, matching
 * `queue.integration.spec.ts`.
 */
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
let redisAvailable = false;

beforeAll(async () => {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 500 });
  probe.on('error', () => {});
  try {
    await probe.connect();
    await probe.ping();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
  } finally {
    probe.disconnect();
  }
});

describe('RedisIoAdapter — connects before subscribing (F-23 04c7b67 regression)', () => {
  it('reproduces the shipped bug: psubscribe on a not-yet-connected offline-queue-less client throws', async () => {
    if (!redisAvailable) return;
    // Exactly what 04c7b67 handed to createAdapter: configured, but subscribed to immediately.
    const client = new Redis(REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: null });
    client.on('error', () => {});
    await expect(client.psubscribe('regression-probe*')).rejects.toThrow(/enableOfflineQueue/);
    client.disconnect();
  });

  it('connectToRedis resolves and yields a usable adapter — the API can reach listen()', async () => {
    if (!redisAvailable) return;
    const adapter = new RedisIoAdapter({} as never);
    await expect(adapter.connectToRedis()).resolves.toBeUndefined();
    // createAdapter() only runs once both clients are ready; if the bug returns this is unset
    // because connectToRedis() rejected above.
    expect((adapter as unknown as { adapterConstructor?: unknown }).adapterConstructor).toBeDefined();
    await adapter.close();
  });

  it('does not hang forever when Redis is unreachable — the ready-wait is capped', async () => {
    const previous = process.env['REDIS_URL'];
    process.env['REDIS_URL'] = 'redis://127.0.0.1:1'; // closed port
    const adapter = new RedisIoAdapter({} as never);
    const started = Date.now();
    try {
      await adapter.connectToRedis();
      // The cap is 5s; allow slack for a loaded CI box but prove it is bounded, not infinite.
      expect(Date.now() - started).toBeLessThan(15_000);
    } finally {
      await adapter.close();
      if (previous === undefined) delete process.env['REDIS_URL'];
      else process.env['REDIS_URL'] = previous;
    }
  }, 20_000);
});
