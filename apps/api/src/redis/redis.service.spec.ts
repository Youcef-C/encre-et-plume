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
