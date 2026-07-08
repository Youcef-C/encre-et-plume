import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';
import type { CreateCallDto } from './dto/create-call.dto';

function req(query: Record<string, unknown> = {}, accountId = 'acc-1'): AuthRequest {
  return { query, accountId } as unknown as AuthRequest;
}

describe('CallsController', () => {
  let controller: CallsController;
  let service: {
    findOpenCalls: jest.Mock;
    findBoard: jest.Mock;
    createCall: jest.Mock;
    closeEarly: jest.Mock;
    findDetail: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findOpenCalls: jest.fn().mockResolvedValue({ items: [] }),
      findBoard: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 }),
      createCall: jest.fn().mockResolvedValue({ id: 'call-new' }),
      closeEarly: jest.fn().mockResolvedValue({ id: 'call-1', status: 'closed' }),
      findDetail: jest.fn().mockResolvedValue({ id: 'call-1', samples: [], documents: [] }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CallsController],
      providers: [{ provide: CallsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CallsController>(CallsController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CallsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('routes to the MC-1 preview path when a limit is present', async () => {
    await controller.find(req({ limit: '2' }));
    expect(service.findOpenCalls).toHaveBeenCalledWith(2);
    expect(service.findBoard).not.toHaveBeenCalled();
  });

  it('clamps the preview limit to the max of 6', async () => {
    await controller.find(req({ limit: '99' }));
    expect(service.findOpenCalls).toHaveBeenCalledWith(6);
  });

  it('routes to the board when no limit is present, scoped to the session account', async () => {
    await controller.find(req({ status: 'all', page: '2' }));
    expect(service.findBoard).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'all', page: 2 }),
      'acc-1',
    );
  });

  it('normalizes a single genre query key into an array', async () => {
    await controller.find(req({ genre: 'seinen' }));
    expect(service.findBoard).toHaveBeenCalledWith(expect.objectContaining({ genre: ['seinen'] }), 'acc-1');
  });

  it('passes repeated genre keys through as an array', async () => {
    await controller.find(req({ genre: ['seinen', 'thriller'] }));
    expect(service.findBoard).toHaveBeenCalledWith(
      expect.objectContaining({ genre: ['seinen', 'thriller'] }),
      'acc-1',
    );
  });

  it('creates a call scoped to the session account', async () => {
    const dto = { title: 'x' } as unknown as CreateCallDto;
    await controller.create(req(), dto);
    expect(service.createCall).toHaveBeenCalledWith('acc-1', dto);
  });

  it('closes a call early scoped to the session account', async () => {
    await controller.close(req(), 'call-1', { status: 'closed' });
    expect(service.closeEarly).toHaveBeenCalledWith('acc-1', 'call-1');
  });

  it('routes the detail request to findDetail, scoped to the session account (MC-4X)', async () => {
    await controller.detail(req(), 'call-1');
    expect(service.findDetail).toHaveBeenCalledWith('acc-1', 'call-1');
  });
});
