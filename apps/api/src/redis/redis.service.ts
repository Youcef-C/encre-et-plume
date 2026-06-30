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

  async expire(key: string, ttl: number): Promise<void> {
    await this.client.expire(key, ttl).catch(() => {}); // fail-open
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
