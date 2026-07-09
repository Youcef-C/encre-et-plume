import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CollectionChip,
  GalleryCategoryKey,
  GalleryFeatureCard,
  GalleryIllustrationCard,
  GalleryListResponse,
  GalleryPreview,
  GalleryQuery,
  GallerySummary,
  IllustrationArtist,
  IllustrationDetail,
  PublishIllustrationRequest,
  PublishIllustrationResponse,
  UpdateIllustrationRequest,
} from '@encre-et-plume/shared';
import {
  GALLERY_CATEGORY_KEYS,
  GALLERY_PAGE_SIZE,
  catalogGenreLabel,
  galleryCategoryLabel,
  hasPlus18Genre,
  normalizeHashtags,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CollectionsService } from '../collections/collections.service';
import { MediaService } from '../media/media.service';

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
    private readonly collections: CollectionsService,
    private readonly media: MediaService,
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
      is18plus: hasPlus18Genre(row.genres),
    };
  }

  /**
   * GET /illustrations/:id — full detail. `null` when missing (controller maps to 404).
   * BE-9: a private illustration (`publishedAt === null`) is hidden from everyone but its artist —
   * the owner keeps viewing/editing it; a non-owner or anonymous viewer gets `null` (→ 404).
   */
  async getIllustration(id: string, viewerId?: string): Promise<IllustrationDetail | null> {
    const row = await this.prisma.illustration.findFirst({
      where: { id },
      include: {
        artist: { include: { profile: true } },
        // DR-12: collection chips on the detail page (-> /oeuvre/:slug).
        collections: { include: { work: { select: { id: true, slug: true, title: true, coverImage: true } } } },
      },
    });
    if (!row) return null;
    if (row.publishedAt === null && row.artistId !== viewerId) return null;
    return mapToDetail(row);
  }

  /**
   * DR-12 (BE-4): minimal publish endpoint — the interim CS-3 stand-in. Requires the creator role
   * (delegated to CollectionsService.assertCreator). `collectionIds[]` must be collections owned by
   * the caller (403 if not — never silently dropped). `mediaId` (kind 'illustration', ready) → image.
   */
  async publishIllustration(accountId: string, dto: PublishIllustrationRequest): Promise<PublishIllustrationResponse> {
    await this.collections.assertCreator(accountId);
    const title = (dto.title ?? '').trim();
    if (!title) throw new BadRequestException('Un titre est requis');
    if (!(GALLERY_CATEGORY_KEYS as readonly string[]).includes(dto.category)) throw new BadRequestException('Catégorie invalide');

    const collectionIds = dto.collectionIds ?? [];
    if (collectionIds.length) await this.collections.assertOwnsCollections(accountId, collectionIds);

    let image: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    if (dto.mediaId) {
      const m = await this.media.getForOwner(accountId, dto.mediaId); // enforces ownership (403)
      if (m.kind !== 'illustration') throw new BadRequestException('Le média doit être une illustration');
      if (m.status !== 'ready') throw new BadRequestException("L'illustration n'est pas encore prête");
      image = (m.variants as { web?: string }).web ?? null;
      width = m.width ?? null;
      height = m.height ?? null;
    }

    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { displayName: true } });
    const created = await this.prisma.illustration.create({
      data: {
        title,
        artistId: accountId,
        artistName: account?.displayName ?? '',
        category: dto.category,
        genres: (dto.genres ?? []).map((gid) => catalogGenreLabel(gid)),
        hashtags: normalizeHashtags(dto.hashtags ?? []), // BE-7: F-22 chips — searchable via the existing `tags` filter
        image,
        width,
        height,
        description: dto.description ?? null,
        publishedAt: new Date(),
      },
    });
    for (const workId of collectionIds) await this.collections.appendMembership(workId, created.id);
    await this.invalidateListCaches(); // a newly published illustration must appear in the Galerie now
    return { id: created.id };
  }

  /**
   * BE-9: PATCH /illustrations/:id — owner-only partial edit of the illustration itself. Every key is
   * optional; an absent key leaves that field untouched. A non-owner/missing illustration gets a
   * uniform 404 (no ownership leak, same convention as collections). Returns the full IllustrationDetail.
   * `visibility` maps to the existing `publishedAt` convention (D21): 'private' → null; 'public' →
   * keep the current publish date if set, else stamp now.
   */
  async updateIllustration(accountId: string, id: string, dto: UpdateIllustrationRequest): Promise<IllustrationDetail> {
    const illu = await this.prisma.illustration.findUnique({ where: { id }, select: { artistId: true, publishedAt: true } });
    if (!illu || illu.artistId !== accountId) throw new NotFoundException('Illustration introuvable');

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (!t) throw new BadRequestException('Un titre est requis');
      data['title'] = t;
    }
    if (dto.category !== undefined) {
      if (!(GALLERY_CATEGORY_KEYS as readonly string[]).includes(dto.category)) throw new BadRequestException('Catégorie invalide');
      data['category'] = dto.category;
    }
    if (dto.description !== undefined) data['description'] = dto.description?.trim() || null;
    if (dto.hashtags !== undefined) data['hashtags'] = normalizeHashtags(dto.hashtags);
    if (dto.tools !== undefined) data['tools'] = dto.tools?.trim() || null;
    if (dto.license !== undefined) data['license'] = dto.license?.trim() || null;
    if (dto.visibility !== undefined) {
      data['publishedAt'] = dto.visibility === 'private' ? null : (illu.publishedAt ?? new Date());
    }

    await this.prisma.illustration.update({ where: { id }, data });
    await this.invalidateCollectionCaches(id); // title/visibility edits reflect on the collection œuvre pages
    await this.invalidateListCaches(); // title/category/visibility edits reflect in the Galerie list now
    return (await this.getIllustration(id, accountId))!;
  }

  /**
   * DELETE /illustrations/:id — owner-only hard delete (from the "Modifier" form). Uniform 404 for a
   * non-owner/missing illustration. Membership rows cascade away (IllustrationCollection onDelete).
   */
  async deleteIllustration(accountId: string, id: string): Promise<void> {
    const illu = await this.prisma.illustration.findUnique({ where: { id }, select: { artistId: true } });
    if (!illu || illu.artistId !== accountId) throw new NotFoundException('Illustration introuvable');
    await this.invalidateCollectionCaches(id); // capture member-collection caches BEFORE the rows cascade away
    await this.prisma.illustration.delete({ where: { id } });
    await this.invalidateListCaches(); // deleted illustration must leave the Galerie immediately, not at TTL
  }

  /** Invalidate the `work:{slug}` œuvre cache of every collection the illustration belongs to. */
  private async invalidateCollectionCaches(illustrationId: string): Promise<void> {
    const memberships = await this.prisma.illustrationCollection.findMany({
      where: { illustrationId },
      select: { work: { select: { slug: true } } },
    });
    for (const m of memberships) await this.redis.del(`work:${m.work.slug}`).catch(() => {});
  }

  /**
   * Invalidate the query-hashed gallery + collections LIST caches after a create/update/delete, so a
   * removed/edited illustration disappears (or a new one appears) immediately instead of at the 60s TTL.
   */
  private async invalidateListCaches(): Promise<void> {
    await this.redis.delByPattern('gallery:list:*');
    await this.redis.delByPattern('collections:list:*');
  }

  /** GET /illustrations/mine — the caller's own published illustrations (manage-view add picker). */
  // ponytail: unpaginated, bounded by one artist's own uploads; paginate past ~200.
  async getMineIllustrations(accountId: string): Promise<GalleryIllustrationCard[]> {
    await this.collections.assertCreator(accountId); // auth + creator (D7)
    // BE-9: the owner's own list — include hidden (private) pieces so they stay reachable to
    // edit/republish and to add via the manage-view picker (public surfaces still filter published).
    const rows = await this.prisma.illustration.findMany({
      where: { artistId: accountId },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      include: { artist: true },
    });
    return rows.map(mapToCard);
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
  // F-22: exact hashtag tokens, AND-narrowed — each added tag refines the set (illustrations
  // carrying ALL of them). Prisma String[] supports has/hasEvery only, no partial contains.
  // `query.tags` are already normalized by parseGalleryQuery.
  if (query.tags.length > 0) where['hashtags'] = { hasEvery: query.tags };
  // DR-12: filter to a collection's members (opaque Work id, validated by the join not the query).
  if (query.collection) where['collections'] = { some: { workId: query.collection } };
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
  genres: string[];
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
    is18plus: hasPlus18Genre(row.genres),
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
  collections?: { work: { id: string; slug: string; title: string; coverImage: string | null } }[];
}

function mapToDetail(row: IllustrationDetailRow): IllustrationDetail {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as GalleryCategoryKey,
    categoryLabel: galleryCategoryLabel(row.category),
    genres: row.genres, // F-22: F-20 fr labels for clickable genre chips (also feeds is18plus below)
    hashtags: row.hashtags,
    image: row.image,
    dimensionsLabel: row.width != null && row.height != null ? `${row.width} × ${row.height}` : null,
    tools: row.tools,
    license: row.license ?? DEFAULT_LICENSE,
    likeCount: row.likeCount,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    artist: mapArtist(row),
    is18plus: hasPlus18Genre(row.genres),
    // DR-12: collections the illustration belongs to (-> /oeuvre/:slug), with cover for the sidebar box.
    collections: (row.collections ?? []).map((c): CollectionChip => ({ id: c.work.id, slug: c.work.slug, title: c.work.title, cover: c.work.coverImage ?? null })),
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
