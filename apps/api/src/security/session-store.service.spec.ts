/**
 * BE-2: SessionStore — Redis-backed best-effort session presence index.
 * Honest limits: sessions from before F-18 ships are not indexed (no history).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { SessionStore } from './session-store.service';
import { RedisService } from '../redis/redis.service';
import { SESSION_NOT_FOUND } from '@encre-et-plume/shared';

const NOW_MS = 1700000000000; // fixed "now" for deterministic tests

function makeRedisMock() {
  const store: Record<string, Record<string, string>> = {}; // key → (field → value)
  const kvStore: Record<string, string> = {};
  const expiries: Record<string, number> = {};
  return {
    _store: store,
    _kvStore: kvStore,
    _expiries: expiries,
    get: jest.fn((key: string) => Promise.resolve(kvStore[key] ?? null)),
    set: jest.fn((key: string, value: string) => { kvStore[key] = value; return Promise.resolve(); }),
    expire: jest.fn((key: string, ttl: number) => { expiries[key] = ttl; return Promise.resolve(); }),
    hset: jest.fn((key: string, field: string, value: string) => {
      if (!store[key]) store[key] = {};
      store[key]![field] = value;
      return Promise.resolve();
    }),
    hgetall: jest.fn((key: string) => Promise.resolve(store[key] ?? {})),
    hdel: jest.fn((key: string, ...fields: string[]) => {
      if (store[key]) for (const f of fields) delete store[key]![f];
      return Promise.resolve();
    }),
    incr: jest.fn().mockResolvedValue(1),
  };
}

describe('SessionStore', () => {
  let service: SessionStore;
  let redis: ReturnType<typeof makeRedisMock>;

  beforeEach(async () => {
    redis = makeRedisMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionStore,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get(SessionStore);
    jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('touch()', () => {
    it('writes a session record to the hash and sets expiry', async () => {
      await service.touch('acc1', 'jti-1', 'Mozilla/5.0', '1.2.3.4');
      expect(redis.hset).toHaveBeenCalledWith('sessions:acc1', 'jti-1', expect.any(String));
      const raw = redis._store['sessions:acc1']?.['jti-1'];
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.userAgent).toBe('Mozilla/5.0');
      expect(parsed.ip).toBe('1.2.3.4');
      expect(parsed.lastSeenAt).toBe(new Date(NOW_MS).toISOString());
      expect(redis.expire).toHaveBeenCalledWith('sessions:acc1', expect.any(Number));
    });

    it('preserves createdAt on subsequent touches', async () => {
      await service.touch('acc1', 'jti-1', 'UA', '1.2.3.4');
      const first = JSON.parse(redis._store['sessions:acc1']!['jti-1']!);
      jest.spyOn(Date, 'now').mockReturnValue(NOW_MS + 60000);
      await service.touch('acc1', 'jti-1', 'UA', '1.2.3.4');
      const second = JSON.parse(redis._store['sessions:acc1']!['jti-1']!);
      expect(second.createdAt).toBe(first.createdAt);
      expect(second.lastSeenAt).not.toBe(first.lastSeenAt);
    });
  });

  describe('list()', () => {
    it('returns sessions with current flag set on the caller\'s jti', async () => {
      await service.touch('acc1', 'jti-1', 'UA1', '1.1.1.1');
      await service.touch('acc1', 'jti-2', 'UA2', '2.2.2.2');
      const sessions = await service.list('acc1', 'jti-1');
      const current = sessions.find((s) => s.id === 'jti-1');
      const other = sessions.find((s) => s.id === 'jti-2');
      expect(current?.current).toBe(true);
      expect(other?.current).toBe(false);
    });

    it('sorts sessions by lastSeenAt descending', async () => {
      await service.touch('acc1', 'jti-old', 'UA', '1.1.1.1');
      jest.spyOn(Date, 'now').mockReturnValue(NOW_MS + 5000);
      await service.touch('acc1', 'jti-new', 'UA', '2.2.2.2');
      const sessions = await service.list('acc1', 'jti-new');
      expect(sessions[0]!.id).toBe('jti-new');
      expect(sessions[1]!.id).toBe('jti-old');
    });

    it('drops entries older than 7 days', async () => {
      const OLD_MS = NOW_MS - 7 * 24 * 60 * 60 * 1000 - 1;
      // Manually insert a stale entry
      redis._store['sessions:acc1'] = {
        'jti-stale': JSON.stringify({ userAgent: 'UA', ip: '1.1.1.1', lastSeenAt: new Date(OLD_MS).toISOString(), createdAt: new Date(OLD_MS).toISOString() }),
        'jti-fresh': JSON.stringify({ userAgent: 'UA', ip: '2.2.2.2', lastSeenAt: new Date(NOW_MS).toISOString(), createdAt: new Date(NOW_MS).toISOString() }),
      };
      const sessions = await service.list('acc1', 'jti-fresh');
      expect(sessions.some((s) => s.id === 'jti-stale')).toBe(false);
      expect(sessions.some((s) => s.id === 'jti-fresh')).toBe(true);
    });
  });

  describe('revoke()', () => {
    it('denylists the jti and removes it from the hash', async () => {
      await service.touch('acc1', 'jti-1', 'UA', '1.1.1.1');
      await service.revoke('acc1', 'jti-1', 3600);
      expect(redis.get).not.toThrow();
      expect(redis.hdel).toHaveBeenCalledWith('sessions:acc1', 'jti-1');
    });

    it('throws SESSION_NOT_FOUND for an absent jti', async () => {
      await expect(service.revoke('acc1', 'no-such-jti', 3600)).rejects.toMatchObject({
        response: expect.objectContaining({ error: SESSION_NOT_FOUND }),
      });
    });
  });

  describe('reset()', () => {
    it('removes all fields and keeps only the new jti', async () => {
      await service.touch('acc1', 'jti-1', 'UA1', '1.1.1.1');
      await service.touch('acc1', 'jti-2', 'UA2', '2.2.2.2');
      await service.reset('acc1', 'jti-new', { userAgent: 'UA3', ip: '3.3.3.3' });
      const sessions = await service.list('acc1', 'jti-new');
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).toBe('jti-new');
    });

    it('denylists the removed jtis but never the surviving one', async () => {
      await service.touch('acc1', 'jti-old', 'UA1', '1.1.1.1');
      await service.touch('acc1', 'jti-keep', 'UA2', '2.2.2.2');
      await service.reset('acc1', 'jti-keep', { userAgent: 'UA2', ip: '2.2.2.2' });
      expect(redis._kvStore['denylist:jti-old']).toBe('1');
      expect(redis._kvStore['denylist:jti-keep']).toBeUndefined();
    });
  });
});
