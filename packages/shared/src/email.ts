// F-16: Transactional e-mail catalog & shared contracts.

export type EmailGroup = 'compte' | 'argent' | 'moderation' | 'engagement';

/**
 * All transactional e-mail template keys.
 * Compte group (this round); Argent/Modération/Engagement keys added with their feature stories.
 */
export type EmailTemplateKey =
  | 'email_verification'
  | 'password_reset'
  | 'password_changed'
  | 'welcome'
  | 'data_export_ready'      // F-14: notifies when a data export archive is ready
  | 'email_change_verification' // F-18: sent to new address during email-change flow
  | 'email_change_notice';   // F-18: sent to old address after email-change commits

export interface EmailCatalogEntry {
  key: EmailTemplateKey;
  group: EmailGroup;
  mandatory: boolean;
}

/**
 * Catalog — ground truth for validate+dispatch in EmailService.send().
 * Argent/Modération/Engagement entries land with their stories (YAGNI — no pre-add).
 */
export const EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailCatalogEntry> = {
  email_verification: { key: 'email_verification', group: 'compte', mandatory: true },
  password_reset: { key: 'password_reset', group: 'compte', mandatory: true },
  password_changed: { key: 'password_changed', group: 'compte', mandatory: true },
  welcome: { key: 'welcome', group: 'compte', mandatory: true },
  data_export_ready: { key: 'data_export_ready', group: 'compte', mandatory: true }, // F-14
  email_change_verification: { key: 'email_change_verification', group: 'compte', mandatory: true }, // F-18
  email_change_notice: { key: 'email_change_notice', group: 'compte', mandatory: true }, // F-18
};

// ── Per-template typed payload shapes ────────────────────────────────────────

export interface WelcomeEmailData {
  displayName: string;
}

export interface VerificationEmailData {
  displayName: string;
  verifyUrl: string;
}

export interface PasswordResetEmailData {
  displayName: string;
  resetUrl: string;
}

export interface PasswordChangedEmailData {
  displayName: string;
}

export interface DataExportReadyEmailData {
  displayName: string;
}

export interface EmailChangeVerificationEmailData {
  displayName: string;
  verifyUrl: string;
  newEmail: string;
}

export interface EmailChangeNoticeEmailData {
  displayName: string;
  newEmail: string;
}

/**
 * Map from EmailTemplateKey → its typed params.
 * Used by EmailService.send<K>(template: K, to, data: EmailDataByTemplate[K]).
 */
export type EmailDataByTemplate = {
  email_verification: VerificationEmailData;
  password_reset: PasswordResetEmailData;
  password_changed: PasswordChangedEmailData;
  welcome: WelcomeEmailData;
  data_export_ready: DataExportReadyEmailData; // F-14
  email_change_verification: EmailChangeVerificationEmailData; // F-18
  email_change_notice: EmailChangeNoticeEmailData; // F-18
};
