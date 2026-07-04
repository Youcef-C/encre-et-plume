import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('ReactionsController', () => {
  let controller: ReactionsController;
  let service: { toggle: jest.Mock; getState: jest.Mock };

  beforeEach(async () => {
    service = {
      toggle: jest.fn().mockResolvedValue({ active: true, count: 1 }),
      getState: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReactionsController],
      providers: [{ provide: ReactionsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReactionsController>(ReactionsController);
  });

  it('is guarded by SessionGuard (401 without a session) — BA7', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReactionsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  describe('POST /reactions/like', () => {
    it('delegates to toggle(accountId, "like", true, dto)', async () => {
      const dto = { targetType: 'work' as const, targetId: 'lames-de-brume' };
      const result = await controller.likeOn({ accountId: 'acc-1' } as never, dto);

      expect(service.toggle).toHaveBeenCalledWith('acc-1', 'like', true, dto);
      expect(result).toEqual({ active: true, count: 1 });
    });
  });

  describe('DELETE /reactions/like', () => {
    it('delegates to toggle(accountId, "like", false, dto)', async () => {
      const dto = { targetType: 'chapter' as const, targetId: 'ch-1' };
      await controller.likeOff({ accountId: 'acc-1' } as never, dto);

      expect(service.toggle).toHaveBeenCalledWith('acc-1', 'like', false, dto);
    });
  });

  describe('POST /reactions/save', () => {
    it('delegates to toggle(accountId, "save", true, dto)', async () => {
      const dto = { targetType: 'illustration' as const, targetId: 'illus-1' };
      await controller.saveOn({ accountId: 'acc-1' } as never, dto);

      expect(service.toggle).toHaveBeenCalledWith('acc-1', 'save', true, dto);
    });
  });

  describe('DELETE /reactions/save', () => {
    it('delegates to toggle(accountId, "save", false, dto)', async () => {
      const dto = { targetType: 'work' as const, targetId: 'lames-de-brume' };
      await controller.saveOff({ accountId: 'acc-1' } as never, dto);

      expect(service.toggle).toHaveBeenCalledWith('acc-1', 'save', false, dto);
    });
  });

  describe('GET /reactions/state', () => {
    it('splits the csv ids and forwards req.accountId', async () => {
      await controller.getState({ accountId: 'acc-1' } as never, 'work', 'lames-de-brume,onibi');

      expect(service.getState).toHaveBeenCalledWith('acc-1', 'work', ['lames-de-brume', 'onibi']);
    });

    it('treats a missing/empty ids query as an empty list', async () => {
      await controller.getState({ accountId: 'acc-1' } as never, 'work', undefined as unknown as string);

      expect(service.getState).toHaveBeenCalledWith('acc-1', 'work', []);
    });
  });
});
