// Thin fetch wrapper — all requests use credentials:'include' for the ep_session cookie (D3).
import type {
  SignupRequest,
  SignupResponse,
  LoginRequest,
  AuthResponse,
  AccountSummary,
  ApiError,
  ProfileResponse,
  PortfolioItemResponse,
  UpdateProfileRequest,
  UpdatePreferencesRequest,
  NotificationItem,
  UnreadCounts,
  MarkAllReadResponse,
  SearchResponse,
  SearchResultType,
  VerifyEmailConfirmRequest,
  VerifyEmailConfirmResponse,
  RequestVerificationEmailRequest,
  RequestVerificationEmailResponse,
  RequestPasswordResetRequest,
  RequestPasswordResetResponse,
  ConfirmPasswordResetRequest,
  ConfirmPasswordResetResponse,
  LegalDocumentDto,
  LegalKind,
  ConsentDto,
  ConsentResponse,
} from '@encre-et-plume/shared';

const BASE =
  (process.env.NEXT_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    // Surface the French message from ApiError when available
    const err: ApiError = await res
      .json()
      .catch(() => ({ statusCode: res.status, message: 'Erreur réseau', error: 'NETWORK_ERROR' }));
    throw err;
  }
  // 204 No Content (logout) has no body
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const signup = (body: SignupRequest): Promise<SignupResponse> =>
  request<SignupResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) });

export const login = (body: LoginRequest): Promise<AuthResponse> =>
  request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });

export const logout = (): Promise<void> =>
  request<void>('/auth/logout', { method: 'POST' });

export const getMe = (): Promise<AccountSummary> =>
  request<AccountSummary>('/auth/me');

export const getProfile = (slug: string): Promise<ProfileResponse> =>
  request<ProfileResponse>(`/profiles/${slug}`);

export const getProfilePortfolio = (slug: string): Promise<PortfolioItemResponse[]> =>
  request<PortfolioItemResponse[]>(`/profiles/${slug}/portfolio`);

export const updateMyProfile = (body: UpdateProfileRequest): Promise<ProfileResponse> =>
  request<ProfileResponse>('/profiles/me', { method: 'PATCH', body: JSON.stringify(body) });

// ─── Preferences (F-6) ───────────────────────────────────────────────────────

export const updateMyPreferences = (body: UpdatePreferencesRequest): Promise<AccountSummary> =>
  request<AccountSummary>('/accounts/me/preferences', { method: 'PATCH', body: JSON.stringify(body) });

// ─── Notifications (F-5) ─────────────────────────────────────────────────────

export const getNotifications = (): Promise<NotificationItem[]> =>
  request<NotificationItem[]>('/notifications');

export const getUnreadCounts = (): Promise<UnreadCounts> =>
  request<UnreadCounts>('/notifications/unread-counts');

export const markNotificationRead = (id: string): Promise<void> =>
  request<void>(`/notifications/${id}/read`, { method: 'POST' });

export const markAllNotificationsRead = (): Promise<MarkAllReadResponse> =>
  request<MarkAllReadResponse>('/notifications/read-all', { method: 'POST' });

// ─── Search (F-7) ────────────────────────────────────────────────────────────

export const search = (q: string, scope?: SearchResultType): Promise<SearchResponse> =>
  request<SearchResponse>(
    `/search?q=${encodeURIComponent(q)}${scope ? `&scope=${scope}` : ''}`,
  );

// ─── Email verification (F-11) ───────────────────────────────────────────────

export const resendVerificationEmail = (email: string): Promise<RequestVerificationEmailResponse> =>
  request<RequestVerificationEmailResponse>('/auth/verify-email/request', {
    method: 'POST',
    body: JSON.stringify({ email } satisfies RequestVerificationEmailRequest),
  });

export const confirmEmail = (token: string): Promise<VerifyEmailConfirmResponse> =>
  request<VerifyEmailConfirmResponse>('/auth/verify-email/confirm', {
    method: 'POST',
    body: JSON.stringify({ token } satisfies VerifyEmailConfirmRequest),
  });

// ─── Password reset (F-12) ───────────────────────────────────────────────────

export const requestPasswordReset = (body: RequestPasswordResetRequest): Promise<RequestPasswordResetResponse> =>
  request<RequestPasswordResetResponse>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const confirmPasswordReset = (body: ConfirmPasswordResetRequest): Promise<ConfirmPasswordResetResponse> =>
  request<ConfirmPasswordResetResponse>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
  });

// ─── Queue health (F-8, admin only) ──────────────────────────────────────────
import type { QueueHealthResponse } from '@encre-et-plume/shared';

export const getQueueHealth = (): Promise<QueueHealthResponse> =>
  request<QueueHealthResponse>('/admin/queues/health');

// ─── Media (F-10) ─────────────────────────────────────────────────────────────
import type {
  RequestUploadRequest,
  RequestUploadResponse,
  MediaResponse,
  SignedUrlResponse,
  MediaVariants,
  SetAvatarRequest,
} from '@encre-et-plume/shared';

export const requestUpload = (body: RequestUploadRequest): Promise<RequestUploadResponse> =>
  request<RequestUploadResponse>('/media/uploads', { method: 'POST', body: JSON.stringify(body) });

export const finalizeMedia = (id: string): Promise<MediaResponse> =>
  request<MediaResponse>(`/media/${id}/finalize`, { method: 'POST' });

export const getMedia = (id: string): Promise<MediaResponse> =>
  request<MediaResponse>(`/media/${id}`);

export const getMediaSignedUrl = (id: string): Promise<SignedUrlResponse> =>
  request<SignedUrlResponse>(`/media/${id}/url`);

export const setAvatar = (mediaId: string): Promise<AccountSummary> =>
  request<AccountSummary>('/accounts/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ mediaId } satisfies SetAvatarRequest),
  });

export const deleteAvatar = (): Promise<AccountSummary> =>
  request<AccountSummary>('/accounts/me/avatar', { method: 'DELETE' });

// ─── Privacy / RGPD (F-14) ───────────────────────────────────────────────────
import type { DataExportDto, DeleteAccountRequest, DeleteAccountResponse } from '@encre-et-plume/shared';

export const requestDataExport = (): Promise<DataExportDto> =>
  request<DataExportDto>('/me/data-export', { method: 'POST' });

export const getDataExport = (): Promise<DataExportDto> =>
  request<DataExportDto>('/me/data-export');

export const deleteAccount = (password: string): Promise<DeleteAccountResponse> =>
  request<DeleteAccountResponse>('/me/account', {
    method: 'DELETE',
    body: JSON.stringify({ password } satisfies DeleteAccountRequest),
  });

// ─── Notification preferences (F-15) ─────────────────────────────────────────
import type {
  NotificationPreferencesResponse,
  UpdateNotificationPreferencesRequest,
  UpdateNotificationPreferencesResponse,
  UnsubscribeRequest,
  UnsubscribeResponse,
} from '@encre-et-plume/shared';

export const getNotificationPreferences = (): Promise<NotificationPreferencesResponse> =>
  request<NotificationPreferencesResponse>('/me/notification-preferences');

export const updateNotificationPreferences = (changes: UpdateNotificationPreferencesRequest['changes']): Promise<UpdateNotificationPreferencesResponse> =>
  request<UpdateNotificationPreferencesResponse>('/me/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify({ changes } satisfies UpdateNotificationPreferencesRequest),
  });

export const unsubscribe = (token: string): Promise<UnsubscribeResponse> =>
  request<UnsubscribeResponse>('/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ token } satisfies UnsubscribeRequest),
  });

// ─── Legal (F-13) ────────────────────────────────────────────────────────────

export const getLegalDocument = (kind: LegalKind): Promise<LegalDocumentDto> =>
  request<LegalDocumentDto>(`/legal/${kind}`);

export const recordConsent = (body: ConsentDto): Promise<ConsentResponse> =>
  request<ConsentResponse>('/consents', { method: 'POST', body: JSON.stringify(body) });

/** Build a srcset string from MediaVariants for responsive img rendering (no next/image). */
export function buildSrcSet(variants: MediaVariants): string {
  const parts: string[] = [];
  if (variants.thumb) parts.push(`${variants.thumb} 320w`);
  if (variants.web) parts.push(`${variants.web} 1280w`);
  return parts.join(', ');
}
