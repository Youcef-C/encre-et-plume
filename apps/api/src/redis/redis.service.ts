import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { closeRedis, createRedisClient } from './redis-client.factory';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    // F-26: the `command` profile (commandTimeout 200 / maxRetriesPerRequest 1 /
    // enableOfflineQueue false) and the reason it differs from the others live in the factory.
    this.client = createRedisClient('command');
    // The factory already swallows `error` so an outage cannot raise an unhandled event; this
    // listener adds RedisService's warn on top (ioredis allows several).
    this.client.on('error', (err: Error) => {
      if (process.env['NODE_ENV'] !== 'test') this.logger.warn(`Redis: ${err.message}`);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key).catch(() => null); // fail-open: treat errors as cache miss
  }

  async set(key: string, value: string, mode: 'EX', ttl: number): Promise<void> {
    await this.client.set(key, value, mode, ttl).catch(() => {}); // fail-open
  }

  /**
   * F-23: `SET key value EX ttl NX` — true when THIS caller created the key. The daily analytics
   * salt is created exactly once per day across N instances by whoever wins this. Fail-open →
   * false, and the caller re-reads (a null salt means an anonymous event, never a fixed salt).
   */
  async setNx(key: string, value: string, ttl: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttl, 'NX').catch(() => null);
    return res === 'OK';
  }

  /** F-23: append to a list, returning its new length. Fail-open → 0 (the event is dropped). */
  async rpush(key: string, value: string): Promise<number> {
    return this.client.rpush(key, value).catch(() => 0);
  }

  /** F-23: pop up to `count` entries off the head. Fail-open → [] (the flush is a no-op). */
  async lpopCount(key: string, count: number): Promise<string[]> {
    return this.client.lpop(key, count).catch(() => null).then((v) => v ?? []);
  }

  /** F-23: bound a list to a window (negative indexes count from the tail). Fail-open. */
  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.client.ltrim(key, start, stop).catch(() => {});
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key).catch(() => 0); // fail-open: 0 = under limit
  }

  /**
   * M3: strict variant — rethrows on Redis error instead of swallowing. Reserved for
   * security-critical paths only (auth rate-limiter, session denylist/epoch checks): a Redis
   * outage there must fail CLOSED (deny/block), never silently disable the control.
   */
  async getOrThrow(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** M3: strict variant of {@link incr} — rethrows on Redis error. See {@link getOrThrow}. */
  async incrOrThrow(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.client.expire(key, ttl).catch(() => {}); // fail-open
  }

  /** Delete one or more string keys. Fail-open. */
  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.del(...keys).catch(() => {});
  }

  /**
   * Delete every key matching a glob pattern via non-blocking SCAN (fail-open). Used to invalidate a
   * whole cache namespace (e.g. `gallery:list:*`) after a write, since those keys are query-hashed.
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch {
      /* fail-open — a stale list self-heals at the 60s TTL */
    }
  }

  // ── Hash commands (F-18 session index) ────────────────────────────────────

  /** Set a hash field. Fail-open. */
  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value).catch(() => {});
  }

  /** Get all fields of a hash. Fail-open → returns empty object on error. */
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key).catch(() => ({})) as Promise<Record<string, string>>;
  }

  /** Delete one or more hash fields. Fail-open. */
  async hdel(key: string, ...fields: string[]): Promise<void> {
    if (fields.length === 0) return;
    await this.client.hdel(key, ...fields).catch(() => {});
  }

  /**
   * F-9 readiness probe: let it REJECT on failure so HealthService sees the error.
   * ponytail: unlike other methods, NOT fail-open — readiness must detect a down Redis.
   */
  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await closeRedis(this.client);
  }
}
