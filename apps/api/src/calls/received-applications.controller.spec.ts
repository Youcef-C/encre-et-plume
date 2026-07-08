import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReceivedApplicationsController } from './received-applications.controller';
import { ReceivedApplicationsService } from './received-applications.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';
import { DecideApplicationDto } from './dto/decide-application.dto';

function req(accountId = 'acc-1'): AuthRequest {
  return { accountId } as unknown as AuthRequest;
}

describe('ReceivedApplicationsController', () => {
  let controller: ReceivedApplicationsController;
  let service: { list: jest.Mock; decide: jest.Mock };

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue({ groups: [] }),
      decide: jest.fn().mockResolvedValue({ id: 'app-1', status: 'accepted' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceivedApplicationsController],
      providers: [{ provide: ReceivedApplicationsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ReceivedApplicationsController>(ReceivedApplicationsController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReceivedApplicationsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('lists the received applications for the session account (owner id from the session, not the client)', async () => {
    await controller.list(req('acc-owner'));
    expect(service.list).toHaveBeenCalledWith('acc-owner');
  });

  it('decides the given application scoped to the session account (id from the path, owner from the session)', async () => {
    const dto = { status: 'accepted' } as DecideApplicationDto;
    const res = await controller.decide(req('acc-owner'), 'app-42', dto);
    expect(service.decide).toHaveBeenCalledWith('acc-owner', 'app-42', 'accepted');
    expect(res).toMatchObject({ id: 'app-1' });
  });

  it.each([['accepted'], ['rejected']])('accepts %s as a valid status', async (status) => {
    const dto = plainToInstance(DecideApplicationDto, { status });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([['pending'], ['withdrawn'], [''], [undefined], ['ACCEPTED']])(
    'rejects the invalid status %s (→ 400)',
    async (status) => {
      const dto = plainToInstance(DecideApplicationDto, { status });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
