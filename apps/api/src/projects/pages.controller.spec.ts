import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('PagesController', () => {
  let controller: PagesController;
  let pages: {
    updatePage: jest.Mock;
    deletePage: jest.Mock;
    updateStage: jest.Mock;
    getDetail: jest.Mock;
    acknowledgeHandoff: jest.Mock;
    deleteHandoff: jest.Mock;
  };

  beforeEach(async () => {
    pages = {
      updatePage: jest.fn().mockResolvedValue({ id: 'page-1' }),
      deletePage: jest.fn().mockResolvedValue(undefined),
      updateStage: jest.fn().mockResolvedValue({ id: 'page-1' }),
      getDetail: jest.fn().mockResolvedValue({ id: 'page-1' }),
      acknowledgeHandoff: jest.fn().mockResolvedValue({ id: 'page-1' }),
      deleteHandoff: jest.fn().mockResolvedValue({ id: 'page-1' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PagesController],
      providers: [{ provide: PagesService, useValue: pages }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<PagesController>(PagesController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PagesController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('PATCH :id → updatePage(accountId, id, body)', async () => {
    await controller.update({ accountId: 'acc-me' } as never, 'page-1', { title: 'Neuf' } as never);
    expect(pages.updatePage).toHaveBeenCalledWith('acc-me', 'page-1', { title: 'Neuf' });
  });

  it('DELETE :id → deletePage(accountId, id)', async () => {
    await controller.remove({ accountId: 'acc-me' } as never, 'page-1');
    expect(pages.deletePage).toHaveBeenCalledWith('acc-me', 'page-1');
  });

  it('PATCH :id/stage → updateStage(accountId, id, body)', async () => {
    await controller.stage({ accountId: 'acc-me' } as never, 'page-1', { stage: 'corrections' } as never);
    expect(pages.updateStage).toHaveBeenCalledWith('acc-me', 'page-1', { stage: 'corrections' });
  });

  it('GET :id → getDetail(accountId, id)', async () => {
    await controller.detail({ accountId: 'acc-me' } as never, 'page-1');
    expect(pages.getDetail).toHaveBeenCalledWith('acc-me', 'page-1');
  });

  // CS-20 — the handoff pin's update + delete halves.
  it('POST :id/handoff/acknowledge → acknowledgeHandoff(accountId, id)', async () => {
    await controller.acknowledgeHandoff({ accountId: 'acc-me' } as never, 'page-1');
    expect(pages.acknowledgeHandoff).toHaveBeenCalledWith('acc-me', 'page-1');
  });

  it('DELETE :id/handoff → deleteHandoff(accountId, id)', async () => {
    await controller.removeHandoff({ accountId: 'acc-me' } as never, 'page-1');
    expect(pages.deleteHandoff).toHaveBeenCalledWith('acc-me', 'page-1');
  });
});
