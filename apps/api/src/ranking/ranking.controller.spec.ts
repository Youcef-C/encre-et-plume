import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { RANKING_LIMIT } from './ranking.util';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

const ANON = {} as AuthRequest;
const hc = (o: Partial<{ workIds: Set<string>; illustrationIds: Set<string> }> = {}) => ({
  accountIds: new Set<string>(),
  workIds: new Set<string>(),
  workSlugs: new Set<string>(),
  illustrationIds: new Set<string>(),
  ...o,
});

describe('RankingController', () => {
  let controller: RankingController;
  let service: { getAllTime: jest.Mock; getByCategory: jest.Mock };
  let blocks: { hiddenContent: jest.Mock };

  beforeEach(async () => {
    service = {
      getAllTime: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getByCategory: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
    };
    blocks = { hiddenContent: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RankingController],
      providers: [
        { provide: RankingService, useValue: service },
        { provide: BlocksService, useValue: blocks },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RankingController>(RankingController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RankingController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /ranking/all-time with no genre delegates with undefined genre + RANKING_LIMIT', async () => {
    const result = await controller.allTime(ANON, undefined);

    expect(service.getAllTime).toHaveBeenCalledWith(undefined, RANKING_LIMIT);
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /ranking/all-time?genre=Shōnen passes the genre through', async () => {
    await controller.allTime(ANON, 'Shōnen');

    expect(service.getAllTime).toHaveBeenCalledWith('Shōnen', RANKING_LIMIT);
  });

  it('GET /ranking?category=mangas delegates to getByCategory with RANKING_LIMIT', async () => {
    const result = await controller.byCategory(ANON, 'mangas');

    expect(service.getByCategory).toHaveBeenCalledWith('mangas', RANKING_LIMIT);
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /ranking with no category passes undefined through (service resolves the empty/unknown case)', async () => {
    await controller.byCategory(ANON, undefined);

    expect(service.getByCategory).toHaveBeenCalledWith(undefined, RANKING_LIMIT);
  });

  // ── MC-10 round 2 (B12): blocked-pair filtering ──
  describe('blocked-pair filtering', () => {
    const req = { accountId: 'acc-1' } as AuthRequest;

    it('drops all-time works by id', async () => {
      service.getAllTime.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['w1']) }));
      expect((await controller.allTime(req, undefined)).map((w) => w.id)).toEqual(['w2']);
    });

    it('drops mangas/romans entries by work id', async () => {
      service.getByCategory.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['w2']) }));
      expect((await controller.byCategory(req, 'mangas')).map((e) => e.id)).toEqual(['w1']);
    });

    it('drops illustrations entries by illustration id', async () => {
      service.getByCategory.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
      blocks.hiddenContent.mockResolvedValue(hc({ illustrationIds: new Set(['i1']) }));
      expect((await controller.byCategory(req, 'illustrations')).map((e) => e.id)).toEqual(['i2']);
    });

    it('leaves the createurs tab untouched (D9 — pointer rows)', async () => {
      service.getByCategory.mockResolvedValue([{ id: 'acc-x' }, { id: 'acc-y' }]);
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['acc-x']), illustrationIds: new Set(['acc-x']) }));
      expect((await controller.byCategory(req, 'createurs')).map((e) => e.id)).toEqual(['acc-x', 'acc-y']);
    });

    it('does not consult hiddenContent for an anonymous viewer', async () => {
      await controller.allTime(ANON, undefined);
      expect(blocks.hiddenContent).not.toHaveBeenCalled();
    });
  });
});
