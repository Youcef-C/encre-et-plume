import { PresenceService } from './presence.service';
import { RedisService } from '../redis/redis.service';
import { PRESENCE_ONLINE_WINDOW_MS } from '@encre-et-plume/shared';

// A session-index hash entry (jti → JSON meta), matching SessionStore.touch().
const session = (lastSeenAt: string) =>
  JSON.stringify({ userAgent: 'x', ip: null, lastSeenAt, createdAt: lastSeenAt });

describe('PresenceService', () => {
  let service: PresenceService;
  let redis: { hgetall: jest.Mock };

  beforeEach(() => {
    redis = { hgetall: jest.fn().mockResolvedValue({}) };
    service = new PresenceService(redis as unknown as RedisService);
  });

  it('reports offline with null lastSeen when the account has no sessions', async () => {
    redis.hgetall.mockResolvedValue({});
    const res = await service.get(['acc-1']);
    expect(res['acc-1']).toEqual({ online: false, lastSeen: null });
  });

  it('reports online when the newest session lastSeen is within the window', async () => {
    const now = new Date().toISOString();
    redis.hgetall.mockResolvedValue({ jti1: session(now) });
    const res = await service.get(['acc-1']);
    expect(res['acc-1'].online).toBe(true);
    expect(res['acc-1'].lastSeen).toBe(now);
  });

  it('reports offline but keeps lastSeen when the newest session is stale', async () => {
    const stale = new Date(Date.now() - PRESENCE_ONLINE_WINDOW_MS - 60_000).toISOString();
    redis.hgetall.mockResolvedValue({ jti1: session(stale) });
    const res = await service.get(['acc-1']);
    expect(res['acc-1']).toEqual({ online: false, lastSeen: stale });
  });

  it('uses the newest lastSeen across multiple sessions', async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const fresh = new Date().toISOString();
    redis.hgetall.mockResolvedValue({ a: session(old), b: session(fresh) });
    const res = await service.get(['acc-1']);
    expect(res['acc-1']).toEqual({ online: true, lastSeen: fresh });
  });

  it('fails open (everyone offline) when Redis returns empty on error', async () => {
    // RedisService.hgetall already swallows errors to {} — presence treats it as no sessions.
    redis.hgetall.mockResolvedValue({});
    const res = await service.get(['acc-1', 'acc-2']);
    expect(res).toEqual({
      'acc-1': { online: false, lastSeen: null },
      'acc-2': { online: false, lastSeen: null },
    });
  });

  it('ignores malformed session entries', async () => {
    redis.hgetall.mockResolvedValue({ bad: 'not json', good: session(new Date().toISOString()) });
    const res = await service.get(['acc-1']);
    expect(res['acc-1'].online).toBe(true);
  });
});
