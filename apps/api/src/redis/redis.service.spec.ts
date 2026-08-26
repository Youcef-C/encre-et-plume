import { RedisService } from './redis.service';

/**
 * M3: strict (throwing) variants used ONLY on security-critical paths (auth rate-limiter,
 * session denylist/epoch checks) — a Redis outage must fail CLOSED there, unlike the existing
 * fail-open cache methods (get/incr/...) which the rest of the app relies on.
 */
describe('RedisService — strict variants (M3)', () => {
  let service: RedisService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;

  beforeEach(() => {
    service = new RedisService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = (service as any).client;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('getOrThrow', () => {
    it('resolves the value on success (same as get)', async () => {
      jest.spyOn(client, 'get').mockResolvedValue('cached-value');
      await expect(service.getOrThrow('k')).resolves.toBe('cached-value');
    });

    it('resolves null when the key is absent (not an error)', async () => {
      jest.spyOn(client, 'get').mockResolvedValue(null);
      await expect(service.getOrThrow('k')).resolves.toBeNull();
    });

    it('rethrows when the Redis client errors (fail closed)', async () => {
      jest.spyOn(client, 'get').mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.getOrThrow('k')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('incrOrThrow', () => {
    it('resolves the counter value on success (same as incr)', async () => {
      jest.spyOn(client, 'incr').mockResolvedValue(3);
      await expect(service.incrOrThrow('k')).resolves.toBe(3);
    });

    it('rethrows when the Redis client errors (fail closed)', async () => {
      jest.spyOn(client, 'incr').mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.incrOrThrow('k')).rejects.toThrow('ECONNREFUSED');
    });
  });
});

/** F-23: the ingest path must never 500 a page view, so every new method is fail-open. */
describe('RedisService — F-23 list + SETNX primitives', () => {
  let service: RedisService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;

  beforeEach(() => {
    service = new RedisService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = (service as any).client;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('setNx', () => {
    it('reports true when it created the key', async () => {
      jest.spyOn(client, 'set').mockResolvedValue('OK');
      await expect(service.setNx('analytics:salt:2026-08-26', 'v', 86400)).resolves.toBe(true);
      expect(client.set).toHaveBeenCalledWith('analytics:salt:2026-08-26', 'v', 'EX', 86400, 'NX');
    });

    it('reports false when the key already existed', async () => {
      jest.spyOn(client, 'set').mockResolvedValue(null);
      await expect(service.setNx('k', 'v', 60)).resolves.toBe(false);
    });

    it('reports false when Redis errors (fail-open)', async () => {
      jest.spyOn(client, 'set').mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.setNx('k', 'v', 60)).resolves.toBe(false);
    });
  });

  describe('rpush', () => {
    it('returns the new list length', async () => {
      jest.spyOn(client, 'rpush').mockResolvedValue(7);
      await expect(service.rpush('analytics:buffer', '{}')).resolves.toBe(7);
    });

    it('returns 0 when Redis errors (fail-open — a dropped event is not a 500)', async () => {
      jest.spyOn(client, 'rpush').mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.rpush('analytics:buffer', '{}')).resolves.toBe(0);
    });
  });

  describe('lpopCount', () => {
    it('returns the popped batch', async () => {
      jest.spyOn(client, 'lpop').mockResolvedValue(['a', 'b']);
      await expect(service.lpopCount('analytics:buffer', 1000)).resolves.toEqual(['a', 'b']);
      expect(client.lpop).toHaveBeenCalledWith('analytics:buffer', 1000);
    });

    it('returns [] on an empty list', async () => {
      jest.spyOn(client, 'lpop').mockResolvedValue(null);
      await expect(service.lpopCount('analytics:buffer', 1000)).resolves.toEqual([]);
    });

    it('returns [] when Redis errors (fail-open)', async () => {
      jest.spyOn(client, 'lpop').mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.lpopCount('analytics:buffer', 1000)).resolves.toEqual([]);
    });
  });

  describe('ltrim', () => {
    it('keeps only the last N entries', async () => {
      jest.spyOn(client, 'ltrim').mockResolvedValue('OK');
      await service.ltrim('analytics:buffer', -50, -1);
      expect(client.ltrim).toHaveBeenCalledWith('analytics:buffer', -50, -1);
    });

    it('swallows a Redis error (fail-open)', async () => {
      jest.spyOn(client, 'ltrim').mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.ltrim('analytics:buffer', -50, -1)).resolves.toBeUndefined();
    });
  });
});

/**
 * B-2 (round 2): a real Redis outage must make commands REJECT, not queue. ioredis defaults to
 * `enableOfflineQueue: true`, which parks every command until reconnection — so the fail-open
 * `.catch()`es above never fire and the request hangs instead. These cases use a real client on a
 * closed port (no mock: an instantly-rejecting mock is exactly the blind spot that hid this) and
 * assert the call settles well inside a request budget rather than hanging.
 */
describe('RedisService — commands reject during an outage instead of hanging (B-2)', () => {
  const HUNG = Symbol('hung');
  const previousUrl = process.env['REDIS_URL'];
  let service: RedisService;

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
    service = new RedisService();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
    if (previousUrl === undefined) delete process.env['REDIS_URL'];
    else process.env['REDIS_URL'] = previousUrl;
  });

  it('fails open on the F-23 ingest path (rpush) instead of parking the request', async () => {
    await expect(settlesWithin(service.rpush('analytics:buffer', '{}'), 1_000)).resolves.toBe(0);
  });

  it('fails open on a cache read (get) instead of parking the request', async () => {
    await expect(settlesWithin(service.get('k'), 1_000)).resolves.toBeNull();
  });

  it('rejects promptly on the strict fail-closed variant (getOrThrow), never hangs', async () => {
    const outcome = await settlesWithin(
      service.getOrThrow('k').then(
        () => 'resolved' as const,
        () => 'rejected' as const,
      ),
      1_000,
    );
    expect(outcome).toBe('rejected');
  });
});
