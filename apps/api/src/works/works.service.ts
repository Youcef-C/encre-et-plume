import { Injectable } from '@nestjs/common';
import type { CollectionItemDto, FundingGoalDto, PlancheDto, WorkChaptersResponse, WorkCreatorDto, WorkDetail, WorkReviewDto } from '@encre-et-plume/shared';
import { WORK_CHAPTER_PAGE_SIZE, WORK_FORMAT_ILLUSTRATIONS, galleryCategoryLabel, hasPlus18Genre } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { workMeta } from './work-meta';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_S = 60; // ponytail: 60s TTL, mirrors HomeService/CatalogService's cached().

/**
 * DR-3 work page "Œuvre". Public, read-only, cached in Redis (fail-open — a cache miss or Redis
 * outage falls through to Postgres, never errors the request). Extends the DR-1/DR-2 Work/Chapter
 * models; never writes (no read-count/like side effects here — AC-B7, DR-4/DR-9 own those).
 */
@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getWork(slug: string): Promise<WorkDetail | null> {
    return this.cached(`work:${slug}`, async () => {
      const work = await this.prisma.work.findFirst({
        where: { slug, publishedAt: { not: null } },
        include: {
          creators: { orderBy: { order: 'asc' }, include: { account: { include: { profile: true } } } },
          fundingGoals: { orderBy: { order: 'asc' } },
          reviews: { orderBy: { createdAt: 'desc' } },
          // DR-12: ordered member illustrations — mapped only for Illustration(s) (collection) works.
          // BE-9: the œuvre page is public — exclude private (unpublished) members.
          collectionItems: {
            where: { illustration: { publishedAt: { not: null } } },
            orderBy: { order: 'asc' },
            include: { illustration: true },
          },
          // DR-12: a collection work's meta line counts its MEMBERS, not chapters — and it counts
          // every member, not just the publicly visible ones the grid above filters to.
          _count: { select: { collectionItems: true } },
        },
      });
      if (!work) return null;

      const chapterCount = await this.prisma.chapter.count({
        where: { workId: work.id, status: 'published', publishAt: { lte: new Date() } },
      });

      return mapWorkDetail(work, chapterCount);
    });
  }

  async getChapters(slug: string, page: number): Promise<WorkChaptersResponse | null> {
    return this.cached(`work:${slug}:chapters:${page}`, async () => {
      const work = await this.prisma.work.findFirst({ where: { slug, publishedAt: { not: null } } });
      if (!work) return null;

      const where = { workId: work.id, status: 'published' as const, publishAt: { lte: new Date() } };
      const skip = (page - 1) * WORK_CHAPTER_PAGE_SIZE;

      const [rows, total] = await Promise.all([
        this.prisma.chapter.findMany({ where, orderBy: { number: 'asc' }, skip, take: WORK_CHAPTER_PAGE_SIZE }),
        this.prisma.chapter.count({ where }),
      ]);

      return {
        items: rows.map(mapChapter),
        total,
        page,
        pageSize: WORK_CHAPTER_PAGE_SIZE,
        totalPages: Math.ceil(total / WORK_CHAPTER_PAGE_SIZE),
      };
    });
  }

  async getPlanches(slug: string): Promise<PlancheDto[] | null> {
    return this.cached(`work:${slug}:planches`, async () => {
      const work = await this.prisma.work.findFirst({ where: { slug, publishedAt: { not: null } } });
      if (!work) return null;

      // DR-4: chapterId:null excludes reader pages (Planche rows scoped to a Chapter) — this
      // grid is the work-level "Illustrations & planches" list only.
      const planches = await this.prisma.planche.findMany({ where: { workId: work.id, chapterId: null }, orderBy: { order: 'asc' } });
      return planches.map((p) => ({ id: p.id, image: p.image, caption: p.caption }));
    });
  }

  /** H2: lightweight lookup so the controller can gate 18+ content on public listing routes. */
  async getAudienceRating(slug: string): Promise<string | null> {
    const work = await this.prisma.work.findFirst({
      where: { slug, publishedAt: { not: null } },
      select: { audienceRating: true },
    });
    return work?.audienceRating ?? null;
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

interface CreatorRow {
  id: string;
  role: string;
  order: number;
  account: {
    id: string;
    displayName: string;
    profileSlug: string;
    avatar: string | null;
    profile: { city: string | null } | null;
  };
}

interface FundingGoalRow {
  id: string;
  title: string;
  currentCents: number;
  targetCents: number;
  order: number;
}

interface ReviewRow {
  id: string;
  authorId: string | null;
  authorName: string;
  storyRating: number;
  artRating: number;
  text: string;
  hidden: boolean;
  createdAt: Date;
}

interface WorkRow {
  id: string;
  slug: string;
  title: string;
  coverImage: string | null;
  genre: string;
  format: string;
  complete: boolean;
  audienceRating: string;
  publishedAt: Date | null;
  synopsis: string | null;
  themes: string[];
  hashtags: string[];
  proseExcerpt: string | null;
  likeCount: number;
  readCount: number;
  favoriteCount: number;
  creators: CreatorRow[];
  fundingGoals: FundingGoalRow[];
  reviews: ReviewRow[];
  collectionItems?: CollectionItemRow[];
  _count?: { collectionItems: number };
}

interface CollectionItemRow {
  order: number;
  illustration: { id: string; title: string; image: string | null; likeCount: number; category: string; genres: string[] };
}

interface ChapterRow {
  id: string;
  number: number;
  title: string | null;
  plancheCount: number;
  publishAt: Date;
  likeCount: number;
  premium: boolean;
}

function mapWorkDetail(work: WorkRow, chapterCount: number): WorkDetail {
  const team = work.creators.map(mapCreator);
  const fundingGoals = work.fundingGoals.map(mapFundingGoal);
  const reviews = work.reviews.map(mapReview);
  const { ratingAvg, ratingStoryAvg, ratingArtAvg } = aggregateRatings(work.reviews);

  return {
    id: work.id,
    slug: work.slug,
    title: work.title,
    cover: work.coverImage,
    genre: work.genre,
    themes: work.themes, // F-22: F-20 fr labels for the Œuvre clickable tag row
    format: work.format,
    complete: work.complete,
    audienceRating: work.audienceRating,
    // Derived, never stored — see work-meta.ts. The live `chapterCount` is the same number the
    // DÉTAILS sidebar shows, so the hero line and the sidebar can no longer disagree.
    meta: workMeta({ format: work.format, creators: work.creators, _count: work._count }, chapterCount),
    publishedAt: work.publishedAt ? work.publishedAt.toISOString() : null,
    synopsis: work.synopsis,
    hashtags: work.hashtags,
    proseExcerpt: work.format === 'Roman' ? work.proseExcerpt : null,
    likeCount: work.likeCount,
    readCount: work.readCount,
    favoriteCount: work.favoriteCount,
    ratingAvg,
    ratingStoryAvg,
    ratingArtAvg,
    reviewCount: work.reviews.length,
    chapterCount,
    team,
    fundingGoals,
    reviews,
    // DR-12: member grid for a collection; null for every other format.
    // ponytail: unpaginated member grid, bounded by one artist's uploads; paginate past ~100.
    collectionItems: work.format === WORK_FORMAT_ILLUSTRATIONS ? (work.collectionItems ?? []).map(mapCollectionItem) : null,
  };
}

function mapCollectionItem(ci: CollectionItemRow): CollectionItemDto {
  return {
    id: ci.illustration.id,
    title: ci.illustration.title,
    thumbnail: ci.illustration.image,
    likeCount: ci.illustration.likeCount,
    category: ci.illustration.category,
    categoryLabel: galleryCategoryLabel(ci.illustration.category),
    order: ci.order,
    is18plus: hasPlus18Genre(ci.illustration.genres ?? []),
  };
}

function mapCreator(c: CreatorRow): WorkCreatorDto {
  return {
    id: c.account.id,
    name: c.account.displayName,
    slug: c.account.profileSlug,
    role: c.role,
    city: c.account.profile?.city ?? null,
    avatar: c.account.avatar,
  };
}

function mapFundingGoal(g: FundingGoalRow): FundingGoalDto {
  const pct = g.targetCents > 0 ? Math.min(100, Math.round((g.currentCents / g.targetCents) * 100)) : 0;
  return { id: g.id, title: g.title, currentCents: g.currentCents, targetCents: g.targetCents, pct };
}

function mapReview(r: ReviewRow): WorkReviewDto {
  return {
    id: r.id,
    authorId: r.authorId, // MC-10: enables per-viewer mute filtering in the controller
    authorName: r.authorName,
    storyRating: r.storyRating,
    artRating: r.artRating,
    text: r.hidden ? '' : r.text,
    hidden: r.hidden,
  };
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function aggregateRatings(reviews: ReviewRow[]): { ratingAvg: number; ratingStoryAvg: number; ratingArtAvg: number } {
  return {
    ratingAvg: mean(reviews.map((r) => (r.storyRating + r.artRating) / 2)),
    ratingStoryAvg: mean(reviews.map((r) => r.storyRating)),
    ratingArtAvg: mean(reviews.map((r) => r.artRating)),
  };
}

function mapChapter(c: ChapterRow) {
  // DR-4: no access system yet — premium ⇒ locked for every viewer.
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    plancheCount: c.plancheCount,
    publishedAt: c.publishAt.toISOString(),
    likeCount: c.likeCount,
    locked: c.premium,
    lockReason: c.premium ? 'premium' : null,
  };
}
