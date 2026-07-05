import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { RANKING_LIMIT } from './ranking.util';

describe('RankingController', () => {
  let controller: RankingController;
  let service: { getAllTime: jest.Mock; getByCategory: jest.Mock };

  beforeEach(async () => {
    service = {
      getAllTime: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getByCategory: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RankingController],
      providers: [{ provide: RankingService, useValue: service }],
    }).compile();

    controller = module.get<RankingController>(RankingController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RankingController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /ranking/all-time with no genre delegates with undefined genre + RANKING_LIMIT', async () => {
    const result = await controller.allTime(undefined);

    expect(service.getAllTime).toHaveBeenCalledWith(undefined, RANKING_LIMIT);
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /ranking/all-time?genre=Shōnen passes the genre through', async () => {
    await controller.allTime('Shōnen');

    expect(service.getAllTime).toHaveBeenCalledWith('Shōnen', RANKING_LIMIT);
  });

  it('GET /ranking?category=mangas delegates to getByCategory with RANKING_LIMIT', async () => {
    const result = await controller.byCategory('mangas');

    expect(service.getByCategory).toHaveBeenCalledWith('mangas', RANKING_LIMIT);
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /ranking with no category passes undefined through (service resolves the empty/unknown case)', async () => {
    await controller.byCategory(undefined);

    expect(service.getByCategory).toHaveBeenCalledWith(undefined, RANKING_LIMIT);
  });
});
