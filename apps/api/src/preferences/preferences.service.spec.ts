/**
 * NotificationPreferencesService unit tests (F-15).
 * All Prisma calls are mocked.
 */

import { BadRequestException } from '@nestjs/common';
import {
  NOTIFICATION_TYPES,
  PREFERENCE_MANDATORY,
  UNSUBSCRIBE_TOKEN_INVALID,
} from '@encre-et-plume/shared';
import { NotificationPreferencesService } from './preferences.service';

// ── Prisma mock ───────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    notificationPreference: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
    },
  };
}

const ACCOUNT_ID = 'acc-test-1';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new NotificationPreferencesService(prisma as never);
  });

  // ── getMatrix ─────────────────────────────────────────────────────────────

  describe('getMatrix()', () => {
    it('returns defaults for all categories when no rows stored (BE-1, BE-2)', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([]);

      const { preferences } = await service.getMatrix(ACCOUNT_ID);

      expect(preferences).toHaveLength(NOTIFICATION_TYPES.length);
      for (const row of preferences) {
        const meta = NOTIFICATION_TYPES.find((m) => m.type === row.type)!;
        expect(row.inApp).toBe(meta.defaultInApp);
        expect(row.email).toBe(meta.defaultEmail);
        expect(row.mandatory).toBe(meta.mandatory);
        expect(row.group).toBe(meta.group);
      }
    });

    it('merges stored overrides over defaults', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([
        { accountId: ACCOUNT_ID, type: 'messages', channel: 'email', enabled: false },
        { accountId: ACCOUNT_ID, type: 'reactions', channel: 'in_app', enabled: false },
      ]);

      const { preferences } = await service.getMatrix(ACCOUNT_ID);

      const messages = preferences.find((r) => r.type === 'messages')!;
      expect(messages.email).toBe(false);
      expect(messages.inApp).toBe(true); // default, not overridden

      const reactions = preferences.find((r) => r.type === 'reactions')!;
      expect(reactions.inApp).toBe(false);
      expect(reactions.email).toBe(true); // default
    });

    it('returns rows in NOTIFICATION_TYPES order', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([]);

      const { preferences } = await service.getMatrix(ACCOUNT_ID);

      const types = preferences.map((r) => r.type);
      expect(types).toEqual(NOTIFICATION_TYPES.map((m) => m.type));
    });
  });

  // ── applyChanges ──────────────────────────────────────────────────────────

  describe('applyChanges()', () => {
    beforeEach(() => {
      prisma.notificationPreference.upsert.mockResolvedValue({});
      prisma.notificationPreference.findMany.mockResolvedValue([]);
    });

    it('upserts provided changes and returns updated matrix (BE-3)', async () => {
      const changes = [{ type: 'messages' as const, channel: 'email' as const, enabled: false }];

      await service.applyChanges(ACCOUNT_ID, changes);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId_type_channel: { accountId: ACCOUNT_ID, type: 'messages', channel: 'email' } },
          create: { accountId: ACCOUNT_ID, type: 'messages', channel: 'email', enabled: false },
          update: { enabled: false },
        }),
      );
    });

    it('applying same change twice is idempotent (upsert semantics)', async () => {
      const changes = [{ type: 'reactions' as const, channel: 'in_app' as const, enabled: false }];

      await service.applyChanges(ACCOUNT_ID, changes);
      await service.applyChanges(ACCOUNT_ID, changes);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledTimes(2);
      // Both calls use the same where clause → upsert handles idempotency
    });

    it('throws 400 PREFERENCE_MANDATORY when trying to disable a mandatory category (BE-7)', async () => {
      const changes = [{ type: 'account' as const, channel: 'email' as const, enabled: false }];

      await expect(service.applyChanges(ACCOUNT_ID, changes)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      try {
        await service.applyChanges(ACCOUNT_ID, changes);
      } catch (err) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          error: PREFERENCE_MANDATORY,
        });
      }
    });

    it('throws 400 PREFERENCE_MANDATORY for moderation mandatory category', async () => {
      const changes = [{ type: 'moderation' as const, channel: 'in_app' as const, enabled: false }];
      await expect(service.applyChanges(ACCOUNT_ID, changes)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the full updated matrix after changes', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([
        { accountId: ACCOUNT_ID, type: 'messages', channel: 'email', enabled: false },
      ]);
      const changes = [{ type: 'messages' as const, channel: 'email' as const, enabled: false }];

      const { preferences } = await service.applyChanges(ACCOUNT_ID, changes);

      const messages = preferences.find((r) => r.type === 'messages')!;
      expect(messages.email).toBe(false);
    });
  });

  // ── isInAppAllowed ────────────────────────────────────────────────────────

  describe('isInAppAllowed()', () => {
    it('returns false when non-mandatory mapped type is disabled (BE-6)', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        accountId: ACCOUNT_ID, type: 'reactions', channel: 'in_app', enabled: false,
      });

      const allowed = await service.isInAppAllowed(ACCOUNT_ID, 'like');
      expect(allowed).toBe(false);
    });

    it('returns true when non-mandatory mapped type is enabled (or default)', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null); // no row → default

      const allowed = await service.isInAppAllowed(ACCOUNT_ID, 'message');
      expect(allowed).toBe(true);
    });

    it('always returns true for mandatory mapped types (BE-7)', async () => {
      // 'system' maps to 'account' which is mandatory
      const allowed = await service.isInAppAllowed(ACCOUNT_ID, 'system');
      expect(allowed).toBe(true);
      // Should not query Prisma for mandatory types
      expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
    });

    it('returns true for unmapped NotifTypes (no toggle exists)', async () => {
      // 'invitation' has no mapping in NOTIF_TYPE_TO_PREF
      const allowed = await service.isInAppAllowed(ACCOUNT_ID, 'invitation');
      expect(allowed).toBe(true);
      expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
    });

    it('always returns true for mandatory report type (moderation category)', async () => {
      // 'report' maps to 'moderation' which is mandatory
      const allowed = await service.isInAppAllowed(ACCOUNT_ID, 'report');
      expect(allowed).toBe(true);
    });
  });

  // ── isEmailAllowedByAddress ───────────────────────────────────────────────

  describe('isEmailAllowedByAddress()', () => {
    it('always returns true for mandatory email groups (compte → account)', async () => {
      const allowed = await service.isEmailAllowedByAddress('user@test.com', 'compte');
      expect(allowed).toBe(true);
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });

    it('always returns true for mandatory email groups (moderation)', async () => {
      const allowed = await service.isEmailAllowedByAddress('user@test.com', 'moderation');
      expect(allowed).toBe(true);
    });

    it('returns true for unmapped email groups (engagement → no pref mapping)', async () => {
      const allowed = await service.isEmailAllowedByAddress('user@test.com', 'engagement');
      expect(allowed).toBe(true); // 'engagement' is unmapped → always send
    });

    it('returns true for unmapped email groups (argent)', async () => {
      const allowed = await service.isEmailAllowedByAddress('user@test.com', 'argent');
      expect(allowed).toBe(true); // 'argent' is unmapped → always send
    });

    it('returns true for unknown email address (no account found) for non-mandatory group', async () => {
      // ponytail: when 'engagement' gets a non-mandatory mapping (later story), unknown address → allow.
      // For now all mapped groups are mandatory so this tests the early-return guard.
      prisma.account.findUnique.mockResolvedValue(null);
      const allowed = await service.isEmailAllowedByAddress('unknown@test.com', 'compte');
      expect(allowed).toBe(true); // mandatory shortcut fires before account lookup
    });
  });

  // ── buildUnsubscribeToken / unsubscribe ───────────────────────────────────

  describe('buildUnsubscribeToken() + unsubscribe()', () => {
    beforeEach(() => {
      prisma.notificationPreference.upsert.mockResolvedValue({});
      prisma.notificationPreference.findMany.mockResolvedValue([]);
    });

    it('round-trip: token built then unsubscribed disables email preference (BE-4)', async () => {
      const token = service.buildUnsubscribeToken(ACCOUNT_ID, 'messages');
      const result = await service.unsubscribe(token);

      expect(result).toEqual({ unsubscribed: true, group: 'Messages' });
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId_type_channel: { accountId: ACCOUNT_ID, type: 'messages', channel: 'email' } },
          create: expect.objectContaining({ enabled: false }),
          update: { enabled: false },
        }),
      );
    });

    it('round-trip works for applications category', async () => {
      const token = service.buildUnsubscribeToken(ACCOUNT_ID, 'applications');
      const result = await service.unsubscribe(token);
      expect(result.group).toBe('Demandes & candidatures');
    });

    it('throws UNSUBSCRIBE_TOKEN_INVALID for tampered signature (BE-8)', async () => {
      const token = service.buildUnsubscribeToken(ACCOUNT_ID, 'messages');
      const parts = token.split('.');
      parts[3] = 'invalidsig';
      const tampered = parts.join('.');

      await expect(service.unsubscribe(tampered)).rejects.toBeInstanceOf(BadRequestException);
      try {
        await service.unsubscribe(tampered);
      } catch (err) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          error: UNSUBSCRIBE_TOKEN_INVALID,
        });
      }
    });

    it('throws UNSUBSCRIBE_TOKEN_INVALID for expired token (BE-8)', async () => {
      // Build a token with exp in the past
      const expiredToken = service.buildUnsubscribeTokenAt(ACCOUNT_ID, 'messages', Math.floor(Date.now() / 1000) - 1);

      await expect(service.unsubscribe(expiredToken)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws UNSUBSCRIBE_TOKEN_INVALID for malformed token', async () => {
      await expect(service.unsubscribe('not-a-valid-token')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws UNSUBSCRIBE_TOKEN_INVALID for mandatory category token (account)', async () => {
      const token = service.buildUnsubscribeToken(ACCOUNT_ID, 'account');

      await expect(service.unsubscribe(token)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws UNSUBSCRIBE_TOKEN_INVALID for mandatory category token (moderation)', async () => {
      const token = service.buildUnsubscribeToken(ACCOUNT_ID, 'moderation');
      await expect(service.unsubscribe(token)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
