import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';

describe('GalleryController', () => {
  let controller: GalleryController;
  let service: {
    findIllustrations: jest.Mock;
    getTrending: jest.Mock;
    getPreview: jest.Mock;
    getIllustration: jest.Mock;
    getMoreByArtist: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findIllustrations: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 12,
        totalPages: 0,
        summary: { illustrationCount: 0, artistCount: 0 },
      }),
      getTrending: jest.fn().mockResolvedValue([{ id: 'i1', rank: 1 }]),
      getPreview: jest.fn().mockResolvedValue({ id: 'i1', title: 'Pluie de Néons' }),
      getIllustration: jest.fn().mockResolvedValue({ id: 'i1', title: 'Pluie de Néons' }),
      getMoreByArtist: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GalleryController],
      providers: [{ provide: GalleryService, useValue: service }],
    }).compile();

    controller = module.get<GalleryController>(GalleryController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GalleryController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /illustrations parses the query and delegates to findIllustrations', async () => {
    const result = await controller.illustrations({ category: 'personnages', page: '2' });

    expect(service.findIllustrations).toHaveBeenCalledWith(expect.objectContaining({ category: 'personnages', page: 2 }));
    expect(result.total).toBe(0);
  });

  it('GET /illustrations/trending delegates to the service', async () => {
    const result = await controller.trending();
    expect(service.getTrending).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'i1', rank: 1 }]);
  });

  it('GET /illustrations/:id/preview delegates to the service', async () => {
    const result = await controller.preview('i1');
    expect(service.getPreview).toHaveBeenCalledWith('i1');
    expect(result).toEqual({ id: 'i1', title: 'Pluie de Néons' });
  });

  it('GET /illustrations/:id/preview propagates a 404 for an unknown id', async () => {
    service.getPreview.mockRejectedValue(new NotFoundException('Illustration nope not found'));

    await expect(controller.preview('nope')).rejects.toThrow(NotFoundException);
  });

  it('GET /illustrations/:id delegates to getIllustration and returns the detail', async () => {
    const result = await controller.illustration('i1');

    expect(service.getIllustration).toHaveBeenCalledWith('i1');
    expect(result).toEqual({ id: 'i1', title: 'Pluie de Néons' });
  });

  it('GET /illustrations/:id throws a 404 when the service returns null (missing/unpublished)', async () => {
    service.getIllustration.mockResolvedValue(null);

    await expect(controller.illustration('nope')).rejects.toThrow(NotFoundException);
  });

  it('GET /illustrations/:id/more delegates to getMoreByArtist', async () => {
    service.getMoreByArtist.mockResolvedValue([{ id: 'i2' }]);

    const result = await controller.more('i1');

    expect(service.getMoreByArtist).toHaveBeenCalledWith('i1');
    expect(result).toEqual([{ id: 'i2' }]);
  });
});
