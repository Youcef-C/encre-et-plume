import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { GalleryQuery } from '@encre-et-plume/shared';
import { GALLERY_PAGE_SIZE } from '@encre-et-plume/shared';
import { GalleryService } from './gallery.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CollectionsService } from '../collections/collections.service';
import { MediaService } from '../media/media.service';

const ILLUSTRATION_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'i1',
  title: 'Pluie de Néons',
  artistId: null,
  artist: null,
  artistName: 'Yuki Moreau',
  category: 'couvertures',
  genres: [],
  description: null,
  hashtags: [],
  image: null,
  width: null,
  height: null,
  tools: null,
  license: null,
  likeCount: 12400,
  weeklyLikeDelta: 900,
  publishedAt: new Date('2026-06-01'),
  createdAt: new Date('2026-06-01'),
  ...overrides,
});

const EMPTY_QUERY: GalleryQuery = { q: undefined, tags: [], genre: [], category: undefined, tri: 'tendance', page: 1 };

describe('GalleryService', () => {
  let service: GalleryService;
  let prisma: {
    illustration: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    illustrationCollection: { findMany: jest.Mock };
    account: { findUnique: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock; delByPattern: jest.Mock };
  let collections: { assertCreator: jest.Mock; assertOwnsCollections: jest.Mock; appendMembership: jest.Mock };
  let media: { getForOwner: jest.Mock };

  beforeEach(() => {
    prisma = {
      illustration: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ artistId: 'acc1' }),
        create: jest.fn().mockResolvedValue({ id: 'newIllu1' }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      illustrationCollection: { findMany: jest.fn().mockResolvedValue([]) },
      account: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Yuki Moreau' }) },
    };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined), delByPattern: jest.fn().mockResolvedValue(undefined) };
    collections = {
      assertCreator: jest.fn().mockResolvedValue(undefined),
      assertOwnsCollections: jest.fn().mockResolvedValue(undefined),
      appendMembership: jest.fn().mockResolvedValue(undefined),
    };
    media = { getForOwner: jest.fn() };
    service = new GalleryService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      collections as unknown as CollectionsService,
      media as unknown as MediaService,
    );
  });

  it('only returns published illustrations (publishedAt not null), no category clause for "Tout"', async () => {
    await service.findIllustrations(EMPTY_QUERY);

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.category).toBeUndefined();
  });

  it('category facet: filters by exact category key when provided', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, category: 'personnages' });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.category).toBe('personnages');
  });

  it('tri=tendance -> orderBy weeklyLikeDelta desc, id asc', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, tri: 'tendance' });
    expect(prisma.illustration.findMany.mock.calls[0][0].orderBy).toEqual([{ weeklyLikeDelta: 'desc' }, { id: 'asc' }]);
  });

  it('tri=nouveautes -> orderBy publishedAt desc, id asc', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, tri: 'nouveautes' });
    expect(prisma.illustration.findMany.mock.calls[0][0].orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'asc' }]);
  });

  it('tri=populaires -> orderBy likeCount desc, id asc', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, tri: 'populaires' });
    expect(prisma.illustration.findMany.mock.calls[0][0].orderBy).toEqual([{ likeCount: 'desc' }, { id: 'asc' }]);
  });

  it('q facet: OR-group on title/artistName, case-insensitive contains', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, q: 'onibi' });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { title: { contains: 'onibi', mode: 'insensitive' } },
      { artistName: { contains: 'onibi', mode: 'insensitive' } },
    ]);
  });

  it('genre facet: single id maps to its fr label, matched via genres hasSome', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, genre: ['supernatural'] });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.genres).toEqual({ hasSome: ['Fantastique'] });
  });

  it('genre facet: multiple ids OR-within (both mapped to fr labels in one hasSome)', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, genre: ['action', 'supernatural'] });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.genres).toEqual({ hasSome: ['Action', 'Fantastique'] });
  });

  it('genre facet: no clause when empty (no filter)', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, genre: [] });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.genres).toBeUndefined();
  });

  it('F-22 tag facet: exact hashtag tokens AND-matched via `hasEvery` (no partial/contains)', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, tags: ['yokai', 'encre'] });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.hashtags).toEqual({ hasEvery: ['yokai', 'encre'] });
  });

  it('F-22 tag facet: no clause when absent (regression — empty tags)', async () => {
    await service.findIllustrations(EMPTY_QUERY);

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.hashtags).toBeUndefined();
  });

  it('F-22 tag facet: composes (AND) with genre and q', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, tags: ['yokai'], genre: ['supernatural'], q: 'onibi' });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.hashtags).toEqual({ hasEvery: ['yokai'] });
    expect(where.genres).toEqual({ hasSome: ['Fantastique'] });
    expect(where.OR).toEqual([
      { title: { contains: 'onibi', mode: 'insensitive' } },
      { artistName: { contains: 'onibi', mode: 'insensitive' } },
    ]);
  });

  it('combines category + genre + q with AND (each a distinct where key)', async () => {
    await service.findIllustrations({ ...EMPTY_QUERY, category: 'personnages', genre: ['supernatural'], q: 'onibi' });

    const where = prisma.illustration.findMany.mock.calls[0][0].where;
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.category).toBe('personnages');
    expect(where.genres).toEqual({ hasSome: ['Fantastique'] });
    expect(where.OR).toEqual([
      { title: { contains: 'onibi', mode: 'insensitive' } },
      { artistName: { contains: 'onibi', mode: 'insensitive' } },
    ]);
  });

  it('paginates: skip/take from page, and counts total with the same where', async () => {
    prisma.illustration.count.mockResolvedValue(25);

    await service.findIllustrations({ ...EMPTY_QUERY, page: 3, category: 'process' });

    const findManyArgs = prisma.illustration.findMany.mock.calls[0][0];
    expect(findManyArgs.skip).toBe((3 - 1) * GALLERY_PAGE_SIZE);
    expect(findManyArgs.take).toBe(GALLERY_PAGE_SIZE);

    const countArgs = prisma.illustration.count.mock.calls[0][0];
    expect(countArgs.where).toEqual(findManyArgs.where);
  });

  it('returns total/page/pageSize/totalPages from the count', async () => {
    prisma.illustration.count.mockResolvedValue(25);

    const result = await service.findIllustrations({ ...EMPTY_QUERY, page: 2 });

    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(GALLERY_PAGE_SIZE);
    expect(result.totalPages).toBe(Math.ceil(25 / GALLERY_PAGE_SIZE));
  });

  it('maps rows to GalleryIllustrationCard, resolving artistSlug from the artist relation when present', async () => {
    prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW({ artist: { profileSlug: 'yuki-moreau' } })]);
    prisma.illustration.count.mockResolvedValue(1);

    const result = await service.findIllustrations(EMPTY_QUERY);

    expect(result.items).toEqual([
      {
        id: 'i1',
        title: 'Pluie de Néons',
        artistName: 'Yuki Moreau',
        artistSlug: 'yuki-moreau',
        category: 'couvertures',
        categoryLabel: 'Couvertures',
        likeCount: 12400,
        thumbnail: null,
        is18plus: false,
      },
    ]);
  });

  it('DR-10: maps is18plus true when genres include a plus18 vocabulary entry (e.g. Érotique)', async () => {
    prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW({ genres: ['Érotique'] })]);
    prisma.illustration.count.mockResolvedValue(1);

    const result = await service.findIllustrations(EMPTY_QUERY);

    expect(result.items[0]?.is18plus).toBe(true);
  });

  it('DR-10: is18plus false when genres include only mature-but-not-plus18 entries (e.g. Gore)', async () => {
    prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW({ genres: ['Gore'] })]);
    prisma.illustration.count.mockResolvedValue(1);

    const result = await service.findIllustrations(EMPTY_QUERY);

    expect(result.items[0]?.is18plus).toBe(false);
  });

  it('maps artistSlug to null when there is no linked artist account', async () => {
    prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW({ artist: null })]);
    prisma.illustration.count.mockResolvedValue(1);

    const result = await service.findIllustrations(EMPTY_QUERY);

    expect(result.items[0]?.artistSlug).toBeNull();
  });

  it('getSummary: counts published illustrations and distinct artist names', async () => {
    prisma.illustration.count.mockResolvedValue(14);
    prisma.illustration.findMany.mockResolvedValue([{ artistName: 'Yuki Moreau' }, { artistName: 'Inès Khelifi' }]);

    const summary = await service.getSummary();

    expect(summary).toEqual({ illustrationCount: 14, artistCount: 2 });
    expect(prisma.illustration.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { publishedAt: { not: null } }, distinct: ['artistName'] }),
    );
  });

  it('getTrending: top-2 published illustrations ordered by weeklyLikeDelta desc, with rank', async () => {
    prisma.illustration.findMany.mockResolvedValue([
      ILLUSTRATION_ROW({ id: 'i1', weeklyLikeDelta: 900 }),
      ILLUSTRATION_ROW({ id: 'i2', weeklyLikeDelta: 700 }),
    ]);

    const result = await service.getTrending();

    const args = prisma.illustration.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ publishedAt: { not: null } });
    expect(args.orderBy).toEqual([{ weeklyLikeDelta: 'desc' }, { id: 'asc' }]);
    expect(args.take).toBe(2);
    expect(result.map((c) => c.rank)).toEqual([1, 2]);
  });

  it('getPreview: returns the preview payload for a published illustration', async () => {
    prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ artist: { profileSlug: 'yuki-moreau' } }));

    const result = await service.getPreview('i1');

    expect(result).toEqual({
      id: 'i1',
      title: 'Pluie de Néons',
      artistName: 'Yuki Moreau',
      artistSlug: 'yuki-moreau',
      category: 'couvertures',
      categoryLabel: 'Couvertures',
      likeCount: 12400,
      image: null,
      is18plus: false,
    });
  });

  it('getPreview: throws NotFoundException for an unknown or unpublished id', async () => {
    prisma.illustration.findFirst.mockResolvedValue(null);

    await expect(service.getPreview('nope')).rejects.toThrow(NotFoundException);
  });

  describe('getIllustration (DR-6 detail)', () => {
    it('linked artist: maps full artist block (name, slug, role label, city, avatar)', async () => {
      prisma.illustration.findFirst.mockResolvedValue(
        ILLUSTRATION_ROW({
          artistId: 'acc1',
          artist: {
            id: 'acc1',
            profileSlug: 'dr1-yuki-moreau',
            avatar: 'https://cdn.test/avatar.png',
            profile: { creatorRoles: ['dessinateur'], city: 'Lyon' },
          },
          description: 'Encrage traditionnel rehaussé de trames numériques.',
          hashtags: ['encre', 'noir', 'néon', 'pluie'],
          width: 2480,
          height: 3508,
          tools: 'Encre · CSP',
          license: '© Tous droits réservés',
        }),
      );

      const result = await service.getIllustration('i1');

      expect(result?.artist).toEqual({
        id: 'acc1',
        name: 'Yuki Moreau',
        slug: 'dr1-yuki-moreau',
        role: 'Dessinateur·rice',
        city: 'Lyon',
        avatar: 'https://cdn.test/avatar.png',
      });
      expect(result?.dimensionsLabel).toBe('2480 × 3508');
      expect(result?.tools).toBe('Encre · CSP');
      expect(result?.license).toBe('© Tous droits réservés');
      expect(result?.description).toBe('Encrage traditionnel rehaussé de trames numériques.');
      expect(result?.hashtags).toEqual(['encre', 'noir', 'néon', 'pluie']);
    });

    it('F-22: returns the F-20 genre fr labels on the detail response', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ genres: ['Yōkai', 'Fantastique'] }));

      const result = await service.getIllustration('i1');

      expect(result?.genres).toEqual(['Yōkai', 'Fantastique']);
    });

    it('F-22: genres defaults to an empty array when the illustration has none', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ genres: [] }));

      const result = await service.getIllustration('i1');

      expect(result?.genres).toEqual([]);
    });

    it('maps the scenariste role to its French label "Scénariste"', async () => {
      prisma.illustration.findFirst.mockResolvedValue(
        ILLUSTRATION_ROW({
          artistId: 'acc2',
          artist: { id: 'acc2', profileSlug: 'dr1-camille-roux', avatar: null, profile: { creatorRoles: ['scenariste'], city: null } },
        }),
      );

      const result = await service.getIllustration('i1');

      expect(result?.artist.role).toBe('Scénariste');
    });

    it('unlinked artist: name-only defaults (no id/slug/city/avatar, default role label)', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ artistId: null, artist: null }));

      const result = await service.getIllustration('i1');

      expect(result?.artist).toEqual({
        id: null,
        name: 'Yuki Moreau',
        slug: null,
        role: 'Dessinateur·rice',
        city: null,
        avatar: null,
      });
    });

    it('dimensionsLabel is null when width or height is missing', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ width: null, height: 3508 }));

      const result = await service.getIllustration('i1');

      expect(result?.dimensionsLabel).toBeNull();
    });

    it('license defaults to the standard copyright string when the column is null', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ license: null }));

      const result = await service.getIllustration('i1');

      expect(result?.license).toBe('© Tous droits réservés');
    });

    it('maps categoryLabel and publishedAt as an ISO string', async () => {
      prisma.illustration.findFirst.mockResolvedValue(
        ILLUSTRATION_ROW({ category: 'couvertures', publishedAt: new Date('2026-06-01T00:00:00.000Z') }),
      );

      const result = await service.getIllustration('i1');

      expect(result?.categoryLabel).toBe('Couvertures');
      expect(result?.publishedAt).toBe('2026-06-01T00:00:00.000Z');
    });

    it('fetches by id only (BE-9: the publishedAt filter moved to a viewer-aware check)', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW());

      await service.getIllustration('i1');

      const args = prisma.illustration.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'i1' });
    });

    it('returns null for an unknown id', async () => {
      prisma.illustration.findFirst.mockResolvedValue(null);

      const result = await service.getIllustration('nope');

      expect(result).toBeNull();
    });

    // BE-9 (J9): visibility hiding — a private piece (publishedAt null) is owner-only.
    it('returns null for a private piece viewed by a non-owner or anonymous', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ publishedAt: null, artistId: 'acc1' }));

      expect(await service.getIllustration('i1', 'someone-else')).toBeNull();
      expect(await service.getIllustration('i1')).toBeNull();
    });

    it('returns the detail for a private piece viewed by its owner', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ publishedAt: null, artistId: 'acc1' }));

      const result = await service.getIllustration('i1', 'acc1');

      expect(result?.id).toBe('i1');
    });

    it('DR-10: is18plus true when genres include a plus18 vocabulary entry', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ genres: ['Hentai'] }));

      const result = await service.getIllustration('i1');

      expect(result?.is18plus).toBe(true);
    });

    it('DR-10: is18plus false when genres are empty or mature-only', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ genres: ['Gore'] }));

      const result = await service.getIllustration('i1');

      expect(result?.is18plus).toBe(false);
    });
  });

  describe('getMoreByArtist (DR-6 "Plus de cet·te artiste")', () => {
    it('groups by the source artistName, excludes the current id, only published, capped at 6, ordered by likeCount desc/id asc', async () => {
      prisma.illustration.findFirst.mockResolvedValue({ artistName: 'Yuki Moreau' });
      prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW({ id: 'i2' }), ILLUSTRATION_ROW({ id: 'i3' })]);

      const result = await service.getMoreByArtist('i1');

      expect(prisma.illustration.findFirst.mock.calls[0][0]).toEqual({
        where: { id: 'i1', publishedAt: { not: null } },
        select: { artistName: true },
      });
      const args = prisma.illustration.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ artistName: 'Yuki Moreau', publishedAt: { not: null }, id: { not: 'i1' } });
      expect(args.orderBy).toEqual([{ likeCount: 'desc' }, { id: 'asc' }]);
      expect(args.take).toBe(6);
      expect(result.map((c) => c.id)).toEqual(['i2', 'i3']);
    });

    it('returns [] without querying findMany when the source id is unknown/unpublished', async () => {
      prisma.illustration.findFirst.mockResolvedValue(null);

      const result = await service.getMoreByArtist('nope');

      expect(result).toEqual([]);
      expect(prisma.illustration.findMany).not.toHaveBeenCalled();
    });
  });

  // ── DR-12 ───────────────────────────────────────────────────────────────────
  describe('collection filter', () => {
    it('filters the list to a collection via collections.some.workId', async () => {
      await service.findIllustrations({ ...EMPTY_QUERY, collection: 'w42' });
      const where = prisma.illustration.findMany.mock.calls[0][0].where;
      expect(where.collections).toEqual({ some: { workId: 'w42' } });
    });

    it('no collection clause when the facet is absent', async () => {
      await service.findIllustrations(EMPTY_QUERY);
      expect(prisma.illustration.findMany.mock.calls[0][0].where.collections).toBeUndefined();
    });
  });

  describe('getIllustration collections (DR-12)', () => {
    it('maps membership rows to CollectionRef chips', async () => {
      prisma.illustration.findFirst.mockResolvedValue(
        ILLUSTRATION_ROW({ collections: [{ work: { id: 'w1', slug: 'carnet-d-encre', title: "Carnet d'Encre", coverImage: null } }] }),
      );
      const result = await service.getIllustration('i1');
      expect(result?.collections).toEqual([{ id: 'w1', slug: 'carnet-d-encre', title: "Carnet d'Encre", cover: null }]);
    });

    it('defaults collections to an empty array', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW());
      const result = await service.getIllustration('i1');
      expect(result?.collections).toEqual([]);
    });
  });

  describe('publishIllustration (DR-12 / BE-4)', () => {
    const REQ = { title: 'Ma pièce', category: 'personnages' as const };

    it('creates a published Illustration owned by the caller with fr genre labels', async () => {
      await service.publishIllustration('acc1', { ...REQ, genres: ['action'], description: 'desc' });
      expect(collections.assertCreator).toHaveBeenCalledWith('acc1');
      const data = prisma.illustration.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ title: 'Ma pièce', artistId: 'acc1', artistName: 'Yuki Moreau', category: 'personnages', genres: ['Action'], description: 'desc' });
      expect(data.publishedAt).toBeInstanceOf(Date);
    });

    it('resolves a ready illustration media into image + dimensions', async () => {
      media.getForOwner.mockResolvedValue({ kind: 'illustration', status: 'ready', width: 2000, height: 3000, variants: { web: 'http://cdn/x.webp' } });
      await service.publishIllustration('acc1', { ...REQ, mediaId: 'm1' });
      const data = prisma.illustration.create.mock.calls[0][0].data;
      expect(data.image).toBe('http://cdn/x.webp');
      expect(data.width).toBe(2000);
      expect(data.height).toBe(3000);
    });

    it('assigns owned collections at publish (membership rows appended)', async () => {
      await service.publishIllustration('acc1', { ...REQ, collectionIds: ['w1', 'w2'] });
      expect(collections.assertOwnsCollections).toHaveBeenCalledWith('acc1', ['w1', 'w2']);
      expect(collections.appendMembership).toHaveBeenCalledWith('w1', 'newIllu1');
      expect(collections.appendMembership).toHaveBeenCalledWith('w2', 'newIllu1');
    });

    it('propagates 403 when a collectionId is not owned (never silently dropped)', async () => {
      collections.assertOwnsCollections.mockRejectedValue(new ForbiddenException());
      await expect(service.publishIllustration('acc1', { ...REQ, collectionIds: ['x'] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.illustration.create).not.toHaveBeenCalled();
    });

    it('rejects an empty title / bad category with 400', async () => {
      await expect(service.publishIllustration('acc1', { ...REQ, title: '  ' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.publishIllustration('acc1', { ...REQ, category: 'nope' as never })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates the non-creator 403 from assertCreator', async () => {
      collections.assertCreator.mockRejectedValue(new ForbiddenException());
      await expect(service.publishIllustration('acc1', REQ)).rejects.toBeInstanceOf(ForbiddenException);
    });

    // BE-7 (J7): hashtags on publish.
    it('persists normalized Illustration.hashtags (lowercased, #-stripped, deduped)', async () => {
      await service.publishIllustration('acc1', { ...REQ, hashtags: ['#Encre', 'encre', '  Noir '] });
      expect(prisma.illustration.create.mock.calls[0][0].data.hashtags).toEqual(['encre', 'noir']);
    });

    it('defaults hashtags to [] when absent', async () => {
      await service.publishIllustration('acc1', REQ);
      expect(prisma.illustration.create.mock.calls[0][0].data.hashtags).toEqual([]);
    });
  });

  // BE-9 (J9): PATCH /illustrations/:id — owner-only partial edit of the illustration itself.
  describe('deleteIllustration (2026-07-09)', () => {
    it('owner: deletes the illustration', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ artistId: 'acc1' });
      prisma.illustrationCollection.findMany.mockResolvedValue([{ work: { slug: 'carnet' } }]);
      await service.deleteIllustration('acc1', 'i1');
      expect(prisma.illustration.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });

    it('non-owner: uniform 404 and no delete', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ artistId: 'other' });
      await expect(service.deleteIllustration('acc1', 'i1')).rejects.toThrow('Illustration introuvable');
      expect(prisma.illustration.delete).not.toHaveBeenCalled();
    });

    it('missing: uniform 404', async () => {
      prisma.illustration.findUnique.mockResolvedValue(null);
      await expect(service.deleteIllustration('acc1', 'i1')).rejects.toThrow('Illustration introuvable');
    });
  });

  describe('updateIllustration (DR-6/DR-12 · BE-9)', () => {
    beforeEach(() => {
      prisma.illustration.findUnique.mockResolvedValue({ artistId: 'acc1', publishedAt: new Date('2026-06-01') });
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW({ artistId: 'acc1' }));
    });

    it('title: trims and patches only the title', async () => {
      await service.updateIllustration('acc1', 'i1', { title: '  Nouveau  ' });
      expect(prisma.illustration.update.mock.calls[0][0].data).toEqual({ title: 'Nouveau' });
    });

    it('title: empty after trim -> 400 "Un titre est requis" (no update)', async () => {
      await expect(service.updateIllustration('acc1', 'i1', { title: '   ' })).rejects.toThrow('Un titre est requis');
      expect(prisma.illustration.update).not.toHaveBeenCalled();
    });

    it('category: valid key patches it', async () => {
      await service.updateIllustration('acc1', 'i1', { category: 'personnages' });
      expect(prisma.illustration.update.mock.calls[0][0].data).toEqual({ category: 'personnages' });
    });

    it('category: unknown key -> 400 "Catégorie invalide"', async () => {
      await expect(service.updateIllustration('acc1', 'i1', { category: 'nope' as never })).rejects.toThrow('Catégorie invalide');
    });

    it('description/tools/license: empty or whitespace stored as null', async () => {
      await service.updateIllustration('acc1', 'i1', { description: '', tools: '  ', license: '' });
      expect(prisma.illustration.update.mock.calls[0][0].data).toEqual({ description: null, tools: null, license: null });
    });

    it('description/tools/license: trimmed non-empty stored as-is', async () => {
      await service.updateIllustration('acc1', 'i1', { description: ' d ', tools: 'Encre', license: 'CC BY' });
      expect(prisma.illustration.update.mock.calls[0][0].data).toEqual({ description: 'd', tools: 'Encre', license: 'CC BY' });
    });

    it('hashtags: normalized replace-all (iteration-2 semantics)', async () => {
      await service.updateIllustration('acc1', 'i1', { hashtags: ['#Néon', 'néon', 'noir'] });
      expect(prisma.illustration.update.mock.calls[0][0].data).toEqual({ hashtags: ['néon', 'noir'] });
    });

    it('absent keys leave every field untouched (empty data patch)', async () => {
      await service.updateIllustration('acc1', 'i1', {});
      expect(prisma.illustration.update.mock.calls[0][0].data).toEqual({});
    });

    it('returns the full mapped IllustrationDetail (not just { hashtags })', async () => {
      const res = await service.updateIllustration('acc1', 'i1', { title: 'X' });
      expect(res).toMatchObject({ id: 'i1', title: 'Pluie de Néons', category: 'couvertures', artist: expect.any(Object) });
    });

    it('rejects a non-owner with a uniform 404 (no ownership leak, no update)', async () => {
      prisma.illustration.findUnique.mockResolvedValue({ artistId: 'other', publishedAt: null });
      await expect(service.updateIllustration('acc1', 'i1', { title: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.illustration.update).not.toHaveBeenCalled();
    });

    it('rejects a missing illustration with 404', async () => {
      prisma.illustration.findUnique.mockResolvedValue(null);
      await expect(service.updateIllustration('acc1', 'gone', { title: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('visibility -> publishedAt (D21)', () => {
      it("'private' sets publishedAt to null", async () => {
        await service.updateIllustration('acc1', 'i1', { visibility: 'private' });
        expect(prisma.illustration.update.mock.calls[0][0].data).toEqual({ publishedAt: null });
      });

      it("'public' on a private piece stamps a fresh publishedAt", async () => {
        prisma.illustration.findUnique.mockResolvedValue({ artistId: 'acc1', publishedAt: null });
        await service.updateIllustration('acc1', 'i1', { visibility: 'public' });
        expect(prisma.illustration.update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);
      });

      it("'public' on an already-public piece keeps the original publishedAt", async () => {
        const original = new Date('2026-06-01');
        prisma.illustration.findUnique.mockResolvedValue({ artistId: 'acc1', publishedAt: original });
        await service.updateIllustration('acc1', 'i1', { visibility: 'public' });
        expect(prisma.illustration.update.mock.calls[0][0].data.publishedAt).toBe(original);
      });
    });

    it("invalidates the work:{slug} cache of every collection the illustration belongs to", async () => {
      prisma.illustrationCollection.findMany.mockResolvedValue([{ work: { slug: 'carnet-d-encre' } }, { work: { slug: 'autre' } }]);
      await service.updateIllustration('acc1', 'i1', { title: 'X' });
      expect(redis.del).toHaveBeenCalledWith('work:carnet-d-encre');
      expect(redis.del).toHaveBeenCalledWith('work:autre');
    });
  });

  describe('getMineIllustrations (DR-12)', () => {
    it("returns the caller's illustrations incl. hidden ones (BE-9: publishedAt filter dropped), newest first", async () => {
      prisma.illustration.findMany.mockResolvedValue([ILLUSTRATION_ROW({ id: 'i2' })]);
      const result = await service.getMineIllustrations('acc1');
      const args = prisma.illustration.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ artistId: 'acc1' });
      expect(args.orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'asc' }]);
      expect(result.map((c) => c.id)).toEqual(['i2']);
    });
  });
});
