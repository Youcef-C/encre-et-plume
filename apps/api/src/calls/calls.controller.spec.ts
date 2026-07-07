import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('CallsController', () => {
  let controller: CallsController;
  let service: { findOpenCalls: jest.Mock };

  beforeEach(async () => {
    service = { findOpenCalls: jest.fn().mockResolvedValue({ items: [] }) };
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

  it('defaults the limit to 2 when absent', async () => {
    await controller.find(undefined);
    expect(service.findOpenCalls).toHaveBeenCalledWith(2);
  });

  it('clamps the limit to the max of 6', async () => {
    await controller.find('99');
    expect(service.findOpenCalls).toHaveBeenCalledWith(6);
  });
});
