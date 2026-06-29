/**
 * The four platform roles (see F-2). Defined here because the account created
 * in F-1 carries `role`, defaulting to `utilisateur`.
 */
export type UserRole = 'utilisateur' | 'maintainer' | 'editor' | 'admin';
export declare const USER_ROLES: readonly UserRole[];
/** Public shape of the current account, returned by GET /auth/me, signup, and login. */
export interface AccountSummary {
    id: string;
    displayName: string;
    email: string;
    role: UserRole;
    /** Unique profile slug minted from displayName at sign-up; routes use it (e.g. /yuki-moreau). */
    slug: string;
    /** Avatar URL or null when none is set yet. */
    avatar: string | null;
    createdAt: string;
}
/** POST /auth/signup body. Credential confirmed as email/password (see plan decision D1). */
export interface SignupRequest {
    displayName: string;
    email: string;
    password: string;
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
/** Stable API error payload for inline French messages (e.g. "Identifiants invalides"). */
export interface ApiError {
    statusCode: number;
    /** French, user-facing message safe to render inline. */
    message: string;
    /** Machine-readable code for the FE to branch on (e.g. EMAIL_TAKEN, INVALID_CREDENTIALS). */
    error: string;
}
