import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { ReadinessResponse, CheckState } from '@encre-et-plume/shared';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<ReadinessResponse> {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.pingDb(),
      this.pingRedis(),
    ]);

    const db: CheckState = dbResult.status === 'fulfilled' ? 'up' : 'down';
    const redis: CheckState = redisResult.status === 'fulfilled' ? 'up' : 'down';
    const status = db === 'up' && redis === 'up' ? 'ok' : 'error';

    return { status, checks: { db, redis } };
  }

  private async pingDb(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async pingRedis(): Promise<void> {
    await this.redis.ping();
  }
}
