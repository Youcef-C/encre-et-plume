import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ListController } from './list.controller';
import { ListService } from './list.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('ListController', () => {
  let controller: ListController;
  let service: { getList: jest.Mock; getLikes: jest.Mock; removeFromList: jest.Mock };

  beforeEach(async () => {
    service = {
      getList: jest.fn().mockResolvedValue([]),
      getLikes: jest.fn().mockResolvedValue([]),
      removeFromList: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListController],
      providers: [{ provide: ListService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ListController>(ListController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ListController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  describe('GET /me/list', () => {
    it('delegates to getList with req.accountId', async () => {
      await controller.getList({ accountId: 'acc-1' } as never);
      expect(service.getList).toHaveBeenCalledWith('acc-1');
    });

    it('never uses a client-supplied accountId', async () => {
      await controller.getList({ accountId: 'acc-owner' } as never);
      expect(service.getList).toHaveBeenCalledWith('acc-owner');
    });
  });

  describe('GET /me/likes', () => {
    it('delegates to getLikes with req.accountId', async () => {
      await controller.getLikes({ accountId: 'acc-1' } as never);
      expect(service.getLikes).toHaveBeenCalledWith('acc-1');
    });
  });

  describe('DELETE /me/list/:slug', () => {
    it('delegates to removeFromList with req.accountId and the slug param', async () => {
      await controller.remove({ accountId: 'acc-1' } as never, 'lames-de-brume');
      expect(service.removeFromList).toHaveBeenCalledWith('acc-1', 'lames-de-brume');
    });

    it('never uses a client-supplied accountId, only req.accountId', async () => {
      await controller.remove({ accountId: 'acc-owner' } as never, 'onibi');
      expect(service.removeFromList).toHaveBeenCalledWith('acc-owner', 'onibi');
    });
  });
});
