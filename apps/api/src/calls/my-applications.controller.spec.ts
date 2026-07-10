import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MyApplicationsController } from './my-applications.controller';
import { MyApplicationsService } from './my-applications.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';
import type { MyApplicationsQueryDto } from './dto/my-applications-query.dto';

function req(query: Record<string, unknown> = {}, accountId = 'acc-1'): AuthRequest {
  return { query, accountId } as unknown as AuthRequest;
}

describe('MyApplicationsController', () => {
  let controller: MyApplicationsController;
  let service: { list: jest.Mock; withdraw: jest.Mock; get: jest.Mock; edit: jest.Mock };

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalAll: 0 }),
      withdraw: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ id: 'app-42', message: 'hi' }),
      edit: jest.fn().mockResolvedValue({ id: 'app-42', message: 'edited' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyApplicationsController],
      providers: [{ provide: MyApplicationsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<MyApplicationsController>(MyApplicationsController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MyApplicationsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('lists the session account own applications, defaulting status to all', async () => {
    await controller.find({} as MyApplicationsQueryDto, req());
    expect(service.list).toHaveBeenCalledWith('acc-1', { status: 'all', page: 1 });
  });

  it('passes a validated status filter through', async () => {
    await controller.find({ status: 'accepted' } as MyApplicationsQueryDto, req());
    expect(service.list).toHaveBeenCalledWith('acc-1', { status: 'accepted', page: 1 });
  });

  it('parses a valid page from the raw query', async () => {
    await controller.find({} as MyApplicationsQueryDto, req({ page: '4' }));
    expect(service.list).toHaveBeenCalledWith('acc-1', { status: 'all', page: 4 });
  });

  it.each([['0'], ['-3'], ['nope'], [undefined]])('clamps page %s to 1', async (raw) => {
    await controller.find({} as MyApplicationsQueryDto, req({ page: raw }));
    expect(service.list).toHaveBeenCalledWith('acc-1', expect.objectContaining({ page: 1 }));
  });

  it('withdraws the given application scoped to the session account (id from the path, not the body)', async () => {
    await controller.withdraw(req(), 'app-42');
    expect(service.withdraw).toHaveBeenCalledWith('acc-1', 'app-42');
  });

  it('gets the given application detail scoped to the session account (id from the path)', async () => {
    const res = await controller.detail(req(), 'app-42');
    expect(service.get).toHaveBeenCalledWith('acc-1', 'app-42');
    expect(res).toMatchObject({ id: 'app-42', message: 'hi' });
  });

  it('edits the given application scoped to the session account (id from the path, applicant from the session)', async () => {
    const dto = { samples: [{ mediaId: 'med-1' }], message: 'edited' } as never;
    const res = await controller.edit(req(), 'app-42', dto);
    expect(service.edit).toHaveBeenCalledWith('acc-1', 'app-42', dto);
    expect(res).toMatchObject({ id: 'app-42', message: 'edited' });
  });
});
