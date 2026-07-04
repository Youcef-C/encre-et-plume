import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  NotificationPrefType,
  NotificationPreferenceRow,
  NotificationPreferencesResponse,
  PreferenceChange,
  UnsubscribeResponse,
} from '@encre-et-plume/shared';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_META,
  NOTIF_TYPE_TO_PREF,
  EMAIL_GROUP_TO_PREF,
  PREFERENCE_MANDATORY,
  UNSUBSCRIBE_TOKEN_INVALID,
} from '@encre-et-plume/shared';
import type { NotifType, EmailGroup } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from '../auth/jwt-secret';

const TOKEN_TTL_SECONDS = 90 * 24 * 3600; // 90 days

function getSecret(): string {
  return process.env['UNSUBSCRIBE_SECRET'] ?? getJwtSecret();
}

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /me/notification-preferences — full matrix with defaults applied. */
  async getMatrix(accountId: string): Promise<NotificationPreferencesResponse> {
    // ponytail: single query; 5 types × 2 channels = max 10 rows — no pagination needed
    const rows = (await (this.prisma as never as {
      notificationPreference: { findMany: (q: unknown) => Promise<{ type: string; channel: string; enabled: boolean }[]> };
    }).notificationPreference.findMany({ where: { accountId } }));

    const stored = new Map<string, boolean>();
    for (const row of rows) {
      stored.set(`${row.type}:${row.channel}`, row.enabled);
    }

    const preferences: NotificationPreferenceRow[] = NOTIFICATION_TYPES.map((meta) => ({
      type: meta.type,
      group: meta.group,
      mandatory: meta.mandatory,
      inApp: stored.get(`${meta.type}:in_app`) ?? meta.defaultInApp,
      email: stored.get(`${meta.type}:email`) ?? meta.defaultEmail,
    }));

    return { preferences };
  }

  /** PATCH /me/notification-preferences — upsert changes; reject mandatory. */
  async applyChanges(accountId: string, changes: PreferenceChange[]): Promise<NotificationPreferencesResponse> {
    for (const change of changes) {
      const meta = NOTIFICATION_TYPE_META[change.type];
      if (!meta || meta.mandatory) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Cette préférence est obligatoire et ne peut pas être modifiée.',
          error: PREFERENCE_MANDATORY,
        });
      }
    }

    const db = (this.prisma as never as {
      notificationPreference: {
        upsert: (q: unknown) => Promise<unknown>;
      };
    }).notificationPreference;

    await Promise.all(
      changes.map((c) =>
        db.upsert({
          where: { accountId_type_channel: { accountId, type: c.type, channel: c.channel } },
          create: { accountId, type: c.type, channel: c.channel, enabled: c.enabled },
          update: { enabled: c.enabled },
        }),
      ),
    );

    return this.getMatrix(accountId);
  }

  /**
   * F-5 in-app seam: returns false when recipient opted-out of in-app for this NotifType.
   * Unmapped or mandatory types always return true.
   */
  async isInAppAllowed(accountId: string, notifType: NotifType): Promise<boolean> {
    const prefType = NOTIF_TYPE_TO_PREF[notifType];
    if (!prefType) return true; // unmapped — always send

    const meta = NOTIFICATION_TYPE_META[prefType];
    if (meta.mandatory) return true; // mandatory — always send

    const row = await (this.prisma as never as {
      notificationPreference: {
        findUnique: (q: unknown) => Promise<{ enabled: boolean } | null>;
      };
    }).notificationPreference.findUnique({
      where: { accountId_type_channel: { accountId, type: prefType, channel: 'in_app' } },
    });

    return row ? row.enabled : meta.defaultInApp;
  }

  /**
   * F-16 e-mail seam: returns false when account opted-out of email for this EmailGroup.
   * Unmapped groups, mandatory groups, or unknown addresses always return true.
   */
  async isEmailAllowedByAddress(email: string, group: EmailGroup): Promise<boolean> {
    const prefType = EMAIL_GROUP_TO_PREF[group];
    if (!prefType) return true; // unmapped — always send

    const meta = NOTIFICATION_TYPE_META[prefType];
    if (meta.mandatory) return true; // mandatory — always send

    const account = await this.prisma.account.findUnique({ where: { email }, select: { id: true } });
    if (!account) return true; // unknown address — always send

    const row = await (this.prisma as never as {
      notificationPreference: {
        findUnique: (q: unknown) => Promise<{ enabled: boolean } | null>;
      };
    }).notificationPreference.findUnique({
      where: { accountId_type_channel: { accountId: account.id, type: prefType, channel: 'email' } },
    });

    return row ? row.enabled : meta.defaultEmail;
  }

  /**
   * Build a signed unsubscribe token (90d TTL).
   * Format: `base64url(accountId).type.exp.sig`
   */
  buildUnsubscribeToken(accountId: string, type: NotificationPrefType): string {
    return this.buildUnsubscribeTokenAt(accountId, type, Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS);
  }

  /** Exposed for testing: build token with explicit exp timestamp. */
  buildUnsubscribeTokenAt(accountId: string, type: NotificationPrefType, exp: number): string {
    const sig = createHmac('sha256', getSecret())
      .update(`${accountId}.${type}.${exp}`)
      .digest('base64url');
    const b64Id = Buffer.from(accountId).toString('base64url');
    return `${b64Id}.${type}.${exp}.${sig}`;
  }

  /**
   * POST /unsubscribe — verify signed token, disable email preference.
   * Constant-time signature comparison via timingSafeEqual.
   */
  async unsubscribe(token: string): Promise<UnsubscribeResponse> {
    const parts = token.split('.');
    // Expected: [b64Id, type, exp, sig]
    // All parts are dot-free (base64url, enum values, numeric, base64url-sig) → exactly 4 parts.
    if (parts.length !== 4) {
      throw new BadRequestException({ statusCode: 400, message: 'Token invalide.', error: UNSUBSCRIBE_TOKEN_INVALID });
    }
    const [b64Id, type, expStr, sig] = parts as [string, string, string, string];

    // Decode accountId
    const accountId = Buffer.from(b64Id, 'base64url').toString();

    // Check expiry
    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) {
      throw new BadRequestException({ statusCode: 400, message: 'Token expiré.', error: UNSUBSCRIBE_TOKEN_INVALID });
    }

    // Verify signature (constant-time)
    const expectedSig = createHmac('sha256', getSecret())
      .update(`${accountId}.${type}.${expStr}`)
      .digest('base64url');
    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(sig);
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new BadRequestException({ statusCode: 400, message: 'Token invalide.', error: UNSUBSCRIBE_TOKEN_INVALID });
    }

    // Validate type
    const meta = NOTIFICATION_TYPE_META[type as NotificationPrefType];
    if (!meta || meta.mandatory) {
      throw new BadRequestException({ statusCode: 400, message: 'Token invalide.', error: UNSUBSCRIBE_TOKEN_INVALID });
    }

    // Disable email for this category
    await (this.prisma as never as {
      notificationPreference: {
        upsert: (q: unknown) => Promise<unknown>;
      };
    }).notificationPreference.upsert({
      where: { accountId_type_channel: { accountId, type, channel: 'email' } },
      create: { accountId, type, channel: 'email', enabled: false },
      update: { enabled: false },
    });

    // ponytail: AD-10 ActionLogService.record('preferences_update') seam — AD-10 not yet shipped

    return { unsubscribed: true, group: meta.group };
  }
}
