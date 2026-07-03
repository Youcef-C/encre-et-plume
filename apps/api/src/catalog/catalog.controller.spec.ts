import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

describe('CatalogController', () => {
  let controller: CatalogController;
  let service: {
    findWorks: jest.Mock;
    getTrending: jest.Mock;
    getActiveContest: jest.Mock;
    getEditorPicks: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findWorks: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }),
      getTrending: jest.fn().mockResolvedValue([{ id: 'w1', rank: 1 }]),
      getActiveContest: jest.fn().mockResolvedValue(null),
      getEditorPicks: jest.fn().mockResolvedValue([{ id: 'ep1', workSlug: 'encre-blanche', blurb: 'blurb' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: service }],
    }).compile();

    controller = module.get<CatalogController>(CatalogController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CatalogController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /catalog parses the query and delegates to findWorks', async () => {
    const result = await controller.catalog({ genre: 'seinen', page: '2' });

    expect(service.findWorks).toHaveBeenCalledWith(expect.objectContaining({ genre: ['seinen'], page: 2 }));
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 });
  });

  it('GET /catalog/trending delegates to the service', async () => {
    const result = await controller.trending();
    expect(service.getTrending).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'w1', rank: 1 }]);
  });

  it('GET /contests/active delegates to the service', async () => {
    const result = await controller.activeContest();
    expect(service.getActiveContest).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('GET /catalog/editor-pick delegates to the service', async () => {
    const result = await controller.editorPick();
    expect(service.getEditorPicks).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'ep1', workSlug: 'encre-blanche', blurb: 'blurb' }]);
  });
});
