import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('FavoritesController', () => {
  let controller: FavoritesController;
  let service: { getFavorites: jest.Mock };

  beforeEach(async () => {
    service = { getFavorites: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        { provide: FavoritesService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FavoritesController>(FavoritesController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, FavoritesController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('GET /me/favorites returns the mapped favorites for req.accountId', async () => {
    const rows = [{ slug: 'lames-de-brume', title: 'Lames de Brume', cover: null, meta: 'Camille R. × Yuki M. · 20 ch.' }];
    service.getFavorites.mockResolvedValue(rows);

    const result = await controller.getFavorites({ accountId: 'acc-1' } as never);

    expect(service.getFavorites).toHaveBeenCalledWith('acc-1');
    expect(result).toEqual(rows);
  });

  it('returns an empty array when the account has no favorites', async () => {
    service.getFavorites.mockResolvedValue([]);
    const result = await controller.getFavorites({ accountId: 'acc-2' } as never);
    expect(result).toEqual([]);
  });
});
