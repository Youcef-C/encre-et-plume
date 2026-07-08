import { PartnersService, parsePartnersPagination } from './partners.service';
import { PrismaService } from '../prisma/prisma.service';

const PROFILE_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  accountId: 'acc-partner',
  country: 'FR',
  region: 'Auvergne-Rhône-Alpes',
  availability: 'disponible',
  creatorRoles: ['dessinateur'],
  tags: ['Seinen', 'Encre dense'],
  account: { profileSlug: 'theo-m', displayName: 'Théo M.', avatar: null },
  portfolio: [{ image: '/thumb-1.jpg' }, { image: '/thumb-2.jpg' }],
  ...overrides,
});

describe('parsePartnersPagination', () => {
  it('defaults page to 1 and pageSize to 12', () => {
    expect(parsePartnersPagination(undefined, undefined)).toEqual({ page: 1, pageSize: 12 });
  });

  it('clamps pageSize to the max of 48 (no error)', () => {
    expect(parsePartnersPagination('1', '999')).toEqual({ page: 1, pageSize: 48 });
  });

  it('falls back to defaults for non-numeric / below-range input', () => {
    expect(parsePartnersPagination('abc', '0')).toEqual({ page: 1, pageSize: 12 });
  });

  it('parses valid values', () => {
    expect(parsePartnersPagination('3', '20')).toEqual({ page: 3, pageSize: 20 });
  });
});

describe('PartnersService', () => {
  let service: PartnersService;
  let prisma: { profile: { findMany: jest.Mock; count: jest.Mock } };

  beforeEach(() => {
    prisma = {
      profile: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    service = new PartnersService(prisma as unknown as PrismaService);
  });

  const base = { page: 1, pageSize: 12 };

  it('excludes the viewer own card, tombstoned accounts, and non-creator profiles', async () => {
    await service.findPartners(base, 'viewer-1');

    const where = prisma.profile.findMany.mock.calls[0][0].where;
    expect(where.accountId).toEqual({ not: 'viewer-1' });
    expect(where.account).toEqual({ deletedAt: null });
    expect(where.NOT).toEqual({ creatorRoles: { isEmpty: true } });
  });

  it('applies no location filter when locations is absent (no default)', async () => {
    await service.findPartners(base, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it('expands a French région token to an exact region OR-match', async () => {
    await service.findPartners({ ...base, locations: ['Bretagne', 'Occitanie'] }, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].where.OR).toEqual([
      { region: { in: ['Bretagne', 'Occitanie'] } },
    ]);
  });

  it('expands a country code token to a country OR-match', async () => {
    await service.findPartners({ ...base, locations: ['JP'] }, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].where.OR).toEqual([{ country: { in: ['JP'] } }]);
  });

  it('expands a continent token to all its countries (Europe includes FR, excludes JP)', async () => {
    await service.findPartners({ ...base, locations: ['Europe'] }, 'viewer-1');
    const or = prisma.profile.findMany.mock.calls[0][0].where.OR;
    expect(or[0].country.in).toContain('FR');
    expect(or[0].country.in).not.toContain('JP');
  });

  it('combines country and région tokens into two OR branches', async () => {
    await service.findPartners({ ...base, locations: ['JP', 'Bretagne'] }, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].where.OR).toEqual([
      { country: { in: ['JP'] } },
      { region: { in: ['Bretagne'] } },
    ]);
  });

  it('narrows by partner role', async () => {
    await service.findPartners({ ...base, role: 'scenariste' }, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].where.creatorRoles).toEqual({ has: 'scenariste' });
  });

  it('narrows by availability', async () => {
    await service.findPartners({ ...base, availability: 'indisponible' }, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].where.availability).toBe('indisponible');
  });

  it('resolves each genre id to its fr label and matches tags with `hasSome`', async () => {
    await service.findPartners({ ...base, genres: ['josei', 'seinen'] }, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].where.tags).toEqual({ hasSome: ['Josei', 'Seinen'] });
  });

  it('issues one plain findMany + count (no two-window pagination)', async () => {
    await service.findPartners(base, 'viewer-1');
    expect(prisma.profile.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.profile.count).toHaveBeenCalledTimes(1);
  });

  it('orders by trendingScore desc then createdAt asc for everyone', async () => {
    await service.findPartners(base, 'viewer-1');
    expect(prisma.profile.findMany.mock.calls[0][0].orderBy).toEqual([
      { trendingScore: 'desc' },
      { createdAt: 'asc' },
    ]);
  });

  it('maps a profile row to the PartnerCard contract, splitting genre vs style tags and capping thumbs at 2', async () => {
    prisma.profile.findMany.mockResolvedValue([
      PROFILE_ROW({ portfolio: [{ image: '/a.jpg' }, { image: '/b.jpg' }, { image: '/c.jpg' }] }),
    ]);
    prisma.profile.count.mockResolvedValue(1);

    const res = await service.findPartners(base, 'viewer-1');

    expect(res).toEqual({
      items: [
        {
          userId: 'acc-partner',
          slug: 'theo-m',
          name: 'Théo M.',
          avatarUrl: null,
          role: 'dessinateur',
          location: 'Auvergne-Rhône-Alpes, France', // composed "Région, Pays" from country 'FR' + région
          styleTags: ['Encre dense'],
          genreTags: ['Seinen'],
          portfolioThumbs: ['/a.jpg', '/b.jpg'],
          availability: 'disponible',
        },
      ],
      page: 1,
      pageSize: 12,
      total: 1,
    });
  });

  it('composes the card location from country when the profile has no région (e.g. "Japon")', async () => {
    prisma.profile.findMany.mockResolvedValue([PROFILE_ROW({ country: 'JP', region: null })]);
    prisma.profile.count.mockResolvedValue(1);
    const res = await service.findPartners(base, 'viewer-1');
    expect(res.items[0].location).toBe('Japon');
  });

  it('gives a null card location when the profile has no country', async () => {
    prisma.profile.findMany.mockResolvedValue([PROFILE_ROW({ country: null, region: null })]);
    prisma.profile.count.mockResolvedValue(1);
    const res = await service.findPartners(base, 'viewer-1');
    expect(res.items[0].location).toBeNull();
  });

  it('picks the role matching the filter when a profile holds both creator roles', async () => {
    prisma.profile.findMany.mockResolvedValue([PROFILE_ROW({ creatorRoles: ['scenariste', 'dessinateur'] })]);
    prisma.profile.count.mockResolvedValue(1);

    const res = await service.findPartners({ ...base, role: 'dessinateur' }, 'viewer-1');
    expect(res.items[0].role).toBe('dessinateur');
  });
});
