import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.client = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
    // Suppress unhandled error events; methods fail-open via try-catch
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
    await this.client.quit().catch(() => {});
  }
}
