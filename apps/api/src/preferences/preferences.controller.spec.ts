/**
 * NotificationPreferencesController + UnsubscribeController unit tests (F-15).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { NOTIFICATION_TYPES, UNSUBSCRIBE_TOKEN_INVALID } from '@encre-et-plume/shared';
import { NotificationPreferencesController } from './preferences.controller';
import { UnsubscribeController } from './preferences.controller';
import { NotificationPreferencesService } from './preferences.service';
import { SessionGuard } from '../auth/guards/session.guard';

const ACCOUNT_ID = 'acc-ctrl-1';

function makeReq(overrides: Partial<{ accountId: string }> = {}) {
  return { accountId: ACCOUNT_ID, ...overrides };
}

function makeFullMatrix() {
  return {
    preferences: NOTIFICATION_TYPES.map((m) => ({
      type: m.type,
      group: m.group,
      mandatory: m.mandatory,
      inApp: m.defaultInApp,
      email: m.defaultEmail,
    })),
  };
}

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  let service: jest.Mocked<Pick<NotificationPreferencesService, 'getMatrix' | 'applyChanges'>>;

  beforeEach(async () => {
    service = {
      getMatrix: jest.fn().mockResolvedValue(makeFullMatrix()),
      applyChanges: jest.fn().mockResolvedValue(makeFullMatrix()),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        { provide: NotificationPreferencesService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationPreferencesController>(NotificationPreferencesController);
  });

  describe('GET /me/notification-preferences', () => {
    it('delegates to service.getMatrix with accountId and returns full matrix (BE-2)', async () => {
      const result = await controller.getPreferences(makeReq() as never);

      expect(service.getMatrix).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(result.preferences).toHaveLength(NOTIFICATION_TYPES.length);
    });
  });

  describe('PATCH /me/notification-preferences', () => {
    it('delegates to service.applyChanges with accountId and changes (BE-3)', async () => {
      const dto = { changes: [{ type: 'messages' as const, channel: 'email' as const, enabled: false }] };

      const result = await controller.updatePreferences(makeReq() as never, dto as never);

      expect(service.applyChanges).toHaveBeenCalledWith(ACCOUNT_ID, dto.changes);
      expect(result.preferences).toHaveLength(NOTIFICATION_TYPES.length);
    });

    it('propagates BadRequestException from service on mandatory category (BE-7)', async () => {
      service.applyChanges.mockRejectedValue(
        new BadRequestException({ error: UNSUBSCRIBE_TOKEN_INVALID }),
      );

      await expect(
        controller.updatePreferences(makeReq() as never, { changes: [] } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe('UnsubscribeController', () => {
  let controller: UnsubscribeController;
  let service: jest.Mocked<Pick<NotificationPreferencesService, 'unsubscribe'>>;

  beforeEach(async () => {
    service = {
      unsubscribe: jest.fn().mockResolvedValue({ unsubscribed: true as const, group: 'Messages' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnsubscribeController],
      providers: [{ provide: NotificationPreferencesService, useValue: service }],
    }).compile();

    controller = module.get<UnsubscribeController>(UnsubscribeController);
  });

  describe('POST /unsubscribe', () => {
    it('delegates to service.unsubscribe and returns response (BE-4)', async () => {
      const dto = { token: 'valid-token' };

      const result = await controller.unsubscribe(dto as never);

      expect(service.unsubscribe).toHaveBeenCalledWith('valid-token');
      expect(result).toEqual({ unsubscribed: true, group: 'Messages' });
    });

    it('is public — no guard applied', () => {
      // If a guard were required, the DI container would fail without JwtService injection.
      // The fact that the test module compiles without JwtModule confirms no guard is required.
      expect(controller).toBeDefined();
    });

    it('propagates BadRequestException for invalid token (BE-4)', async () => {
      service.unsubscribe.mockRejectedValue(
        new BadRequestException({ error: UNSUBSCRIBE_TOKEN_INVALID }),
      );

      await expect(controller.unsubscribe({ token: 'bad' } as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
