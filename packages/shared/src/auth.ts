// Shared auth contracts for F-1 (account sign-up & login).
// Both apps/web and apps/api import these so request/response shapes never drift.

/**
 * The four platform roles (see F-2). Defined here because the account created
 * in F-1 carries `role`, defaulting to `utilisateur`.
 */
export type UserRole = 'utilisateur' | 'maintainer' | 'editor' | 'admin';

export const USER_ROLES: readonly UserRole[] = [
  'utilisateur',
  'maintainer',
  'editor',
  'admin',
] as const;

/** F-6: persisted theme choice. 'system' = follow OS (default until user picks). */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'] as const;

/** Per-account UI preferences (extensible JSON column). */
export interface AccountPreferences {
  theme: ThemePreference;
}

/** PATCH /accounts/me/preferences body (F-6). */
export interface UpdatePreferencesRequest {
  theme: ThemePreference;
}

/** Public shape of the current account, returned by GET /auth/me, signup, and login. */
export interface AccountSummary {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  /** Admin-set editor verification flag (F-2/AD-3). Always present; only meaningful when role === 'editor'. */
  verified: boolean;
  /** Unique profile slug minted from displayName at sign-up; routes use it (e.g. /yuki-moreau). */
  slug: string;
  /** Avatar URL or null when none is set yet. */
  avatar: string | null;
  createdAt: string; // ISO 8601
  /** F-6: persisted UI preferences; theme defaults to 'system'. */
  preferences: AccountPreferences;
  /** F-11: true once the account confirmed its e-mail (Account.emailVerifiedAt != null). */
  emailVerified: boolean;
  /** F-13: true when the account has no ConsentRecord for the current CGU version. */
  needsCguReconsent: boolean;
  /** F-17: true once the onboarding wizard was completed or skipped (Account.onboardedAt != null). */
  onboarded: boolean;
}

/** PATCH /accounts/{id}/role body — admin-only role change (F-2). */
export interface UpdateRoleRequest {
  role: UserRole;
}

/** POST /auth/signup body. Credential confirmed as email/password (see plan decision D1). */
export interface SignupRequest {
  displayName: string;
  email: string;
  password: string;
  /**
   * Optional user-chosen handle — becomes profileSlug verbatim (lowercase letters/digits/hyphens,
   * 3–30 chars). 409 USERNAME_TAKEN when already used; absent → slug auto-generated from displayName.
   */
  username?: string;
  /** F-13: must be true; server rejects signup if absent or false. */
  acceptCgu: boolean;
}

/** POST /auth/login body. */
export interface LoginRequest {
  email: string;
  password: string;
  /** Optional "remember me": extends the session cookie lifetime when true. */
  rememberMe?: boolean;
}

/** Response body for POST /auth/signup and POST /auth/login. Session token is set as an httpOnly cookie. */
export interface AuthResponse {
  account: AccountSummary;
}

/**
 * F-11 R2: POST /auth/signup response — sessionless; FE routes to the "check your e-mail" page.
 * No Set-Cookie: the emailed token is the credential that signs the user in (via /confirm).
 */
export interface SignupResponse {
  verificationRequired: true;
  email: string;
}

/** POST /auth/verify-email/request body — public, non-enumerating (mirrors password-reset request). */
export interface RequestVerificationEmailRequest { email: string; }

/** POST /auth/verify-email/request success body — identical regardless of account existence. */
export interface RequestVerificationEmailResponse { ok: true; }

/**
 * Where the FE redirects after email confirmation (POST /auth/verify-email/confirm).
 * F-17: flipped from '/' to '/onboarding' — new users land on the wizard.
 */
export const POST_VERIFICATION_REDIRECT = '/onboarding';

/** Stable API error payload for inline French messages (e.g. "Identifiants invalides"). */
export interface ApiError {
  statusCode: number;
  /** French, user-facing message safe to render inline. */
  message: string;
  /** Machine-readable code for the FE to branch on (e.g. EMAIL_TAKEN, INVALID_CREDENTIALS). */
  error: string;
}

// ── F-11: Email verification contracts ───────────────────────────────────────

/** POST /auth/verify-email/confirm body (public; token is the credential). */
export interface VerifyEmailConfirmRequest {
  token: string;
}

/** POST /auth/verify-email/confirm success body. */
export interface VerifyEmailConfirmResponse {
  emailVerified: true;
}

/** Stable machine-readable error codes for the verification flow (ApiError.error). */
export const EMAIL_TOKEN_INVALID = 'EMAIL_TOKEN_INVALID'; // unknown / malformed / already-consumed
export const EMAIL_TOKEN_EXPIRED = 'EMAIL_TOKEN_EXPIRED'; // past expiresAt
export const EMAIL_NOT_VERIFIED  = 'EMAIL_NOT_VERIFIED';  // guard rejection
// RATE_LIMITED reused from F-1.

// ── F-12: Password reset contracts ───────────────────────────────────────────

/** POST /auth/password-reset/request body (public; non-enumerating). */
export interface RequestPasswordResetRequest { email: string; }
/** POST /auth/password-reset/request success body — identical regardless of account existence. */
export interface RequestPasswordResetResponse { ok: true; }
/** POST /auth/password-reset/confirm body (public; token is the credential). */
export interface ConfirmPasswordResetRequest { token: string; newPassword: string; }
/** POST /auth/password-reset/confirm success body. */
export interface ConfirmPasswordResetResponse { reset: true; }

/** Stable machine-readable error codes — both map to "Lien invalide ou expiré." UI copy. */
export const PASSWORD_RESET_TOKEN_INVALID = 'PASSWORD_RESET_TOKEN_INVALID'; // unknown / consumed
export const PASSWORD_RESET_TOKEN_EXPIRED = 'PASSWORD_RESET_TOKEN_EXPIRED'; // past expiresAt
// RATE_LIMITED reused from F-1.
