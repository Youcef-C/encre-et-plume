import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

const ANON = {} as AuthRequest;
const hc = (o: Partial<{ workIds: Set<string>; workSlugs: Set<string> }> = {}) => ({
  accountIds: new Set<string>(),
  workIds: new Set<string>(),
  workSlugs: new Set<string>(),
  illustrationIds: new Set<string>(),
  ...o,
});

describe('CatalogController', () => {
  let controller: CatalogController;
  let service: {
    findWorks: jest.Mock;
    getTrending: jest.Mock;
    getActiveContest: jest.Mock;
    getEditorPicks: jest.Mock;
  };
  let blocks: { hiddenContent: jest.Mock };

  beforeEach(async () => {
    service = {
      findWorks: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }),
      getTrending: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getActiveContest: jest.fn().mockResolvedValue(null),
      getEditorPicks: jest.fn().mockResolvedValue([{ id: 'ep1', workSlug: 'encre-blanche', blurb: 'blurb' }]),
    };
    blocks = { hiddenContent: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        { provide: CatalogService, useValue: service },
        { provide: BlocksService, useValue: blocks },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CatalogController>(CatalogController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CatalogController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /catalog parses the query and delegates to findWorks', async () => {
    const result = await controller.catalog({ genre: 'seinen', page: '2' }, ANON);

    expect(service.findWorks).toHaveBeenCalledWith(expect.objectContaining({ genre: ['seinen'], page: 2 }));
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 });
  });

  it('GET /catalog/trending delegates to the service', async () => {
    const result = await controller.trending(ANON);
    expect(service.getTrending).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /contests/active delegates to the service', async () => {
    const result = await controller.activeContest();
    expect(service.getActiveContest).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('GET /catalog/editor-pick delegates to the service', async () => {
    const result = await controller.editorPick(ANON);
    expect(service.getEditorPicks).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'ep1', workSlug: 'encre-blanche', blurb: 'blurb' }]);
  });

  // ── MC-10 round 2 (B12): blocked-pair list filtering ──
  describe('blocked-pair filtering', () => {
    it('drops catalog items in the workIds set for a signed-in blocked-pair viewer; total stays global', async () => {
      service.findWorks.mockResolvedValue({
        items: [{ id: 'w1' }, { id: 'w2' }],
        total: 2,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      });
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['w1']) }));
      const res = await controller.catalog({}, { accountId: 'acc-1' } as AuthRequest);
      expect(res.items).toEqual([{ id: 'w2' }]);
      expect(res.total).toBe(2); // D10: global
    });

    it('does not consult hiddenContent for an anonymous viewer', async () => {
      await controller.catalog({}, ANON);
      expect(blocks.hiddenContent).not.toHaveBeenCalled();
    });

    it('drops trending works by id', async () => {
      service.getTrending.mockResolvedValue([{ id: 'w1', rank: 1 }, { id: 'w2', rank: 2 }]);
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['w2']) }));
      const res = await controller.trending({ accountId: 'acc-1' } as AuthRequest);
      expect(res.map((w) => w.id)).toEqual(['w1']);
    });

    it('drops editor picks by workSlug', async () => {
      service.getEditorPicks.mockResolvedValue([
        { id: 'ep1', workSlug: 'a', blurb: '' },
        { id: 'ep2', workSlug: 'b', blurb: '' },
      ]);
      blocks.hiddenContent.mockResolvedValue(hc({ workSlugs: new Set(['b']) }));
      const res = await controller.editorPick({ accountId: 'acc-1' } as AuthRequest);
      expect(res.map((p) => p.workSlug)).toEqual(['a']);
    });
  });
});
