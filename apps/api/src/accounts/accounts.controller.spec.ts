import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const SUMMARY = {
  id: 'cuid-1',
  displayName: 'Yuki',
  email: 'y@test.com',
  role: 'editor' as const,
  verified: false,
  slug: 'yuki',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AccountsController', () => {
  let controller: AccountsController;
  let service: { updateRole: jest.Mock };

  beforeEach(async () => {
    service = { updateRole: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        { provide: AccountsService, useValue: service },
        // Guards are unit-tested separately; override so they pass here
        { provide: SessionGuard, useValue: { canActivate: () => true } },
        { provide: RolesGuard, useValue: { canActivate: () => true } },
        Reflector,
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AccountsController>(AccountsController);
  });

  it('PATCH /accounts/:id/role returns updated AccountSummary (BE-AC4)', async () => {
    service.updateRole.mockResolvedValue(SUMMARY);
    const result = await controller.updateRole('cuid-1', { role: 'editor' });
    expect(result).toEqual(SUMMARY);
    expect(service.updateRole).toHaveBeenCalledWith('cuid-1', 'editor');
  });

  it('propagates NotFoundException from service (unknown id → 404)', async () => {
    service.updateRole.mockRejectedValue(new NotFoundException());
    await expect(controller.updateRole('bad-id', { role: 'admin' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates ForbiddenException (guard layer, non-admin → 403)', async () => {
    service.updateRole.mockRejectedValue(new ForbiddenException());
    await expect(controller.updateRole('cuid-1', { role: 'admin' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
