import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

describe('HomeController', () => {
  let controller: HomeController;
  let service: {
    getFeatured: jest.Mock;
    getTrendingThisWeek: jest.Mock;
    getTopCreators: jest.Mock;
    getScheduledReleases: jest.Mock;
    getRankingAllTime: jest.Mock;
    getAnnouncements: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getFeatured: jest.fn().mockResolvedValue([{ id: 'w1' }]),
      getTrendingThisWeek: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getTopCreators: jest.fn().mockResolvedValue({ artist: null, scenarist: null }),
      getScheduledReleases: jest.fn().mockResolvedValue([{ id: 'ch1' }]),
      getRankingAllTime: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getAnnouncements: jest.fn().mockResolvedValue([{ id: 'a1' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [{ provide: HomeService, useValue: service }],
    }).compile();

    controller = module.get<HomeController>(HomeController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, HomeController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /home/featured delegates to the service', async () => {
    const result = await controller.featured();
    expect(service.getFeatured).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1' }]);
  });

  it('GET /home/trending-this-week delegates to the service', async () => {
    const result = await controller.trendingThisWeek();
    expect(service.getTrendingThisWeek).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /home/top-creators delegates to the service', async () => {
    const result = await controller.topCreators();
    expect(service.getTopCreators).toHaveBeenCalled();
    expect(result).toEqual({ artist: null, scenarist: null });
  });

  it('GET /home/scheduled-releases delegates to the service', async () => {
    const result = await controller.scheduledReleases();
    expect(service.getScheduledReleases).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'ch1' }]);
  });

  it('GET /home/ranking/all-time delegates to the service', async () => {
    const result = await controller.rankingAllTime();
    expect(service.getRankingAllTime).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /home/announcements delegates to the service', async () => {
    const result = await controller.announcements();
    expect(service.getAnnouncements).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'a1' }]);
  });
});
