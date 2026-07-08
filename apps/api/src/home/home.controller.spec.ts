import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

const ANON = {} as AuthRequest;
const hc = (o: Partial<{ workIds: Set<string> }> = {}) => ({
  accountIds: new Set<string>(),
  workIds: new Set<string>(),
  workSlugs: new Set<string>(),
  illustrationIds: new Set<string>(),
  ...o,
});

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
  let blocks: { hiddenContent: jest.Mock };

  beforeEach(async () => {
    service = {
      getFeatured: jest.fn().mockResolvedValue([{ id: 'w1' }]),
      getTrendingThisWeek: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getTopCreators: jest.fn().mockResolvedValue({ artist: null, scenarist: null }),
      getScheduledReleases: jest.fn().mockResolvedValue([{ id: 'ch1', workId: 'w1' }]),
      getRankingAllTime: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getAnnouncements: jest.fn().mockResolvedValue([{ id: 'a1' }]),
    };
    blocks = { hiddenContent: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [
        { provide: HomeService, useValue: service },
        { provide: BlocksService, useValue: blocks },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HomeController>(HomeController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, HomeController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /home/featured delegates to the service', async () => {
    const result = await controller.featured(ANON);
    expect(service.getFeatured).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1' }]);
  });

  it('GET /home/trending-this-week delegates to the service', async () => {
    const result = await controller.trendingThisWeek(ANON);
    expect(service.getTrendingThisWeek).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /home/top-creators delegates to the service', async () => {
    const result = await controller.topCreators();
    expect(service.getTopCreators).toHaveBeenCalled();
    expect(result).toEqual({ artist: null, scenarist: null });
  });

  it('GET /home/scheduled-releases delegates to the service', async () => {
    const result = await controller.scheduledReleases(ANON);
    expect(service.getScheduledReleases).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'ch1', workId: 'w1' }]);
  });

  it('GET /home/ranking/all-time delegates to the service', async () => {
    const result = await controller.rankingAllTime(ANON);
    expect(service.getRankingAllTime).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /home/announcements delegates to the service', async () => {
    const result = await controller.announcements();
    expect(service.getAnnouncements).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'a1' }]);
  });

  // ── MC-10 round 2 (B12): blocked-pair filtering ──
  describe('blocked-pair filtering', () => {
    const req = { accountId: 'acc-1' } as AuthRequest;

    it('drops featured/trending/all-time works by id', async () => {
      service.getFeatured.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
      service.getTrendingThisWeek.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
      service.getRankingAllTime.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['w1']) }));
      expect((await controller.featured(req)).map((w) => w.id)).toEqual(['w2']);
      expect((await controller.trendingThisWeek(req)).map((w) => w.id)).toEqual(['w2']);
      expect((await controller.rankingAllTime(req)).map((w) => w.id)).toEqual(['w2']);
    });

    it('drops scheduled releases by workId', async () => {
      service.getScheduledReleases.mockResolvedValue([
        { id: 'c1', workId: 'w1' },
        { id: 'c2', workId: 'w2' },
      ]);
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['w1']) }));
      expect((await controller.scheduledReleases(req)).map((r) => r.workId)).toEqual(['w2']);
    });

    it('does not consult hiddenContent for an anonymous viewer', async () => {
      await controller.featured(ANON);
      expect(blocks.hiddenContent).not.toHaveBeenCalled();
    });
  });
});
