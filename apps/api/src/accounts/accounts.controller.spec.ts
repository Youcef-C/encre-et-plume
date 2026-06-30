import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
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
  preferences: { theme: 'system' as const },
};

describe('AccountsController', () => {
  let controller: AccountsController;
  let service: { updateRole: jest.Mock; updatePreferences: jest.Mock };

  beforeEach(async () => {
    service = { updateRole: jest.fn(), updatePreferences: jest.fn() };

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

  describe('F-6: PATCH me/preferences', () => {
    it('calls updatePreferences with accountId from session and returns AccountSummary', async () => {
      const updated = { ...SUMMARY, preferences: { theme: 'dark' as const } };
      service.updatePreferences.mockResolvedValue(updated);
      const fakeReq = { accountId: 'cuid-1' } as AuthRequest;

      const result = await controller.updatePreferences(fakeReq, { theme: 'dark' });

      expect(service.updatePreferences).toHaveBeenCalledWith('cuid-1', 'dark');
      expect(result).toEqual(updated);
    });

    it('passes through service errors', async () => {
      service.updatePreferences.mockRejectedValue(new NotFoundException());
      const fakeReq = { accountId: 'cuid-1' } as AuthRequest;
      await expect(controller.updatePreferences(fakeReq, { theme: 'light' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
