import { Injectable } from '@nestjs/common';
import type { ActiveContest, CatalogQuery, CatalogResponse, CatalogWorkCard, CatalogFormat, EditorPickItem, TrendingWork } from '@encre-et-plume/shared';
import { CATALOG_PAGE_SIZE, catalogGenreLabel, GENRES, isWork18Plus } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { growthPercent } from '../home/home.service';

// Round-2: vocabulary entries flagged `mature:true`, as fr labels (Work.genre/themes store fr).
const MATURE_GENRE_LABELS = GENRES.filter((g) => g.mature).map((g) => g.fr);

const CACHE_TTL_S = 60; // ponytail: 60s TTL; DR-9 like events will invalidate instead of waiting out the TTL.

/**
 * DR-2 catalog "Découvrir". Public, read-only, cached in Redis (fail-open — a cache miss or Redis
 * outage falls through to Postgres, never errors the request). Mirrors HomeService's `cached()`.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findWorks(query: CatalogQuery): Promise<CatalogResponse> {
    const cacheKey = `catalog:list:${JSON.stringify(query)}`;
    return this.cached(cacheKey, async () => {
      const where = buildWhere(query);
      const orderBy = buildOrderBy(query.tri);
      const skip = (query.page - 1) * CATALOG_PAGE_SIZE;

      const [rows, total] = await Promise.all([
        this.prisma.work.findMany({ where, orderBy, skip, take: CATALOG_PAGE_SIZE }),
        this.prisma.work.count({ where }),
      ]);

      return {
        items: rows.map(mapToCard),
        total,
        page: query.page,
        pageSize: CATALOG_PAGE_SIZE,
        totalPages: Math.ceil(total / CATALOG_PAGE_SIZE),
      };
    });
  }

  /** GET /catalog/trending — top-3 "En vogue cette semaine" (same ordering as HomeService, take 3). */
  async getTrending(): Promise<TrendingWork[]> {
    const works = await this.prisma.work.findMany({
      orderBy: [{ weeklyLikeDelta: 'desc' }, { id: 'asc' }],
      take: 3,
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
      is18plus: isWork18Plus(w.audienceRating),
    }));
  }

  /** GET /contests/active — the current active contest banner, or null if none. */
  async getActiveContest(): Promise<ActiveContest | null> {
    const [contest] = await this.prisma.contest.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    if (!contest) return null;
    return {
      id: contest.id,
      category: contest.category,
      title: contest.title,
      subtitle: contest.subtitle,
      ctaLabel: contest.ctaLabel,
      href: contest.href,
    };
  }

  /** GET /catalog/editor-pick — "SÉLECTION ÉDITEUR" items, curated (read-only in DR-2). */
  async getEditorPicks(): Promise<EditorPickItem[]> {
    const picks = await this.prisma.editorPick.findMany({
      orderBy: { order: 'asc' },
      include: { work: true },
    });
    return picks.map((p) => ({ id: p.id, workSlug: p.work.slug, blurb: p.blurb }));
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWhere(query: CatalogQuery): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { publishedAt: { not: null } };
  // Prisma allows only one top-level `OR` — genre-OR-themes, public=mature, and `q` each need their
  // OWN OR-group, so they're collected here and combined via a top-level `AND` (OR-within/AND-across
  // still holds: each entry is itself an OR, and the array as a whole is AND-ed by Prisma).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const and: Record<string, any>[] = [];

  if (query.genre.length > 0) {
    const labels = query.genre.map((id) => catalogGenreLabel(id));
    and.push({ OR: [{ genre: { in: labels } }, { themes: { hasSome: labels } }] });
  }
  if (query.format.length > 0) where['format'] = { in: query.format };
  if (query.langue.length > 0) where['language'] = { in: query.langue };
  // Round-2b: `public` is multi-select (OR-within, like the other facets). Both selected -> a
  // single OR-group flattening mature-genre/themes and audienceRating=18+ together; one selected
  // -> that filter alone; none -> no filter.
  const wantsMature = query.public.includes('mature');
  const wants18plus = query.public.includes('18plus');
  if (wantsMature && wants18plus) {
    and.push({ OR: [{ genre: { in: MATURE_GENRE_LABELS } }, { themes: { hasSome: MATURE_GENRE_LABELS } }, { audienceRating: '18+' }] });
  } else if (wantsMature) {
    and.push({ OR: [{ genre: { in: MATURE_GENRE_LABELS } }, { themes: { hasSome: MATURE_GENRE_LABELS } }] });
  } else if (wants18plus) {
    where['audienceRating'] = '18+';
  }
  if (query.statut) where['complete'] = query.statut === 'complete';
  if (query.longueur) where['chapterCount'] = longueurRange(query.longueur);
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        // Search-by-author-name. It used to ride on the `Work.meta` string having the author baked
        // into it; with that column gone it matches the WorkCreator relation directly — which also
        // fixes the works whose meta named someone who was never a creator.
        { creators: { some: { account: { displayName: { contains: query.q, mode: 'insensitive' } } } } },
      ],
    });
  }

  if (and.length > 0) where['AND'] = and;

  return where;
}

function longueurRange(longueur: NonNullable<CatalogQuery['longueur']>): { equals?: number; gte?: number; lte?: number } {
  switch (longueur) {
    case 'oneshot':
      return { equals: 1 };
    case 'court':
      return { gte: 2, lte: 15 };
    case 'long':
      return { gte: 16 };
  }
}

function buildOrderBy(tri: CatalogQuery['tri']): Array<Record<string, 'asc' | 'desc'>> {
  switch (tri) {
    case 'nouveautes':
      return [{ publishedAt: 'desc' }, { id: 'asc' }];
    case 'mieux-notees':
      return [{ ratingAvg: 'desc' }, { id: 'asc' }];
    case 'populaires':
    default:
      return [{ likeCount: 'desc' }, { id: 'asc' }];
  }
}

interface WorkRow {
  id: string;
  slug: string;
  title: string;
  genre: string;
  chapterCount: number;
  likeCount: number;
  complete: boolean;
  format: string;
  coverImage: string | null;
  audienceRating: string;
}

function mapToCard(w: WorkRow): CatalogWorkCard {
  return {
    id: w.id,
    slug: w.slug,
    title: w.title,
    genre: w.genre,
    chapterCount: w.chapterCount,
    likeCount: w.likeCount,
    complete: w.complete,
    format: w.format as CatalogFormat,
    cover: w.coverImage,
    is18plus: isWork18Plus(w.audienceRating),
  };
}
