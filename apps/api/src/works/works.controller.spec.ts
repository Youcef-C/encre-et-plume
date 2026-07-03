import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { WorksController } from './works.controller';
import { WorksService } from './works.service';

describe('WorksController', () => {
  let controller: WorksController;
  let service: { getWork: jest.Mock; getChapters: jest.Mock; getPlanches: jest.Mock };

  beforeEach(async () => {
    service = {
      getWork: jest.fn().mockResolvedValue({ id: 'w1', slug: 'lames-de-brume' }),
      getChapters: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }),
      getPlanches: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorksController],
      providers: [{ provide: WorksService, useValue: service }],
    }).compile();

    controller = module.get<WorksController>(WorksController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorksController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /works/:slug delegates to getWork', async () => {
    const result = await controller.getWork('lames-de-brume');
    expect(service.getWork).toHaveBeenCalledWith('lames-de-brume');
    expect(result).toEqual({ id: 'w1', slug: 'lames-de-brume' });
  });

  it('GET /works/:slug throws NotFoundException when the work is missing', async () => {
    service.getWork.mockResolvedValue(null);
    await expect(controller.getWork('inconnu')).rejects.toThrow(NotFoundException);
  });

  it('GET /works/:slug/chapters delegates to getChapters with the parsed page', async () => {
    const result = await controller.getChapters('lames-de-brume', '3');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 3);
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });

  it('GET /works/:slug/chapters clamps a missing/invalid page to 1', async () => {
    await controller.getChapters('lames-de-brume', undefined);
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);

    await controller.getChapters('lames-de-brume', 'abc');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);

    await controller.getChapters('lames-de-brume', '0');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);
  });

  it('GET /works/:slug/chapters throws NotFoundException when the work is missing', async () => {
    service.getChapters.mockResolvedValue(null);
    await expect(controller.getChapters('inconnu', '1')).rejects.toThrow(NotFoundException);
  });

  it('GET /works/:slug/planches delegates to getPlanches', async () => {
    service.getPlanches.mockResolvedValue([{ id: 'p1', image: null, caption: null }]);
    const result = await controller.getPlanches('lames-de-brume');
    expect(service.getPlanches).toHaveBeenCalledWith('lames-de-brume');
    expect(result).toEqual([{ id: 'p1', image: null, caption: null }]);
  });

  it('GET /works/:slug/planches throws NotFoundException when the work is missing', async () => {
    service.getPlanches.mockResolvedValue(null);
    await expect(controller.getPlanches('inconnu')).rejects.toThrow(NotFoundException);
  });
});
