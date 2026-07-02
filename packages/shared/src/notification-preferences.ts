// F-15: Notification & e-mail preferences shared contracts.

import type { NotifType } from './notification.js';
import type { EmailGroup } from './email.js';

/** User-facing notification categories that exist TODAY. Later stories register new keys. */
export type NotificationPrefType =
  | 'messages'
  | 'applications'
  | 'reactions'
  | 'account'      // mandatory (Compte & sécurité)
  | 'moderation';  // mandatory (Modération)

export type NotificationChannel = 'in_app' | 'email';

export interface NotificationTypeMeta {
  type: NotificationPrefType;
  /** French group label shown as the fieldset legend. */
  group: string;
  defaultInApp: boolean;
  defaultEmail: boolean;
  /** Locked on both channels; never disableable. */
  mandatory: boolean;
}

/** Ordered — drives the UI render order. Only categories with real meaning today. */
export const NOTIFICATION_TYPES: NotificationTypeMeta[] = [
  { type: 'messages',     group: 'Messages',                defaultInApp: true, defaultEmail: true, mandatory: false },
  { type: 'applications', group: 'Demandes & candidatures', defaultInApp: true, defaultEmail: true, mandatory: false },
  { type: 'reactions',    group: 'Soutiens & réactions',    defaultInApp: true, defaultEmail: true, mandatory: false },
  { type: 'account',      group: 'Compte & sécurité',       defaultInApp: true, defaultEmail: true, mandatory: true  },
  { type: 'moderation',   group: 'Modération',              defaultInApp: true, defaultEmail: true, mandatory: true  },
];

export const NOTIFICATION_TYPE_META: Record<NotificationPrefType, NotificationTypeMeta> =
  Object.fromEntries(NOTIFICATION_TYPES.map((m) => [m.type, m])) as Record<NotificationPrefType, NotificationTypeMeta>;

/**
 * In-app enforcement: NotifType → preference category.
 * Unmapped NotifTypes = always send (no toggle yet).
 */
export const NOTIF_TYPE_TO_PREF: Partial<Record<NotifType, NotificationPrefType>> = {
  message:     'messages',
  application: 'applications',
  like:        'reactions',
  report:      'moderation',
  system:      'account',
  // ponytail: invitation/project_activity/release/comment have no emitter today — register when they land.
};

/**
 * E-mail enforcement: EmailGroup → preference category.
 * Unmapped groups = always send.
 */
export const EMAIL_GROUP_TO_PREF: Partial<Record<EmailGroup, NotificationPrefType>> = {
  compte:     'account',
  moderation: 'moderation',
  // ponytail: 'argent' and 'engagement' register with their stories.
};

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface NotificationPreferenceRow {
  type: NotificationPrefType;
  group: string;
  mandatory: boolean;
  inApp: boolean;   // resolved (stored row ?? defaultInApp)
  email: boolean;   // resolved (stored row ?? defaultEmail)
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferenceRow[];
}

export interface PreferenceChange {
  type: NotificationPrefType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface UpdateNotificationPreferencesRequest {
  changes: PreferenceChange[];
}

export type UpdateNotificationPreferencesResponse = NotificationPreferencesResponse;

export interface UnsubscribeRequest { token: string; }
export interface UnsubscribeResponse { unsubscribed: true; group: string; }

// Error codes (ApiError.error)
export const UNSUBSCRIBE_TOKEN_INVALID = 'UNSUBSCRIBE_TOKEN_INVALID';
export const PREFERENCE_MANDATORY = 'PREFERENCE_MANDATORY';
