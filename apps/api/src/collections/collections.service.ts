import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CollectionCoverInput,
  CollectionDetail,
  CollectionItemDto,
  CollectionsListQuery,
  CollectionsListResponse,
  CollectionSummary,
  CreateCollectionRequest,
  SoutienConfig,
  UpdateCollectionRequest,
} from '@encre-et-plume/shared';
import {
  catalogGenreLabel,
  galleryCategoryLabel,
  GALLERY_PAGE_SIZE,
  hasPlus18Genre,
  normalizeHashtags,
  WORK_FORMAT_ILLUSTRATIONS,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SlugService } from '../slug/slug.service';
import { MediaService } from '../media/media.service';

const DEFAULT_GENRE = 'Art'; // prototype default for a collection with no genres

/**
 * DR-12 illustration collections "Collection". A collection is a `Work` with format
 * 'Illustration(s)', owned via a `WorkCreator` row, with an ordered many-to-many join
 * (`IllustrationCollection`) to `Illustration`. Public read; every mutation requires auth +
 * the creator role (non-empty `Profile.creatorRoles`, D7) AND ownership of the collection.
 */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly slug: SlugService,
    private readonly media: MediaService,
  ) {}

  /** F-2/D7: the "Illustrator/Creator role" maps to a non-empty `Profile.creatorRoles`. */
  async assertCreator(accountId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({ where: { accountId }, select: { creatorRoles: true } });
    if (!profile?.creatorRoles?.length) throw new ForbiddenException('Réservé aux créateur·rices');
  }

  async create(accountId: string, dto: CreateCollectionRequest): Promise<CollectionSummary> {
    await this.assertCreator(accountId);
    const title = (dto.title ?? '').trim();
    if (!title) throw new BadRequestException('Un titre est requis');

    const contestId = await this.resolveContestId(dto.contestId ?? undefined);
    const soutien = buildSoutien(dto);
    const ownerName = dto.cover ? await this.ownerDisplayName(accountId) : '';

    const genres = dto.genres ?? [];
    const slug = await this.uniqueWorkSlug(this.slug.slugify(title) || 'collection');

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.work.create({
        data: {
          slug,
          title,
          format: WORK_FORMAT_ILLUSTRATIONS,
          genre: genres[0] ? catalogGenreLabel(genres[0]) : DEFAULT_GENRE,
          themes: genres.slice(1).map((id) => catalogGenreLabel(id)),
          synopsis: dto.description ?? null,
          hashtags: normalizeHashtags(dto.hashtags ?? []),
          meta: metaLine(0),
          audienceRating: 'Tous publics',
          publishedAt: new Date(),
          coverImage: null,
          contestId: contestId ?? null,
          soutien: (soutien ?? undefined) as never, // Prisma Json input; SoutienConfig has no index signature
        },
      });
      await tx.workCreator.create({ data: { workId: created.id, accountId, role: 'dessinateur', order: 0 } });
      const goals = dto.goals ?? [];
      for (let i = 0; i < goals.length; i++) {
        await tx.fundingGoal.create({
          data: { workId: created.id, title: goals[i].title, targetCents: goals[i].targetCents, currentCents: 0, order: i },
        });
      }
      // BE-8: the cover is always a member — upload creates a Couverture Illustration at order 0.
      let count = 0;
      let cover: string | null = null;
      if (dto.cover) {
        cover = await this.applyCoverAsMember(tx, { workId: created.id, ownerId: accountId, ownerName, workTitle: title }, dto.cover);
        count = await tx.illustrationCollection.count({ where: { workId: created.id } });
        await tx.work.update({ where: { id: created.id }, data: { coverImage: cover, meta: metaLine(count) } });
      }
      return { work: created, count, cover };
    });

    return { id: result.work.id, slug: result.work.slug, title: result.work.title, cover: result.cover, count: result.count };
  }

  /** GET /collections/mine — the caller's collections (newest first) for the multiselect + edit panel. */
  async getMine(accountId: string): Promise<CollectionSummary[]> {
    const works = await this.prisma.work.findMany({
      where: { format: WORK_FORMAT_ILLUSTRATIONS, creators: { some: { accountId } } },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { collectionItems: true } } },
    });
    return works.map((w) => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      cover: w.coverImage,
      count: (w as unknown as { _count: { collectionItems: number } })._count.collectionItems,
    }));
  }

  /**
   * BE-6: GET /collections — public, paginated list of collection œuvres for the Galerie "Collections"
   * facet, filterable by `q` (title/artist), `genre[]` (F-20), `tags[]` (F-22 hashtags). Sorted
   * publishedAt desc (D13); 60s Redis-cached like the gallery list (fresh titles/tags → cold keys).
   */
  async findCollections(query: CollectionsListQuery): Promise<CollectionsListResponse> {
    const cacheKey = `collections:list:${JSON.stringify(query)}`;
    const hit = await this.redis.get(cacheKey);
    if (hit) return JSON.parse(hit) as CollectionsListResponse;

    const where = buildCollectionsWhere(query);
    const skip = (query.page - 1) * GALLERY_PAGE_SIZE;
    const [rows, total] = await Promise.all([
      this.prisma.work.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: GALLERY_PAGE_SIZE,
        include: {
          creators: { orderBy: { order: 'asc' }, include: { account: { select: { displayName: true } } } },
          _count: { select: { collectionItems: true } },
        },
      }),
      this.prisma.work.count({ where }),
    ]);

    const res: CollectionsListResponse = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: rows.map((w: any) => ({
        id: w.id,
        slug: w.slug,
        title: w.title,
        cover: w.coverImage,
        count: w._count.collectionItems,
        artistName: w.creators[0]?.account?.displayName ?? '',
        likeCount: w.likeCount, // Work.likeCount — parity with the Catalogue ♥ count
      })),
      total,
      page: query.page,
      pageSize: GALLERY_PAGE_SIZE,
      totalPages: Math.ceil(total / GALLERY_PAGE_SIZE),
    };
    await this.redis.set(cacheKey, JSON.stringify(res), 'EX', 60); // 60s TTL, same pattern as the gallery list
    return res;
  }

  /** GET /collections/:id — public. Accepts a Work id OR slug. Owner-only fields when the caller owns it. */
  async getById(idOrSlug: string, viewerId?: string): Promise<CollectionDetail | null> {
    const work = await this.prisma.work.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], format: WORK_FORMAT_ILLUSTRATIONS, publishedAt: { not: null } },
      include: {
        creators: { orderBy: { order: 'asc' }, include: { account: { select: { id: true, displayName: true, profileSlug: true } } } },
        collectionItems: { orderBy: { order: 'asc' }, include: { illustration: true } },
        fundingGoals: { orderBy: { order: 'asc' } },
      },
    });
    if (!work) return null;
    return this.mapDetail(work, viewerId);
  }

  async update(accountId: string, id: string, dto: UpdateCollectionRequest): Promise<CollectionDetail> {
    const work = await this.loadOwned(accountId, id);

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (!t) throw new BadRequestException('Un titre est requis');
      data['title'] = t; // slug NEVER regenerated — shared links stay stable
    }
    if (dto.description !== undefined) data['synopsis'] = dto.description;
    if (dto.genres !== undefined) {
      data['genre'] = dto.genres[0] ? catalogGenreLabel(dto.genres[0]) : DEFAULT_GENRE;
      data['themes'] = dto.genres.slice(1).map((gid) => catalogGenreLabel(gid));
    }
    if (dto.hashtags !== undefined) data['hashtags'] = normalizeHashtags(dto.hashtags);
    if (dto.contestId !== undefined) data['contestId'] = dto.contestId === null ? null : await this.resolveContestId(dto.contestId);
    const soutien = mergeSoutien(work.soutien as SoutienConfig | null, dto);
    if (soutien !== undefined) data['soutien'] = soutien ?? undefined;

    // BE-8: cover resolves to a member (upload creates one at order 0; promote points coverImage at a
    // member). Handled inside the tx so the membership shift + coverImage + meta are one atomic write.
    const ownerName = dto.cover ? await this.ownerDisplayName(accountId) : '';
    const workTitle = (data['title'] as string | undefined) ?? work.title;

    await this.prisma.$transaction(async (tx) => {
      await tx.work.update({ where: { id: work.id }, data });
      if (dto.cover !== undefined) {
        if (dto.cover === null) {
          await tx.work.update({ where: { id: work.id }, data: { coverImage: null } }); // keeps members (D15)
        } else {
          const coverImage = await this.applyCoverAsMember(tx, { workId: work.id, ownerId: accountId, ownerName, workTitle }, dto.cover);
          const count = await tx.illustrationCollection.count({ where: { workId: work.id } });
          await tx.work.update({ where: { id: work.id }, data: { coverImage, meta: metaLine(count) } });
        }
      }
      if (dto.goals !== undefined) {
        await tx.fundingGoal.deleteMany({ where: { workId: work.id } });
        for (let i = 0; i < dto.goals.length; i++) {
          await tx.fundingGoal.create({
            data: { workId: work.id, title: dto.goals[i].title, targetCents: dto.goals[i].targetCents, currentCents: 0, order: i },
          });
        }
      }
    });

    await this.invalidate(work.slug);
    return (await this.getById(work.id, accountId))!;
  }

  async remove(accountId: string, id: string): Promise<void> {
    const work = await this.loadOwned(accountId, id);
    await this.prisma.$transaction(async (tx) => {
      // illustrationCollection cascades on work delete; the rest are FK-Restrict dependents a Work can carry.
      await tx.workCreator.deleteMany({ where: { workId: work.id } });
      await tx.fundingGoal.deleteMany({ where: { workId: work.id } });
      await tx.review.deleteMany({ where: { workId: work.id } });
      await tx.favorite.deleteMany({ where: { workId: work.id } });
      await tx.watchlistItem.deleteMany({ where: { workId: work.id } });
      await tx.readingProgress.deleteMany({ where: { workId: work.id } });
      await tx.editorPick.deleteMany({ where: { workId: work.id } });
      await tx.work.delete({ where: { id: work.id } });
    });
    await this.invalidate(work.slug);
  }

  // ── membership + reorder (BE-3) ───────────────────────────────────────────────

  async addIllustration(accountId: string, id: string, illustrationId: string): Promise<CollectionDetail> {
    const work = await this.loadOwned(accountId, id);
    const illu = await this.prisma.illustration.findUnique({ where: { id: illustrationId }, select: { id: true, artistId: true } });
    if (!illu) throw new NotFoundException('Illustration introuvable');
    if (illu.artistId !== accountId) throw new ForbiddenException('Cette illustration ne vous appartient pas');

    const max = await this.prisma.illustrationCollection.aggregate({ where: { workId: work.id }, _max: { order: true } });
    const order = (max._max.order ?? -1) + 1;
    // upsert = dedup on re-add; a re-add is a no-op keeping its existing order.
    await this.prisma.illustrationCollection.upsert({
      where: { illustrationId_workId: { illustrationId, workId: work.id } },
      create: { illustrationId, workId: work.id, order },
      update: {},
    });
    await this.recomputeMeta(work.id);
    await this.invalidate(work.slug);
    return (await this.getById(work.id, accountId))!;
  }

  async removeIllustration(accountId: string, id: string, illustrationId: string): Promise<void> {
    const work = await this.loadOwned(accountId, id);
    try {
      await this.prisma.illustrationCollection.delete({
        where: { illustrationId_workId: { illustrationId, workId: work.id } },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2025') throw e; // P2025 = row already gone → idempotent
    }
    // BE-8 invariant guard: the removed member must not stay the cover (else a detached, non-member
    // cover — exactly what the rule forbids). Clear coverImage when it pointed at this member's image.
    const illu = await this.prisma.illustration.findUnique({ where: { id: illustrationId }, select: { image: true } });
    if (illu?.image && illu.image === work.coverImage) {
      await this.prisma.work.update({ where: { id: work.id }, data: { coverImage: null } });
    }
    await this.recomputeMeta(work.id);
    await this.invalidate(work.slug);
  }

  async reorder(accountId: string, id: string, illustrationIds: string[]): Promise<CollectionDetail> {
    const work = await this.loadOwned(accountId, id);
    const members = await this.prisma.illustrationCollection.findMany({ where: { workId: work.id }, select: { illustrationId: true } });
    const current = new Set(members.map((m) => m.illustrationId));
    const next = new Set(illustrationIds);
    if (illustrationIds.length !== current.size || [...next].some((x) => !current.has(x))) {
      throw new BadRequestException('Liste incomplète ou inconnue');
    }
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < illustrationIds.length; i++) {
        await tx.illustrationCollection.update({
          where: { illustrationId_workId: { illustrationId: illustrationIds[i], workId: work.id } },
          data: { order: i },
        });
      }
    });
    await this.invalidate(work.slug);
    return (await this.getById(work.id, accountId))!;
  }

  // ── seams reused by GalleryService (BE-4 publish) ─────────────────────────────

  /** Throws 403 for any workId that is not a collection Work owned by the caller (publish-assign). */
  async assertOwnsCollections(accountId: string, workIds: string[]): Promise<void> {
    for (const workId of workIds) {
      const owned = await this.prisma.work.findFirst({
        where: { id: workId, format: WORK_FORMAT_ILLUSTRATIONS, creators: { some: { accountId } } },
        select: { id: true },
      });
      if (!owned) throw new ForbiddenException('Collection introuvable ou non autorisée');
    }
  }

  /** Append an illustration to a collection (append order, meta recompute). Caller enforces ownership. */
  async appendMembership(workId: string, illustrationId: string): Promise<void> {
    const max = await this.prisma.illustrationCollection.aggregate({ where: { workId }, _max: { order: true } });
    const order = (max._max.order ?? -1) + 1;
    await this.prisma.illustrationCollection.upsert({
      where: { illustrationId_workId: { illustrationId, workId } },
      create: { illustrationId, workId, order },
      update: {},
    });
    await this.recomputeMeta(workId);
    const work = await this.prisma.work.findUnique({ where: { id: workId }, select: { slug: true } });
    if (work) await this.invalidate(work.slug);
  }

  // ── internals ─────────────────────────────────────────────────────────────────

  /** Loads the collection Work owned by `accountId`, or throws a uniform 404 (no ownership leak). */
  private async loadOwned(accountId: string, id: string) {
    const work = await this.prisma.work.findFirst({
      where: { id, format: WORK_FORMAT_ILLUSTRATIONS, creators: { some: { accountId } } },
    });
    if (!work) throw new NotFoundException('Collection introuvable');
    return work;
  }

  private async recomputeMeta(workId: string): Promise<void> {
    const count = await this.prisma.illustrationCollection.count({ where: { workId } });
    await this.prisma.work.update({ where: { id: workId }, data: { meta: metaLine(count) } });
  }

  private async resolveContestId(contestId?: string): Promise<string | null> {
    if (!contestId) return null;
    const contest = await this.prisma.contest.findUnique({ where: { id: contestId }, select: { active: true } });
    if (!contest?.active) throw new BadRequestException('Concours introuvable ou clos');
    return contestId;
  }

  /** Display name for the collection owner — used to denormalize an auto-created Couverture illustration. */
  private async ownerDisplayName(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { displayName: true } });
    return account?.displayName ?? '';
  }

  /**
   * BE-8: resolve a cover so `Work.coverImage` ALWAYS corresponds to a member illustration. Returns the
   * coverImage URL; membership writes happen on the given `tx`.
   * - `{mediaId}` (upload): creates a Couverture Illustration (category 'couvertures', owner = collection
   *   owner) from the ready cover media, then inserts it as a member at order 0 (shifting the rest).
   * - `{illustrationId}` (promote): an already-member just points coverImage at it (no membership write);
   *   an owned non-member is inserted at order 0 first — the invariant holds on every path.
   */
  private async applyCoverAsMember(
    tx: Prisma.TransactionClient,
    ctx: { workId: string; ownerId: string; ownerName: string; workTitle: string },
    cover: CollectionCoverInput,
  ): Promise<string> {
    if ('mediaId' in cover) {
      const m = await this.media.getForOwner(ctx.ownerId, cover.mediaId); // enforces ownership (403)
      if (m.kind !== 'cover') throw new BadRequestException('Le média doit être une couverture');
      if (m.status !== 'ready') throw new BadRequestException("La couverture n'est pas encore prête");
      const image = (m.variants as { web?: string }).web ?? null;
      if (!image) throw new BadRequestException("La couverture n'est pas encore prête");
      const created = await tx.illustration.create({
        data: {
          title: `Couverture · ${ctx.workTitle}`,
          artistId: ctx.ownerId,
          artistName: ctx.ownerName,
          category: 'couvertures', // D12: maps to the existing vocabulary key (no new category)
          genres: [],
          hashtags: [],
          image,
          width: m.width ?? null,
          height: m.height ?? null,
          publishedAt: new Date(),
        },
      });
      await this.insertMemberAtZero(tx, ctx.workId, created.id);
      return image;
    }
    const illu = await tx.illustration.findUnique({
      where: { id: cover.illustrationId },
      select: { artistId: true, image: true },
    });
    if (!illu) throw new NotFoundException('Illustration introuvable');
    if (illu.artistId !== ctx.ownerId) throw new ForbiddenException('Cette illustration ne vous appartient pas');
    if (!illu.image) throw new BadRequestException("Cette illustration n'a pas d'image");
    const existing = await tx.illustrationCollection.findUnique({
      where: { illustrationId_workId: { illustrationId: cover.illustrationId, workId: ctx.workId } },
      select: { illustrationId: true },
    });
    if (!existing) await this.insertMemberAtZero(tx, ctx.workId, cover.illustrationId);
    return illu.image;
  }

  /** Shift every existing member down one slot, then insert the new member at order 0. */
  private async insertMemberAtZero(tx: Prisma.TransactionClient, workId: string, illustrationId: string): Promise<void> {
    await tx.illustrationCollection.updateMany({ where: { workId }, data: { order: { increment: 1 } } });
    await tx.illustrationCollection.create({ data: { workId, illustrationId, order: 0 } });
  }

  /** `base` if unused, else `base-2`, `base-3`, … — scoped to the Work table (SlugService is Account-scoped). */
  private async uniqueWorkSlug(base: string): Promise<string> {
    const existing = await this.prisma.work.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    const taken = new Set(existing.map((w) => w.slug));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }

  private async invalidate(slug: string): Promise<void> {
    await this.redis.del(`work:${slug}`).catch(() => {}); // fail-open, mirrors the read cache
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapDetail(work: any, viewerId?: string): CollectionDetail {
    const owner = work.creators[0]?.account ?? null;
    const isOwner = !!viewerId && work.creators.some((c: { accountId: string }) => c.accountId === viewerId);
    // BE-9: a private (unpublished) member is hidden from public/non-owner reads; the owner's manage
    // view keeps the full list. The count stays derived from ALL membership rows (D22 — not per-viewer).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allRows = work.collectionItems as any[];
    const visibleRows = isOwner ? allRows : allRows.filter((ci) => ci.illustration.publishedAt !== null);
    const items: CollectionItemDto[] = visibleRows.map((ci) => mapItem(ci.illustration, ci.order));
    const base: CollectionDetail = {
      id: work.id,
      slug: work.slug,
      title: work.title,
      cover: work.coverImage,
      count: allRows.length,
      description: work.synopsis,
      genres: [work.genre, ...work.themes],
      hashtags: work.hashtags ?? [], // D17: public — searchable by design (seeds the manage form)
      items,
      owner: owner ? { id: owner.id, name: owner.displayName, slug: owner.profileSlug } : { id: '', name: work.meta, slug: null },
    };
    if (isOwner) {
      base.contestId = work.contestId ?? null;
      base.soutien = (work.soutien as SoutienConfig | null) ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      base.fundingGoals = work.fundingGoals.map((g: any) => ({ id: g.id, title: g.title, targetCents: g.targetCents }));
    }
    return base;
  }
}

function metaLine(count: number): string {
  return `${count} illustration${count === 1 ? '' : 's'} · collection`;
}

/** BE-6: WHERE for the public collections list — mirrors the DR-5 gallery `q`/`genre`/`tags` mechanics. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCollectionsWhere(query: CollectionsListQuery): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { format: WORK_FORMAT_ILLUSTRATIONS, publishedAt: { not: null } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const and: Record<string, any>[] = [];
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { creators: { some: { account: { displayName: { contains: query.q, mode: 'insensitive' } } } } },
      ],
    });
  }
  // EXACT creator-slug filter (Account.profileSlug) — the reusable "works by this creator" clause.
  if (query.artist) and.push({ creators: { some: { account: { profileSlug: query.artist } } } });
  if (query.genre.length > 0) {
    const labels = query.genre.map((id) => catalogGenreLabel(id));
    // a collection's genres live in Work.genre (scalar) + Work.themes (array) — OR across both.
    and.push({ OR: [{ genre: { in: labels } }, { themes: { hasSome: labels } }] });
  }
  // F-22: EXACT hashtag tokens, AND-narrowed (already normalized by parseCollectionsListQuery).
  if (query.tags.length > 0) where['hashtags'] = { hasEvery: query.tags };
  if (and.length > 0) where['AND'] = and;
  return where;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItem(illu: any, order: number): CollectionItemDto {
  return {
    id: illu.id,
    title: illu.title,
    thumbnail: illu.image,
    likeCount: illu.likeCount,
    category: illu.category,
    categoryLabel: galleryCategoryLabel(illu.category),
    order,
    is18plus: hasPlus18Genre(illu.genres ?? []),
  };
}

/** Builds the raw Soutien Json on create when any Soutien field is provided, validating the split. */
function buildSoutien(dto: CreateCollectionRequest): SoutienConfig | null {
  if (dto.tiers === undefined && dto.allowDonations === undefined && dto.revenueSplit === undefined) return null;
  const revenueSplit = dto.revenueSplit ?? [];
  assertSplit(revenueSplit);
  return { tiers: dto.tiers ?? [], allowDonations: dto.allowDonations ?? false, revenueSplit };
}

/** Merges Soutien fields on patch; returns undefined when no Soutien field was sent (leave column as-is). */
function mergeSoutien(current: SoutienConfig | null, dto: UpdateCollectionRequest): SoutienConfig | null | undefined {
  if (dto.tiers === undefined && dto.allowDonations === undefined && dto.revenueSplit === undefined) return undefined;
  const revenueSplit = dto.revenueSplit ?? current?.revenueSplit ?? [];
  assertSplit(revenueSplit);
  return {
    tiers: dto.tiers ?? current?.tiers ?? [],
    allowDonations: dto.allowDonations ?? current?.allowDonations ?? false,
    revenueSplit,
  };
}

function assertSplit(revenueSplit: { pct: number }[]): void {
  if (revenueSplit.length > 0 && revenueSplit.reduce((s, r) => s + r.pct, 0) !== 100) {
    throw new BadRequestException('La répartition des revenus doit totaliser 100 %');
  }
}
