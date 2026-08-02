import { Injectable } from '@nestjs/common';
import type { RankingCategory, RankingEntry, RankingRow } from '@encre-et-plume/shared';
import { CREATOR_ROLES, isRankingCategory } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WORK_META_INCLUDE } from '../works/work-meta';
import { RedisService } from '../redis/redis.service';
import {
  RANKING_ORDER_BY,
  rankingWhere,
  toRankingRow,
  toRankingEntryFromWork,
  toRankingEntryFromIllustration,
  toRankingEntryFromProfile,
} from './ranking.util';

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
        include: WORK_META_INCLUDE,
      });
      return works.map(toRankingRow);
    });
  }

  /**
   * DR-7 Classement category tabs — a single ranking entity per category (Work/Illustration/
   * Profile), unified into `RankingEntry`. Unknown category → empty array (public read endpoint,
   * same "no 400s, silently drop" convention as GalleryService's parseGalleryQuery).
   */
  async getByCategory(category: string | undefined, limit: number): Promise<RankingEntry[]> {
    if (!isRankingCategory(category)) return [];
    return this.cached(`ranking:cat:${category}`, () => this.queryCategory(category, limit));
  }

  private queryCategory(category: RankingCategory, limit: number): Promise<RankingEntry[]> {
    switch (category) {
      case 'mangas':
        return this.rankWorksByFormat('Manga', limit);
      case 'romans':
        return this.rankWorksByFormat('Roman', limit);
      case 'illustrations':
        return this.rankIllustrations(limit);
      case 'createurs':
        return this.rankCreators(limit);
    }
  }

  private async rankWorksByFormat(format: string, limit: number): Promise<RankingEntry[]> {
    const works = await this.prisma.work.findMany({ where: { format }, orderBy: RANKING_ORDER_BY, take: limit, include: WORK_META_INCLUDE });
    return works.map(toRankingEntryFromWork);
  }

  private async rankIllustrations(limit: number): Promise<RankingEntry[]> {
    const rows = await this.prisma.illustration.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ likeCount: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toRankingEntryFromIllustration);
  }

  private async rankCreators(limit: number): Promise<RankingEntry[]> {
    const rows = await this.prisma.profile.findMany({
      // trendingScore: { gt: 0 } — excludes zero-engagement onboarding/test profiles from the ranking.
      where: { creatorRoles: { hasSome: [...CREATOR_ROLES] }, trendingScore: { gt: 0 } },
      orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
      take: limit,
      include: { account: true },
    });
    return rows.map(toRankingEntryFromProfile);
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
