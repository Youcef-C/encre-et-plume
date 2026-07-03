import { FavoritesService } from './favorites.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: { favorite: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { favorite: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new FavoritesService(prisma as unknown as PrismaService);
  });

  it('maps Favorite rows joined to Work, ordered by createdAt desc', async () => {
    prisma.favorite.findMany.mockResolvedValue([
      { work: { slug: 'lames-de-brume', title: 'Lames de Brume', coverImage: null, meta: 'Camille R. × Yuki M. · 20 ch.' } },
    ]);

    const result = await service.getFavorites('acc-1');

    expect(prisma.favorite.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      orderBy: { createdAt: 'desc' },
      include: { work: true },
    });
    expect(result).toEqual([{ slug: 'lames-de-brume', title: 'Lames de Brume', cover: null, meta: 'Camille R. × Yuki M. · 20 ch.' }]);
  });

  it('returns an empty array when the account has no favorites', async () => {
    prisma.favorite.findMany.mockResolvedValue([]);
    const result = await service.getFavorites('acc-2');
    expect(result).toEqual([]);
  });
});
