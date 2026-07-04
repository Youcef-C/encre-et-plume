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
  image: null,
  width: null,
  height: null,
  likeCount: 12400,
  weeklyLikeDelta: 900,
  publishedAt: new Date('2026-06-01'),
  createdAt: new Date('2026-06-01'),
  ...overrides,
});

const EMPTY_QUERY: GalleryQuery = { q: undefined, genre: [], category: undefined, tri: 'tendance', page: 1 };

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
      },
    ]);
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
    });
  });

  it('getPreview: throws NotFoundException for an unknown or unpublished id', async () => {
    prisma.illustration.findFirst.mockResolvedValue(null);

    await expect(service.getPreview('nope')).rejects.toThrow(NotFoundException);
  });
});
