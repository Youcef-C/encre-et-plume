import { Injectable } from '@nestjs/common';
import type { RankingRow } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RANKING_ORDER_BY, rankingWhere, toRankingRow } from './ranking.util';

const CACHE_TTL_S = 60; // ponytail: 60s TTL, mirrors HomeService; DR-9 invalidates on like events.

/**
 * DR-7 all-time ranking "Classement" — public, read-only, cached in Redis (fail-open, mirrors
 * HomeService/CatalogService). Extends the DR-1 ranking source (ranking.util.ts) — same score +
 * ordering + tiebreak, plus an optional genre-equality filter.
 */
@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getAllTime(genre: string | undefined, limit: number): Promise<RankingRow[]> {
    // Normalize once: the cache key AND the where-filter must agree, or a whitespace-padded
    // genre caches an empty result under the canonical (trimmed) key — poisoning it for 60s.
    const g = genre?.trim() || undefined;
    const key = `ranking:all-time:${g ?? 'all'}`;
    return this.cached(key, async () => {
      const works = await this.prisma.work.findMany({
        where: rankingWhere(g),
        orderBy: RANKING_ORDER_BY,
        take: limit,
      });
      return works.map(toRankingRow);
    });
  }

  /** Fail-open Redis cache: any read/write error falls through to `fn` — never errors the request. */
  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as T;
    const value = await fn();
    await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_S);
    return value;
  }
}
