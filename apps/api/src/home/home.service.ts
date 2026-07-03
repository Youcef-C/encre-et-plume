import { Injectable } from '@nestjs/common';
import type {
  Announcement,
  CreatorRole,
  FeaturedWork,
  RankingRow,
  ScheduledRelease,
  TopCreator,
  TopCreatorsResponse,
  TrendingWork,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_S = 60; // ponytail: 60s TTL; DR-9 invalidates on like events.

/**
 * DR-1 home showroom aggregation. Public, read-only, cached in Redis (fail-open — a cache miss
 * or Redis outage just falls through to Postgres, never errors the request).
 *
 * "ScheduledRelease" and "Creator" are not separate tables (see prisma/schema.prisma DR-1 note):
 * a scheduled release IS a Chapter with status=scheduled + publishAt>now; a creator IS an
 * existing Account+Profile, split by Profile.creatorRoles.
 */
@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getFeatured(): Promise<FeaturedWork[]> {
    return this.cached('home:featured', async () => {
      const works = await this.prisma.work.findMany({
        where: { featuredRank: { not: null } },
        orderBy: { featuredRank: 'asc' },
      });
      return works.map((w) => ({ id: w.id, slug: w.slug, title: w.title, cover: w.coverImage, meta: w.meta, genre: w.genre }));
    });
  }

  async getTrendingThisWeek(): Promise<TrendingWork[]> {
    return this.cached('home:trending', async () => {
      const works = await this.prisma.work.findMany({
        orderBy: [{ weeklyLikeDelta: 'desc' }, { id: 'asc' }],
        take: 4,
      });
      return works.map((w, i) => ({
        id: w.id,
        slug: w.slug,
        rank: i + 1,
        title: w.title,
        cover: w.coverImage,
        genre: w.genre,
        likeCount: w.likeCount,
        growthPct: growthPercent(w.weeklyLikeDelta, w.priorWeekLikeDelta),
      }));
    });
  }

  async getTopCreators(): Promise<TopCreatorsResponse> {
    return this.cached('home:top-creators', async () => {
      const [artist, scenarist] = await Promise.all([
        this.topCreatorByRole('dessinateur'),
        this.topCreatorByRole('scenariste'),
      ]);
      return { artist, scenarist };
    });
  }

  async getScheduledReleases(): Promise<ScheduledRelease[]> {
    return this.cached('home:scheduled', async () => {
      const chapters = await this.prisma.chapter.findMany({
        where: { status: 'scheduled', publishAt: { gt: new Date() } },
        orderBy: { publishAt: 'asc' },
        take: 4,
        include: { work: true },
      });
      return chapters.map((c) => ({
        id: c.id,
        workId: c.workId,
        workSlug: c.work.slug,
        workTitle: c.work.title,
        chapterNumber: c.number,
        genre: c.work.genre,
        releaseAt: c.publishAt.toISOString(),
      }));
    });
  }

  async getRankingAllTime(): Promise<RankingRow[]> {
    return this.cached('home:ranking', async () => {
      const works = await this.prisma.work.findMany({
        orderBy: [{ likeCount: 'desc' }, { id: 'asc' }],
        take: 8,
      });
      return works.map((w, i) => ({ id: w.id, slug: w.slug, rank: i + 1, title: w.title, cover: w.coverImage, meta: w.meta }));
    });
  }

  async getAnnouncements(): Promise<Announcement[]> {
    return this.cached('home:announcements', async () => {
      const announcements = await this.prisma.announcement.findMany({ orderBy: { order: 'asc' } });
      return announcements.map((a) => ({ id: a.id, type: a.type, label: a.label, href: a.href }));
    });
  }

  private async topCreatorByRole(role: CreatorRole): Promise<TopCreator | null> {
    const [profile] = await this.prisma.profile.findMany({
      where: { creatorRoles: { has: role } },
      orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
      take: 1,
      include: { account: true },
    });
    if (!profile) return null;
    return { id: profile.account.id, name: profile.account.displayName, slug: profile.account.profileSlug, avatar: profile.account.avatar, role };
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

/** Exported for reuse by CatalogService.getTrending (DR-2) — same growth-% formula, DR-1 owns it. */
export function growthPercent(weekly: number, prior: number): number {
  if (prior > 0) return Math.round(((weekly - prior) / prior) * 100);
  return weekly > 0 ? 100 : 0;
}
