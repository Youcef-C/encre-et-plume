import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ListController } from './list.controller';
import { ListService } from './list.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('ListController', () => {
  let controller: ListController;
  let service: { getList: jest.Mock; getLikes: jest.Mock; getLikedIllustrations: jest.Mock; getSavedIllustrations: jest.Mock };

  beforeEach(async () => {
    service = {
      getList: jest.fn().mockResolvedValue([]),
      getLikes: jest.fn().mockResolvedValue([]),
      getLikedIllustrations: jest.fn().mockResolvedValue([]),
      getSavedIllustrations: jest.fn().mockResolvedValue([]),
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

  describe('GET /me/illustrations/liked', () => {
    it('delegates to getLikedIllustrations with req.accountId', async () => {
      await controller.getLikedIllustrations({ accountId: 'acc-1' } as never);
      expect(service.getLikedIllustrations).toHaveBeenCalledWith('acc-1');
    });

    it('never uses a client-supplied accountId', async () => {
      await controller.getLikedIllustrations({ accountId: 'acc-owner' } as never);
      expect(service.getLikedIllustrations).toHaveBeenCalledWith('acc-owner');
    });
  });

  describe('GET /me/illustrations/saved', () => {
    it('delegates to getSavedIllustrations with req.accountId', async () => {
      await controller.getSavedIllustrations({ accountId: 'acc-1' } as never);
      expect(service.getSavedIllustrations).toHaveBeenCalledWith('acc-1');
    });

    it('never uses a client-supplied accountId', async () => {
      await controller.getSavedIllustrations({ accountId: 'acc-owner' } as never);
      expect(service.getSavedIllustrations).toHaveBeenCalledWith('acc-owner');
    });
  });
});
