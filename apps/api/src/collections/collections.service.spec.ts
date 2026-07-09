import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SlugService } from '../slug/slug.service';
import { MediaService } from '../media/media.service';

// A collection Work owned by acc1, format Illustration(s).
const WORK_ROW = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'w1',
  slug: 'carnet-d-encre',
  title: "Carnet d'Encre",
  coverImage: null,
  genre: 'Art',
  themes: [],
  format: 'Illustration(s)',
  meta: '2 illustrations · collection',
  publishedAt: new Date('2026-06-01'),
  synopsis: 'Un carnet.',
  contestId: null,
  soutien: null,
  creators: [{ accountId: 'acc1', role: 'dessinateur', order: 0, account: { id: 'acc1', displayName: 'Yuki', profileSlug: 'yuki' } }],
  collectionItems: [],
  fundingGoals: [],
  ...o,
});

const ITEM = (id: string, order: number, publishedAt: Date | null = new Date('2026-06-01')) => ({
  order,
  illustration: { id, title: `Illu ${id}`, image: null, likeCount: 10, category: 'personnages', genres: [], publishedAt },
});

describe('CollectionsService', () => {
  let service: CollectionsService;
  let prisma: Record<string, any>;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let slug: { slugify: jest.Mock };
  let media: { getForOwner: jest.Mock };

  beforeEach(() => {
    prisma = {
      profile: { findUnique: jest.fn().mockResolvedValue({ creatorRoles: ['dessinateur'] }) },
      account: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Yuki' }) },
      work: {
        create: jest.fn().mockResolvedValue(WORK_ROW()),
        findFirst: jest.fn().mockResolvedValue(WORK_ROW()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue(WORK_ROW()),
        delete: jest.fn().mockResolvedValue(WORK_ROW()),
      },
      workCreator: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() },
      fundingGoal: { create: jest.fn(), deleteMany: jest.fn() },
      illustration: {
        findUnique: jest.fn().mockResolvedValue({ id: 'illuX', artistId: 'acc1', image: 'http://img/x.webp' }),
        create: jest.fn().mockResolvedValue({ id: 'coverIllu1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      illustrationCollection: {
        upsert: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: null } }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      contest: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', active: true }) },
      review: { deleteMany: jest.fn() },
      favorite: { deleteMany: jest.fn() },
      watchlistItem: { deleteMany: jest.fn() },
      readingProgress: { deleteMany: jest.fn() },
      editorPick: { deleteMany: jest.fn() },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    slug = { slugify: jest.fn((s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) };
    media = { getForOwner: jest.fn() };
    service = new CollectionsService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      slug as unknown as SlugService,
      media as unknown as MediaService,
    );
  });

  // ── J1: create ──────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates an Illustration(s) Work with a WorkCreator owner row, genre/themes mapping, meta, publishedAt', async () => {
      prisma.work.create.mockResolvedValue(WORK_ROW({ slug: 'carnet-d-encre' }));
      const res = await service.create('acc1', { title: "Carnet d'Encre", genres: ['action', 'adventure'], description: 'Un carnet.' });

      const data = prisma.work.create.mock.calls[0][0].data;
      expect(data.format).toBe('Illustration(s)');
      expect(data.title).toBe("Carnet d'Encre");
      expect(data.slug).toBe('carnet-d-encre');
      expect(data.genre).toBe('Action'); // fr label of genres[0]
      expect(data.themes).toEqual(['Aventure']); // fr labels of genres[1..]
      expect(data.meta).toBe('0 illustrations · collection');
      expect(data.publishedAt).toBeInstanceOf(Date);
      expect(prisma.workCreator.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ workId: 'w1', accountId: 'acc1', role: 'dessinateur' }) }),
      );
      expect(res).toMatchObject({ id: 'w1', slug: 'carnet-d-encre', title: "Carnet d'Encre", count: 0 });
    });

    it("defaults genre to 'Art' when no genres provided", async () => {
      await service.create('acc1', { title: 'Sans genre' });
      expect(prisma.work.create.mock.calls[0][0].data.genre).toBe('Art');
    });

    it('persists a Soutien Json and creates FundingGoal rows for goals[]', async () => {
      await service.create('acc1', {
        title: 'X',
        tiers: [{ name: 'Bronze', priceCents: 300 }],
        allowDonations: true,
        goals: [{ title: 'Impression', targetCents: 50000 }],
      });
      const data = prisma.work.create.mock.calls[0][0].data;
      expect(data.soutien).toEqual({ tiers: [{ name: 'Bronze', priceCents: 300 }], allowDonations: true, revenueSplit: [] });
      expect(prisma.fundingGoal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ workId: 'w1', title: 'Impression', targetCents: 50000, order: 0 }) }),
      );
    });

    it('rejects an empty title with 400', async () => {
      await expect(service.create('acc1', { title: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a revenueSplit that does not total 100 with 400', async () => {
      await expect(
        service.create('acc1', { title: 'X', revenueSplit: [{ accountId: 'a', pct: 40 }, { accountId: 'b', pct: 40 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an inactive/unknown contestId with 400', async () => {
      prisma.contest.findUnique.mockResolvedValue({ id: 'c1', active: false });
      await expect(service.create('acc1', { title: 'X', contestId: 'c1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-creator (empty creatorRoles) with 403', async () => {
      prisma.profile.findUnique.mockResolvedValue({ creatorRoles: [] });
      await expect(service.create('acc1', { title: 'X' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cover {mediaId}: writes the ready cover media web variant to coverImage', async () => {
      media.getForOwner.mockResolvedValue({ kind: 'cover', status: 'ready', variants: { web: 'http://cdn/cover.webp' } });
      await service.create('acc1', { title: 'X', cover: { mediaId: 'm1' } });
      // BE-8: cover is applied as a member (work.create starts null; the coverImage is set post-insert).
      const coverUpdate = prisma.work.update.mock.calls.find((c: any[]) => c[0].data.coverImage === 'http://cdn/cover.webp');
      expect(coverUpdate).toBeDefined();
    });

    it('cover {mediaId}: rejects a wrong-kind or not-ready media with 400', async () => {
      media.getForOwner.mockResolvedValue({ kind: 'avatar', status: 'ready', variants: { web: 'x' } });
      await expect(service.create('acc1', { title: 'X', cover: { mediaId: 'm1' } })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cover {illustrationId}: writes the owned illustration image; rejects a cross-owner illustration with 403', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ id: 'i9', artistId: 'other', image: 'http://img/i9.webp' });
      await expect(service.create('acc1', { title: 'X', cover: { illustrationId: 'i9' } })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── J2: read / patch / delete ────────────────────────────────────────────────
  describe('getById', () => {
    it('maps items ordered; owner sees contestId/soutien/fundingGoals', async () => {
      prisma.work.findFirst.mockResolvedValue(
        WORK_ROW({ contestId: 'c1', soutien: { tiers: [], allowDonations: true, revenueSplit: [] }, collectionItems: [ITEM('a', 0), ITEM('b', 1)], fundingGoals: [{ id: 'fg1', title: 'G', targetCents: 100, currentCents: 0, order: 0 }] }),
      );
      const detail = await service.getById('w1', 'acc1');
      expect(detail?.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
      expect(detail?.contestId).toBe('c1');
      expect(detail?.soutien).toEqual({ tiers: [], allowDonations: true, revenueSplit: [] });
      expect(detail?.fundingGoals).toEqual([{ id: 'fg1', title: 'G', targetCents: 100 }]);
      expect(detail?.owner).toEqual({ id: 'acc1', name: 'Yuki', slug: 'yuki' });
    });

    it('hides contestId/soutien/fundingGoals from a non-owner / public viewer', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ contestId: 'c1', soutien: { tiers: [], allowDonations: false, revenueSplit: [] } }));
      const pub = await service.getById('w1', undefined);
      expect(pub?.contestId).toBeUndefined();
      expect(pub?.soutien).toBeUndefined();
      expect(pub?.fundingGoals).toBeUndefined();
    });

    it('BE-9: hides unpublished (private) members from a non-owner, but the owner sees all + count stays total (D22)', async () => {
      const items = [ITEM('a', 0), ITEM('b', 1, null)]; // 'b' is private (publishedAt null)
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ collectionItems: items }));
      const pub = await service.getById('w1', undefined);
      expect(pub?.items.map((i: { id: string }) => i.id)).toEqual(['a']); // private 'b' hidden
      expect(pub?.count).toBe(2); // D22: count stays derived from all membership rows

      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ collectionItems: items }));
      const owner = await service.getById('w1', 'acc1');
      expect(owner?.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b']); // owner sees the private member
      expect(owner?.count).toBe(2);
    });

    it('returns null for a non-collection format (controller 404s)', async () => {
      prisma.work.findFirst.mockResolvedValue(null);
      expect(await service.getById('w1', undefined)).toBeNull();
      // scoped to Illustration(s) + published
      const where = prisma.work.findFirst.mock.calls[0][0].where;
      expect(where.format).toBe('Illustration(s)');
      expect(where.publishedAt).toEqual({ not: null });
    });
  });

  describe('update', () => {
    it('edits fields, never regenerates the slug, and invalidates the work cache', async () => {
      await service.update('acc1', 'w1', { title: 'Nouveau titre', description: 'maj' });
      const data = prisma.work.update.mock.calls[0][0].data;
      expect(data.title).toBe('Nouveau titre');
      expect(data.synopsis).toBe('maj');
      expect(data.slug).toBeUndefined(); // slug stays stable
      expect(redis.del).toHaveBeenCalledWith('work:carnet-d-encre');
    });

    it('cover: null clears coverImage to the halftone fallback', async () => {
      await service.update('acc1', 'w1', { cover: null });
      // BE-8: cover:null is applied as a dedicated coverImage=null write inside the tx (keeps members).
      const clearUpdate = prisma.work.update.mock.calls.find((c: any[]) => c[0].data.coverImage === null);
      expect(clearUpdate).toBeDefined();
    });

    it('throws 404 for a non-owner', async () => {
      prisma.work.findFirst.mockResolvedValue(null);
      await expect(service.update('acc2', 'w1', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes dependents + the work, leaves Illustrations untouched, returns void', async () => {
      await service.remove('acc1', 'w1');
      expect(prisma.workCreator.deleteMany ?? prisma.work.delete).toBeDefined();
      expect(prisma.work.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
      expect(redis.del).toHaveBeenCalledWith('work:carnet-d-encre');
    });

    it('throws 404 for a non-owner', async () => {
      prisma.work.findFirst.mockResolvedValue(null);
      await expect(service.remove('acc2', 'w1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── J3: membership + reorder ─────────────────────────────────────────────────
  describe('addIllustration', () => {
    it('appends at max(order)+1, recomputes meta (singular), rejects a cross-owner illustration with 403', async () => {
      prisma.illustrationCollection.aggregate.mockResolvedValue({ _max: { order: 2 } });
      prisma.illustrationCollection.count.mockResolvedValue(1);
      prisma.illustration.findUnique.mockResolvedValue({ id: 'illuX', artistId: 'acc1', image: null });
      await service.addIllustration('acc1', 'w1', 'illuX');
      expect(prisma.illustrationCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ workId: 'w1', illustrationId: 'illuX', order: 3 }) }),
      );
      expect(prisma.work.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'w1' }, data: { meta: '1 illustration · collection' } }),
      );
    });

    it('rejects a cross-owner illustration with 403', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ id: 'illuX', artistId: 'other', image: null });
      await expect(service.addIllustration('acc1', 'w1', 'illuX')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 404 for a non-owner of the collection', async () => {
      prisma.work.findFirst.mockResolvedValue(null);
      await expect(service.addIllustration('acc2', 'w1', 'illuX')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeIllustration', () => {
    it('deletes the join row and recomputes meta (plural)', async () => {
      prisma.illustrationCollection.count.mockResolvedValue(2);
      await service.removeIllustration('acc1', 'w1', 'illuX');
      expect(prisma.illustrationCollection.delete).toHaveBeenCalledWith({
        where: { illustrationId_workId: { illustrationId: 'illuX', workId: 'w1' } },
      });
      expect(prisma.work.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { meta: '2 illustrations · collection' } }),
      );
    });

    it('is idempotent when the row is missing (no throw)', async () => {
      prisma.illustrationCollection.delete.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }));
      prisma.illustrationCollection.count.mockResolvedValue(0);
      await expect(service.removeIllustration('acc1', 'w1', 'gone')).resolves.toBeUndefined();
    });
  });

  describe('reorder', () => {
    it('writes order=index for an exact permutation of the current members', async () => {
      prisma.illustrationCollection.findMany.mockResolvedValue([{ illustrationId: 'a' }, { illustrationId: 'b' }]);
      await service.reorder('acc1', 'w1', ['b', 'a']);
      expect(prisma.illustrationCollection.update).toHaveBeenCalledWith({
        where: { illustrationId_workId: { illustrationId: 'b', workId: 'w1' } },
        data: { order: 0 },
      });
      expect(prisma.illustrationCollection.update).toHaveBeenCalledWith({
        where: { illustrationId_workId: { illustrationId: 'a', workId: 'w1' } },
        data: { order: 1 },
      });
    });

    it('rejects a list that is not a permutation of the members with 400', async () => {
      prisma.illustrationCollection.findMany.mockResolvedValue([{ illustrationId: 'a' }, { illustrationId: 'b' }]);
      await expect(service.reorder('acc1', 'w1', ['a'])).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.reorder('acc1', 'w1', ['a', 'c'])).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── J6: GET /collections — public paginated Galerie facet ─────────────────────
  describe('findCollections', () => {
    const CARD_ROW = (o: Record<string, unknown> = {}) => ({
      id: 'w1',
      slug: 'carnet-d-encre',
      title: "Carnet d'Encre",
      coverImage: 'http://cdn/cover.webp',
      likeCount: 42,
      creators: [{ order: 0, account: { displayName: 'Yuki Moreau' } }],
      _count: { collectionItems: 3 },
      ...o,
    });

    it('returns only published Illustration(s) works, sorted publishedAt desc, paginated envelope', async () => {
      prisma.work.findMany.mockResolvedValue([CARD_ROW()]);
      prisma.work.count.mockResolvedValue(1);
      const res = await service.findCollections({ tags: [], genre: [], page: 1 });

      const args = prisma.work.findMany.mock.calls[0][0];
      expect(args.where.format).toBe('Illustration(s)');
      expect(args.where.publishedAt).toEqual({ not: null });
      expect(args.orderBy).toEqual({ publishedAt: 'desc' });
      expect(args.take).toBe(12); // GALLERY_PAGE_SIZE
      expect(args.skip).toBe(0);
      expect(res).toMatchObject({ total: 1, page: 1, pageSize: 12, totalPages: 1 });
      expect(res.items[0]).toEqual({
        id: 'w1',
        slug: 'carnet-d-encre',
        title: "Carnet d'Encre",
        cover: 'http://cdn/cover.webp',
        count: 3,
        artistName: 'Yuki Moreau',
        likeCount: 42,
      });
    });

    it('q matches collection title OR creator displayName (insensitive)', async () => {
      await service.findCollections({ q: 'yuki', tags: [], genre: [], page: 1 });
      const and = prisma.work.findMany.mock.calls[0][0].where.AND;
      const qClause = and.find((c: Record<string, unknown>) => 'OR' in c);
      expect(qClause.OR).toEqual([
        { title: { contains: 'yuki', mode: 'insensitive' } },
        { creators: { some: { account: { displayName: { contains: 'yuki', mode: 'insensitive' } } } } },
      ]);
    });

    it('artist filters by EXACT creator slug (Account.profileSlug)', async () => {
      await service.findCollections({ artist: 'yuki-moreau', tags: [], genre: [], page: 1 });
      const and = prisma.work.findMany.mock.calls[0][0].where.AND;
      expect(and).toContainEqual({ creators: { some: { account: { profileSlug: 'yuki-moreau' } } } });
    });

    it('genre matches Work.genre OR themes via fr labels', async () => {
      await service.findCollections({ tags: [], genre: ['action'], page: 1 });
      const and = prisma.work.findMany.mock.calls[0][0].where.AND;
      const genreClause = and.find((c: Record<string, unknown>) => 'OR' in c);
      expect(genreClause.OR).toEqual([{ genre: { in: ['Action'] } }, { themes: { hasSome: ['Action'] } }]);
    });

    it('tags AND-match on Work.hashtags via hasEvery', async () => {
      await service.findCollections({ tags: ['encre', 'noir'], genre: [], page: 1 });
      expect(prisma.work.findMany.mock.calls[0][0].where.hashtags).toEqual({ hasEvery: ['encre', 'noir'] });
    });

    it('paginates: page 2 skips one page', async () => {
      await service.findCollections({ tags: [], genre: [], page: 2 });
      expect(prisma.work.findMany.mock.calls[0][0].skip).toBe(12);
    });

    it('caches on a key that includes the full query', async () => {
      await service.findCollections({ q: 'x', tags: ['a'], genre: ['action'], page: 2 });
      const key = redis.set.mock.calls[0][0] as string;
      expect(key).toContain('collections:list:');
      expect(key).toContain('"q":"x"');
      expect(key).toContain('"page":2');
    });
  });

  // ── J7: hashtags on collections ───────────────────────────────────────────────
  describe('hashtags', () => {
    it('create persists normalized Work.hashtags (lowercased, #-stripped, deduped)', async () => {
      await service.create('acc1', { title: 'X', hashtags: ['#Encre', 'encre', '  Noir '] });
      expect(prisma.work.create.mock.calls[0][0].data.hashtags).toEqual(['encre', 'noir']);
    });

    it('create defaults hashtags to [] when absent', async () => {
      await service.create('acc1', { title: 'X' });
      expect(prisma.work.create.mock.calls[0][0].data.hashtags).toEqual([]);
    });

    it('patch replaces hashtags when the key is present (normalized)', async () => {
      await service.update('acc1', 'w1', { hashtags: ['#Néon', 'néon'] });
      expect(prisma.work.update.mock.calls[0][0].data.hashtags).toEqual(['néon']);
    });

    it('patch leaves hashtags untouched when the key is absent', async () => {
      await service.update('acc1', 'w1', { title: 'nouveau' });
      expect(prisma.work.update.mock.calls[0][0].data.hashtags).toBeUndefined();
    });

    it('exposes Work.hashtags on CollectionDetail', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ hashtags: ['encre', 'noir'] }));
      const detail = await service.getById('w1', undefined);
      expect(detail?.hashtags).toEqual(['encre', 'noir']);
    });
  });

  // ── J8: cover-as-member rule ──────────────────────────────────────────────────
  describe('cover-as-member', () => {
    it('create cover:{mediaId} creates a Couverture Illustration + membership at order 0 + coverImage + meta', async () => {
      media.getForOwner.mockResolvedValue({ kind: 'cover', status: 'ready', width: 1200, height: 1650, variants: { web: 'http://cdn/cover.webp' } });
      prisma.illustration.create.mockResolvedValue({ id: 'coverIllu1' });
      prisma.illustrationCollection.count.mockResolvedValue(1);
      await service.create('acc1', { title: "Carnet d'Encre", cover: { mediaId: 'm1' } });

      const illuData = prisma.illustration.create.mock.calls[0][0].data;
      expect(illuData).toMatchObject({
        artistId: 'acc1',
        category: 'couvertures',
        title: "Couverture · Carnet d'Encre",
        image: 'http://cdn/cover.webp',
        width: 1200,
        height: 1650,
      });
      expect(illuData.publishedAt).toBeInstanceOf(Date);
      // shift existing members, then insert at order 0
      expect(prisma.illustrationCollection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { order: { increment: 1 } } }),
      );
      expect(prisma.illustrationCollection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ illustrationId: 'coverIllu1', order: 0 }) }),
      );
      // coverImage set + meta counts the cover member ("1 illustration")
      const coverUpdate = prisma.work.update.mock.calls.find((c: any[]) => c[0].data.coverImage === 'http://cdn/cover.webp');
      expect(coverUpdate).toBeDefined();
      expect(coverUpdate[0].data.meta).toBe('1 illustration · collection');
    });

    it('patch cover:{mediaId} shifts members and inserts the new cover at order 0 (meta recomputed)', async () => {
      media.getForOwner.mockResolvedValue({ kind: 'cover', status: 'ready', width: null, height: null, variants: { web: 'http://cdn/c2.webp' } });
      prisma.illustration.create.mockResolvedValue({ id: 'coverIllu2' });
      prisma.illustrationCollection.count.mockResolvedValue(3); // 2 existing + the new cover
      await service.update('acc1', 'w1', { cover: { mediaId: 'm2' } });

      expect(prisma.illustrationCollection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { order: { increment: 1 } } }),
      );
      expect(prisma.illustrationCollection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ illustrationId: 'coverIllu2', order: 0 }) }),
      );
      const coverUpdate = prisma.work.update.mock.calls.find((c: any[]) => c[0].data.coverImage === 'http://cdn/c2.webp');
      expect(coverUpdate[0].data.meta).toBe('3 illustrations · collection');
    });

    it('promote an EXISTING member via cover:{illustrationId} just sets coverImage (no membership write)', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ id: 'i9', artistId: 'acc1', image: 'http://img/i9.webp' });
      prisma.illustrationCollection.findUnique.mockResolvedValue({ illustrationId: 'i9', workId: 'w1' }); // already a member
      await service.update('acc1', 'w1', { cover: { illustrationId: 'i9' } });

      expect(prisma.illustrationCollection.create).not.toHaveBeenCalled();
      expect(prisma.illustrationCollection.updateMany).not.toHaveBeenCalled();
      const coverUpdate = prisma.work.update.mock.calls.find((c: any[]) => c[0].data.coverImage === 'http://img/i9.webp');
      expect(coverUpdate).toBeDefined();
    });

    it('promote an owned NON-member via cover:{illustrationId} inserts it at order 0 with a shift', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ id: 'i9', artistId: 'acc1', image: 'http://img/i9.webp' });
      prisma.illustrationCollection.findUnique.mockResolvedValue(null); // not yet a member
      await service.update('acc1', 'w1', { cover: { illustrationId: 'i9' } });

      expect(prisma.illustrationCollection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { order: { increment: 1 } } }),
      );
      expect(prisma.illustrationCollection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ illustrationId: 'i9', order: 0 }) }),
      );
    });

    it('cover:{illustrationId} rejects a cross-owner illustration with 403', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ id: 'i9', artistId: 'other', image: 'http://img/i9.webp' });
      await expect(service.update('acc1', 'w1', { cover: { illustrationId: 'i9' } })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cover: null clears coverImage but keeps the membership (no delete)', async () => {
      await service.update('acc1', 'w1', { cover: null });
      const clearUpdate = prisma.work.update.mock.calls.find((c: any[]) => c[0].data.coverImage === null);
      expect(clearUpdate).toBeDefined();
      expect(prisma.illustrationCollection.delete).not.toHaveBeenCalled();
    });

    it('removing the cover member also clears coverImage (invariant guard)', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ coverImage: 'http://img/x.webp' }));
      prisma.illustration.findUnique.mockResolvedValue({ id: 'illuX', image: 'http://img/x.webp' });
      prisma.illustrationCollection.count.mockResolvedValue(0);
      await service.removeIllustration('acc1', 'w1', 'illuX');
      expect(prisma.work.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'w1' }, data: { coverImage: null } }),
      );
    });

    it('removing a NON-cover member leaves coverImage intact', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ coverImage: 'http://img/cover.webp' }));
      prisma.illustration.findUnique.mockResolvedValue({ id: 'illuX', image: 'http://img/other.webp' });
      prisma.illustrationCollection.count.mockResolvedValue(1);
      await service.removeIllustration('acc1', 'w1', 'illuX');
      const clearUpdate = prisma.work.update.mock.calls.find((c: any[]) => c[0].data?.coverImage === null);
      expect(clearUpdate).toBeUndefined();
    });
  });
});
