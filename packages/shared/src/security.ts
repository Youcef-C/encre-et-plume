// F-18: Account security — shared contracts (DTOs + error codes + TOTP constants)

// ── E-mail change ────────────────────────────────────────────────────────────
export interface ChangeEmailRequest { newEmail: string; password: string; }
export interface ChangeEmailResponse { pendingEmail: string; }          // 202-style ack; verification sent
export interface ConfirmEmailChangeRequest { token: string; }
export interface ConfirmEmailChangeResponse { emailChanged: true; }

// ── Password change ──────────────────────────────────────────────────────────
export interface ChangePasswordRequest { currentPassword: string; newPassword: string; }
export interface ChangePasswordResponse { ok: true; }

// ── Sessions ─────────────────────────────────────────────────────────────────
export interface SessionSummary {
  id: string;            // the JWT jti
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;    // ISO 8601
  createdAt: string;     // ISO 8601
  current: boolean;      // true for the caller's own session
}
export interface SessionListResponse { sessions: SessionSummary[]; }

// ── Security overview (feeds the Sécurité section) ───────────────────────────
export interface SecurityOverviewResponse {
  twoFactorEnabled: boolean;
  pendingEmail: string | null;   // newEmail of an outstanding, unexpired e-mail-change token
}

// ── 2FA ──────────────────────────────────────────────────────────────────────
export interface TwoFactorSetupResponse { provisioningUri: string; secret: string; } // secret = base32
export interface TwoFactorConfirmRequest { code: string; }
export interface TwoFactorConfirmResponse { backupCodes: string[]; }   // shown once, plaintext, never returned again
export interface TwoFactorDisableRequest { password: string; code: string; }
export interface TwoFactorDisableResponse { ok: true; }

// ── Login 2FA step ───────────────────────────────────────────────────────────
export interface TwoFactorRequiredResponse { twoFactorRequired: true; challengeToken: string; }
export interface TwoFactorVerifyRequest { challengeToken: string; code: string; }
// POST /auth/2fa/verify success body === AuthResponse (F-1: { account }); cookie set as normal.
// POST /auth/login now returns AuthResponse | TwoFactorRequiredResponse (FE branches on
// `'twoFactorRequired' in res`). No cookie is set when twoFactorRequired.

// ── Stable machine-readable error codes (ApiError.error) ─────────────────────
export const INVALID_PASSWORD              = 'INVALID_PASSWORD';               // wrong current/re-auth password
export const EMAIL_CHANGE_TOKEN_INVALID    = 'EMAIL_CHANGE_TOKEN_INVALID';
export const EMAIL_CHANGE_TOKEN_EXPIRED    = 'EMAIL_CHANGE_TOKEN_EXPIRED';
export const TWO_FACTOR_ALREADY_ENABLED    = 'TWO_FACTOR_ALREADY_ENABLED';
export const TWO_FACTOR_NOT_ENABLED        = 'TWO_FACTOR_NOT_ENABLED';
export const TWO_FACTOR_INVALID_CODE       = 'TWO_FACTOR_INVALID_CODE';       // TOTP or backup code wrong
export const TWO_FACTOR_CHALLENGE_INVALID  = 'TWO_FACTOR_CHALLENGE_INVALID';  // expired/unknown challenge token
export const SESSION_NOT_FOUND             = 'SESSION_NOT_FOUND';
// EMAIL_TAKEN (F-1) reused for newEmail collision; RATE_LIMITED (F-1) reused for code attempts.

// ── TOTP / backup constants (shared so API + tests agree) ────────────────────
export const TOTP_PERIOD = 30;       // seconds
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;        // ±1 step tolerance (story: window ±1)
export const TOTP_ISSUER = 'Encre & Plume';
export const BACKUP_CODE_COUNT = 10;
