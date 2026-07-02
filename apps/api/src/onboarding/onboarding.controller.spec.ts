import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { AccountSummary } from '@encre-et-plume/shared';

const ACCOUNT_ID = 'acc-ctrl-1';

function makeReq(overrides: Partial<{ accountId: string }> = {}) {
  return { accountId: ACCOUNT_ID, ...overrides };
}

const SUMMARY: AccountSummary = {
  id: ACCOUNT_ID,
  displayName: 'Yuki',
  email: 'yuki@test.com',
  role: 'utilisateur',
  verified: false,
  slug: 'yuki',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
};

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let service: jest.Mocked<Pick<OnboardingService, 'complete'>>;

  beforeEach(async () => {
    service = { complete: jest.fn().mockResolvedValue(SUMMARY) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        { provide: OnboardingService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OnboardingController>(OnboardingController);
  });

  describe('POST /me/onboarding', () => {
    it('delegates to service.complete with accountId from session and returns AccountSummary', async () => {
      const dto = { creatorRoles: ['scenariste' as const], tags: ['Seinen'], lookingFor: 'cherche_scenariste' as const };

      const result = await controller.complete(makeReq() as never, dto);

      expect(service.complete).toHaveBeenCalledWith(ACCOUNT_ID, dto);
      expect(result.onboarded).toBe(true);
    });

    it('accepts empty body (full skip — stamps onboardedAt only)', async () => {
      const result = await controller.complete(makeReq() as never, {});

      expect(service.complete).toHaveBeenCalledWith(ACCOUNT_ID, {});
      expect(result.onboarded).toBe(true);
    });

    it('propagates errors from service (e.g. 401 if account not found)', async () => {
      service.complete.mockRejectedValue(new UnauthorizedException());

      await expect(controller.complete(makeReq() as never, {})).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
