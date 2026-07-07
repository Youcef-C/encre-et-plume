import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
import { PartnersQueryDto } from './dto/partners-query.dto';
import { SessionGuard } from '../auth/guards/session.guard';

describe('PartnersController', () => {
  let controller: PartnersController;
  let service: { findPartners: jest.Mock };

  beforeEach(async () => {
    service = { findPartners: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0 }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PartnersController],
      providers: [{ provide: PartnersService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<PartnersController>(PartnersController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PartnersController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('passes the validated DTO + parsed pagination + req.accountId to the service', async () => {
    const dto: PartnersQueryDto = { role: 'dessinateur' };
    await controller.find(dto, { accountId: 'viewer-1', query: { page: '2', pageSize: '999' } } as never);
    expect(service.findPartners).toHaveBeenCalledWith(
      { role: 'dessinateur', page: 2, pageSize: 48 }, // pageSize clamped to max
      'viewer-1',
    );
  });

  it('uses the session accountId, never a client-supplied one', async () => {
    await controller.find({}, { accountId: 'owner', query: {} } as never);
    expect(service.findPartners).toHaveBeenCalledWith({ page: 1, pageSize: 12 }, 'owner');
  });
});
