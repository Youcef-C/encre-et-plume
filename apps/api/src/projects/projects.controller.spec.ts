import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: { getMine: jest.Mock };

  beforeEach(async () => {
    service = { getMine: jest.fn().mockResolvedValue({ items: [] }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ProjectsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('passes the session accountId to the service', async () => {
    await controller.mine({ accountId: 'acc-me' } as never);
    expect(service.getMine).toHaveBeenCalledWith('acc-me');
  });
});
