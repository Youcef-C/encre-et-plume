import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GalleryCategoryKey,
  GalleryFeatureCard,
  GalleryIllustrationCard,
  GalleryListResponse,
  GalleryPreview,
  GalleryQuery,
  GallerySummary,
  IllustrationArtist,
  IllustrationDetail,
} from '@encre-et-plume/shared';
import { GALLERY_PAGE_SIZE, catalogGenreLabel, galleryCategoryLabel } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_S = 60; // ponytail: fail-open Redis cache, same TTL/pattern as CatalogService.
const DEFAULT_LICENSE = '© Tous droits réservés';
// DR-6: role -> French label, same convention as DR-3's Sidebar.tsx ROLE_LABEL map (frontend copy).
const ROLE_LABELS: Record<string, string> = { dessinateur: 'Dessinateur·rice', scenariste: 'Scénariste' };
const DEFAULT_ROLE_LABEL = 'Dessinateur·rice';
const MORE_BY_ARTIST_LIMIT = 6;

/**
 * DR-5 illustration gallery "Galerie". Public, read-only, cached in Redis (fail-open — a cache
 * miss or Redis outage falls through to Postgres, never errors the request). Mirrors
 * CatalogService's `cached()` helper.
 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findIllustrations(query: GalleryQuery): Promise<GalleryListResponse> {
    const cacheKey = `gallery:list:${JSON.stringify(query)}`;
    return this.cached(cacheKey, async () => {
      const where = buildWhere(query);
      const orderBy = buildOrderBy(query.tri);
      const skip = (query.page - 1) * GALLERY_PAGE_SIZE;

      const [rows, total, summary] = await Promise.all([
        this.prisma.illustration.findMany({ where, orderBy, skip, take: GALLERY_PAGE_SIZE, include: { artist: true } }),
        this.prisma.illustration.count({ where }),
        this.getSummary(),
      ]);

      return {
        items: rows.map(mapToCard),
        total,
        page: query.page,
        pageSize: GALLERY_PAGE_SIZE,
        totalPages: Math.ceil(total / GALLERY_PAGE_SIZE),
        summary,
      };
    });
  }

  /** Global, unfiltered counts feeding the header "N illustrations · N artistes" summary. */
  async getSummary(): Promise<GallerySummary> {
    const where = { publishedAt: { not: null } };
    const [illustrationCount, artists] = await Promise.all([
      this.prisma.illustration.count({ where }),
      this.prisma.illustration.findMany({ where, select: { artistName: true }, distinct: ['artistName'] }),
    ]);
    return { illustrationCount, artistCount: artists.length };
  }

  /** GET /illustrations/trending — top-2 "Tendances cette semaine" (rolling-7d weeklyLikeDelta). */
  async getTrending(): Promise<GalleryFeatureCard[]> {
    const rows = await this.prisma.illustration.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ weeklyLikeDelta: 'desc' }, { id: 'asc' }],
      take: 2,
      include: { artist: true },
    });
    return rows.map((row, i) => ({ ...mapToCard(row), rank: i + 1 }));
  }

  /** GET /illustrations/:id/preview — quick-preview payload. Throws 404 if missing/unpublished. */
  async getPreview(id: string): Promise<GalleryPreview> {
    const row = await this.prisma.illustration.findFirst({
      where: { id, publishedAt: { not: null } },
      include: { artist: true },
    });
    if (!row) throw new NotFoundException(`Illustration ${id} not found`);
    return {
      id: row.id,
      title: row.title,
      artistName: row.artistName,
      artistSlug: row.artist?.profileSlug ?? null,
      category: row.category as GalleryCategoryKey,
      categoryLabel: galleryCategoryLabel(row.category),
      likeCount: row.likeCount,
      image: row.image,
    };
  }

  /** GET /illustrations/:id — full detail. `null` when missing/unpublished (controller maps to 404). */
  async getIllustration(id: string): Promise<IllustrationDetail | null> {
    const row = await this.prisma.illustration.findFirst({
      where: { id, publishedAt: { not: null } },
      include: { artist: { include: { profile: true } } },
    });
    if (!row) return null;
    return mapToDetail(row);
  }

  /** GET /illustrations/:id/more — "Plus de cet·te artiste", grouped by the stable `artistName`. */
  async getMoreByArtist(id: string): Promise<GalleryIllustrationCard[]> {
    const source = await this.prisma.illustration.findFirst({
      where: { id, publishedAt: { not: null } },
      select: { artistName: true },
    });
    if (!source) return [];

    const rows = await this.prisma.illustration.findMany({
      where: { artistName: source.artistName, publishedAt: { not: null }, id: { not: id } },
      orderBy: [{ likeCount: 'desc' }, { id: 'asc' }],
      take: MORE_BY_ARTIST_LIMIT,
      include: { artist: true },
    });
    return rows.map(mapToCard);
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
function buildWhere(query: GalleryQuery): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { publishedAt: { not: null } };
  if (query.category) where['category'] = query.category;
  // Round 2: genre[] facet, OR-within a single hasSome (Illustration has no scalar genre column
  // to OR against, unlike Work — genres is its only genre-bearing field, so no AND-nesting needed).
  if (query.genre.length > 0) where['genres'] = { hasSome: query.genre.map((id) => catalogGenreLabel(id)) };
  // Round 2: q facet, same OR-on-title-and-secondary-text convention as the catalog's `q`.
  if (query.q) {
    where['OR'] = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { artistName: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function buildOrderBy(tri: GalleryQuery['tri']): Array<Record<string, 'asc' | 'desc'>> {
  switch (tri) {
    case 'nouveautes':
      return [{ publishedAt: 'desc' }, { id: 'asc' }];
    case 'populaires':
      return [{ likeCount: 'desc' }, { id: 'asc' }];
    case 'tendance':
    default:
      return [{ weeklyLikeDelta: 'desc' }, { id: 'asc' }];
  }
}

interface IllustrationRow {
  id: string;
  title: string;
  artistName: string;
  category: string;
  likeCount: number;
  image: string | null;
  artist?: { profileSlug: string } | null;
}

function mapToCard(row: IllustrationRow): GalleryIllustrationCard {
  return {
    id: row.id,
    title: row.title,
    artistName: row.artistName,
    artistSlug: row.artist?.profileSlug ?? null,
    category: row.category as GalleryCategoryKey,
    categoryLabel: galleryCategoryLabel(row.category),
    likeCount: row.likeCount,
    thumbnail: row.image,
  };
}

interface IllustrationDetailRow extends IllustrationRow {
  description: string | null;
  hashtags: string[];
  width: number | null;
  height: number | null;
  tools: string | null;
  license: string | null;
  publishedAt: Date | null;
  artist?: { id: string; profileSlug: string; avatar: string | null; profile?: { creatorRoles: string[]; city: string | null } | null } | null;
}

function mapToDetail(row: IllustrationDetailRow): IllustrationDetail {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as GalleryCategoryKey,
    categoryLabel: galleryCategoryLabel(row.category),
    hashtags: row.hashtags,
    image: row.image,
    dimensionsLabel: row.width != null && row.height != null ? `${row.width} × ${row.height}` : null,
    tools: row.tools,
    license: row.license ?? DEFAULT_LICENSE,
    likeCount: row.likeCount,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    artist: mapArtist(row),
  };
}

function mapArtist(row: IllustrationDetailRow): IllustrationArtist {
  if (!row.artist) {
    return { id: null, name: row.artistName, slug: null, role: DEFAULT_ROLE_LABEL, city: null, avatar: null };
  }
  const roleKey = row.artist.profile?.creatorRoles[0];
  return {
    id: row.artist.id,
    name: row.artistName,
    slug: row.artist.profileSlug,
    role: (roleKey && ROLE_LABELS[roleKey]) ?? DEFAULT_ROLE_LABEL,
    city: row.artist.profile?.city ?? null,
    avatar: row.artist.avatar ?? null,
  };
}
