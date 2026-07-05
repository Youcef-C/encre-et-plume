import { NotFoundException } from '@nestjs/common';
import type { GalleryQuery } from '@encre-et-plume/shared';
import { GALLERY_PAGE_SIZE } from '@encre-et-plume/shared';
import { GalleryService } from './gallery.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

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
  let prisma: { illustration: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock } };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = {
      illustration: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    service = new GalleryService(prisma as unknown as PrismaService, redis as unknown as RedisService);
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

    it('queries only the published illustration matching the id', async () => {
      prisma.illustration.findFirst.mockResolvedValue(ILLUSTRATION_ROW());

      await service.getIllustration('i1');

      const args = prisma.illustration.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'i1', publishedAt: { not: null } });
    });

    it('returns null for an unknown or unpublished id', async () => {
      prisma.illustration.findFirst.mockResolvedValue(null);

      const result = await service.getIllustration('nope');

      expect(result).toBeNull();
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
});
