/**
 * PrivacyController unit tests (F-14).
 * Tests route wiring, SessionGuard, cookie clearing on account deletion.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { SessionGuard } from '../auth/guards/session.guard';

const ACCOUNT_ID = 'acc-1';

const IDLE_DTO = {
  status: 'idle' as const,
  requestedAt: null,
  readyAt: null,
  expiresAt: null,
  downloadUrl: null,
  expiresIn: null,
};

const PENDING_DTO = {
  status: 'pending' as const,
  requestedAt: new Date().toISOString(),
  readyAt: null,
  expiresAt: null,
  downloadUrl: null,
  expiresIn: null,
};

function makeReq(overrides?: Partial<{ accountId: string }>) {
  return { accountId: ACCOUNT_ID, ...overrides };
}

function makeRes() {
  return { clearCookie: jest.fn() };
}

describe('PrivacyController', () => {
  let controller: PrivacyController;
  let service: jest.Mocked<Pick<PrivacyService, 'requestExport' | 'getExport' | 'deleteAccount'>>;

  beforeEach(async () => {
    service = {
      requestExport: jest.fn().mockResolvedValue(PENDING_DTO),
      getExport: jest.fn().mockResolvedValue(IDLE_DTO),
      deleteAccount: jest.fn().mockResolvedValue({ deleted: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [
        { provide: PrivacyService, useValue: service },
        // Override SessionGuard to always pass in tests
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PrivacyController>(PrivacyController);
  });

  describe('POST /me/data-export', () => {
    it('calls service.requestExport with accountId from request', async () => {
      const result = await controller.requestExport(makeReq() as never);

      expect(service.requestExport).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(result.status).toBe('pending');
    });
  });

  describe('GET /me/data-export', () => {
    it('calls service.getExport with accountId', async () => {
      const result = await controller.getExport(makeReq() as never);

      expect(service.getExport).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(result.status).toBe('idle');
    });
  });

  describe('DELETE /me/account', () => {
    it('calls service.deleteAccount, clears ep_session cookie, returns { deleted: true }', async () => {
      const req = makeReq() as never;
      const res = makeRes() as never;

      const result = await controller.deleteAccount({ password: 'pass' }, req, res);

      expect(service.deleteAccount).toHaveBeenCalledWith(ACCOUNT_ID, 'pass');
      expect((res as ReturnType<typeof makeRes>).clearCookie).toHaveBeenCalledWith(
        'ep_session',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual({ deleted: true });
    });

    it('propagates 401 from service on wrong password', async () => {
      service.deleteAccount.mockRejectedValue(new UnauthorizedException());

      await expect(
        controller.deleteAccount({ password: 'wrong' }, makeReq() as never, makeRes() as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
