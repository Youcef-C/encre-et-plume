import { FavoritesService } from './favorites.service';
import { PrismaService } from '../prisma/prisma.service';
import { WORK_META_INCLUDE } from '../works/work-meta';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: { favorite: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { favorite: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new FavoritesService(prisma as unknown as PrismaService);
  });

  it('maps Favorite rows joined to Work, ordered by createdAt desc', async () => {
    prisma.favorite.findMany.mockResolvedValue([
      {
        work: {
          slug: 'lames-de-brume',
          title: 'Lames de Brume',
          coverImage: null,
          format: 'Manga',
          chapterCount: 12,
          creators: [{ account: { displayName: 'Camille Roux' } }, { account: { displayName: 'Yuki Moreau' } }],
        },
      },
    ]);

    const result = await service.getFavorites('acc-1');

    expect(prisma.favorite.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      orderBy: { createdAt: 'desc' },
      include: { work: { include: WORK_META_INCLUDE } },
    });
    expect(result).toEqual([
      { slug: 'lames-de-brume', title: 'Lames de Brume', cover: null, meta: 'Camille Roux × Yuki Moreau · 12 ch.' },
    ]);
  });

  it('returns an empty array when the account has no favorites', async () => {
    prisma.favorite.findMany.mockResolvedValue([]);
    const result = await service.getFavorites('acc-2');
    expect(result).toEqual([]);
  });
});
