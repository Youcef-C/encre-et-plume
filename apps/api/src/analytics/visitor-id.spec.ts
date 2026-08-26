import { dailySaltKey, resolveVisitorId } from './visitor-id';
import type { RedisService } from '../redis/redis.service';

/** In-memory stand-in for the two RedisService methods resolveVisitorId uses. */
function fakeRedis(seed: Record<string, string> = {}, down = false) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    get: jest.fn(async (k: string) => (down ? null : (store.get(k) ?? null))),
    setNx: jest.fn(async (k: string, v: string) => {
      if (down || store.has(k)) return false;
      store.set(k, v);
      return true;
    }),
  };
}

const asRedis = (r: ReturnType<typeof fakeRedis>) => r as unknown as RedisService;
const DAY = new Date('2026-08-26T10:00:00.000Z');

describe('visitor-id (F-23 B6)', () => {
  it('keys the salt by UTC day', () => {
    expect(dailySaltKey(DAY)).toBe('analytics:salt:2026-08-26');
  });

  it('is stable for the same (salt, ip, user-agent) within the day', async () => {
    const redis = fakeRedis({ 'analytics:salt:2026-08-26': 'salt-a' });

    const a = await resolveVisitorId(asRedis(redis), '203.0.113.7', 'Mozilla/5.0', DAY);
    const b = await resolveVisitorId(asRedis(redis), '203.0.113.7', 'Mozilla/5.0', DAY);

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('yields a different id after salt rotation — the identifier dies at midnight', async () => {
    const today = await resolveVisitorId(
      asRedis(fakeRedis({ 'analytics:salt:2026-08-26': 'salt-a' })),
      '203.0.113.7',
      'Mozilla/5.0',
      DAY,
    );
    const tomorrow = await resolveVisitorId(
      asRedis(fakeRedis({ 'analytics:salt:2026-08-27': 'salt-b' })),
      '203.0.113.7',
      'Mozilla/5.0',
      new Date('2026-08-27T10:00:00.000Z'),
    );

    expect(tomorrow).not.toBe(today);
  });

  it('never leaks the IP into the identifier', async () => {
    const id = await resolveVisitorId(
      asRedis(fakeRedis({ 'analytics:salt:2026-08-26': 'salt-a' })),
      '203.0.113.7',
      'Mozilla/5.0',
      DAY,
    );

    expect(id).not.toContain('203');
    expect(id).not.toContain('113');
  });

  it('distinguishes two IPs behind the same user-agent', async () => {
    const redis = asRedis(fakeRedis({ 'analytics:salt:2026-08-26': 'salt-a' }));
    const a = await resolveVisitorId(redis, '203.0.113.7', 'Mozilla/5.0', DAY);
    const b = await resolveVisitorId(redis, '203.0.113.8', 'Mozilla/5.0', DAY);

    expect(a).not.toBe(b);
  });

  it('creates the salt with a 24h TTL on the first request of the day', async () => {
    const redis = fakeRedis();

    const id = await resolveVisitorId(asRedis(redis), '203.0.113.7', 'Mozilla/5.0', DAY);

    expect(id).not.toBeNull();
    expect(redis.setNx).toHaveBeenCalledWith('analytics:salt:2026-08-26', expect.any(String), 86400);
  });

  it('adopts the salt another instance won the race with', async () => {
    const redis = fakeRedis();
    // Another instance writes the salt between our GET and our SETNX.
    redis.setNx.mockImplementationOnce(async (k: string) => {
      redis.store.set(k, 'winner-salt');
      return false;
    });

    const mine = await resolveVisitorId(asRedis(redis), '203.0.113.7', 'Mozilla/5.0', DAY);
    const theirs = await resolveVisitorId(
      asRedis(fakeRedis({ 'analytics:salt:2026-08-26': 'winner-salt' })),
      '203.0.113.7',
      'Mozilla/5.0',
      DAY,
    );

    expect(mine).toBe(theirs);
  });

  it('returns null when Redis is down — NEVER a fixed-salt fallback', async () => {
    const id = await resolveVisitorId(
      asRedis(fakeRedis({}, true)),
      '203.0.113.7',
      'Mozilla/5.0',
      DAY,
    );

    expect(id).toBeNull();
  });

  it('returns null without an IP', async () => {
    const redis = asRedis(fakeRedis({ 'analytics:salt:2026-08-26': 'salt-a' }));

    expect(await resolveVisitorId(redis, undefined, 'Mozilla/5.0', DAY)).toBeNull();
  });
});
