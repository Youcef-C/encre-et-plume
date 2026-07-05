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
  // F-18 security types
  TwoFactorRequiredResponse,
  ChangeEmailRequest,
  ChangeEmailResponse,
  ConfirmEmailChangeResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  SecurityOverviewResponse,
  SessionListResponse,
  TwoFactorSetupResponse,
  TwoFactorConfirmRequest,
  TwoFactorConfirmResponse,
  TwoFactorDisableRequest,
  TwoFactorDisableResponse,
  TwoFactorVerifyRequest,
} from '@encre-et-plume/shared';

const BASE =
  (process.env.NEXT_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:3001';

// F-9/F-21: the last API response's correlation id, read from the x-request-id header
// (needs CORS `exposedHeaders: ['x-request-id']`). Enriches the bug-report context.
let lastRequestId: string | null = null;
export const getLastRequestId = (): string | null => lastRequestId;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  lastRequestId = res.headers.get('x-request-id') ?? lastRequestId;
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

export const login = (body: LoginRequest): Promise<AuthResponse | TwoFactorRequiredResponse> =>
  request<AuthResponse | TwoFactorRequiredResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });

export const logout = (): Promise<void> =>
  request<void>('/auth/logout', { method: 'POST' });

export const getMe = (): Promise<AccountSummary> =>
  request<AccountSummary>('/auth/me');

// ─── Age verification & 18+ gating (DR-10) ───────────────────────────────────
import type { UpdateBirthdateRequest } from '@encre-et-plume/shared';

export const updateMyBirthdate = (birthdate: string): Promise<AccountSummary> =>
  request<AccountSummary>('/accounts/me/birthdate', {
    method: 'PATCH',
    body: JSON.stringify({ birthdate } satisfies UpdateBirthdateRequest),
  });

import type { BirthdateResponse } from '@encre-et-plume/shared';

export const getMyBirthdate = (): Promise<BirthdateResponse> =>
  request<BirthdateResponse>('/accounts/me/birthdate');

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

// ─── Onboarding (F-17) ───────────────────────────────────────────────────────

import type { OnboardingRequest } from '@encre-et-plume/shared';

export const completeOnboarding = (body: OnboardingRequest): Promise<AccountSummary> =>
  request<AccountSummary>('/me/onboarding', { method: 'POST', body: JSON.stringify(body) });

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

// ─── Security (F-18) ─────────────────────────────────────────────────────────

export const getSecurityOverview = (): Promise<SecurityOverviewResponse> =>
  request<SecurityOverviewResponse>('/me/security/overview');

export const changeEmail = (body: ChangeEmailRequest): Promise<ChangeEmailResponse> =>
  request<ChangeEmailResponse>('/me/email', { method: 'PATCH', body: JSON.stringify(body) });

export const confirmEmailChange = (token: string): Promise<ConfirmEmailChangeResponse> =>
  request<ConfirmEmailChangeResponse>('/auth/email-change/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const changePassword = (body: ChangePasswordRequest): Promise<ChangePasswordResponse> =>
  request<ChangePasswordResponse>('/me/password', { method: 'PATCH', body: JSON.stringify(body) });

export const getSessions = (): Promise<SessionListResponse> =>
  request<SessionListResponse>('/me/sessions');

export const revokeSession = (id: string): Promise<void> =>
  request<void>(`/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const revokeOtherSessions = (): Promise<void> =>
  request<void>('/me/sessions', { method: 'DELETE' });

export const twoFactorSetup = (): Promise<TwoFactorSetupResponse> =>
  request<TwoFactorSetupResponse>('/me/2fa/setup', { method: 'POST' });

export const twoFactorConfirm = (body: TwoFactorConfirmRequest): Promise<TwoFactorConfirmResponse> =>
  request<TwoFactorConfirmResponse>('/me/2fa/confirm', { method: 'POST', body: JSON.stringify(body) });

export const twoFactorDisable = (body: TwoFactorDisableRequest): Promise<TwoFactorDisableResponse> =>
  request<TwoFactorDisableResponse>('/me/2fa/disable', { method: 'POST', body: JSON.stringify(body) });

export const twoFactorVerify = (body: TwoFactorVerifyRequest): Promise<AuthResponse> =>
  request<AuthResponse>('/auth/2fa/verify', { method: 'POST', body: JSON.stringify(body) });

// ─── Home showroom (DR-1) ────────────────────────────────────────────────────
import type {
  FeaturedWork,
  TrendingWork,
  TopCreatorsResponse,
  ScheduledRelease,
  RankingRow,
  Announcement,
} from '@encre-et-plume/shared';

export const getFeatured = (): Promise<FeaturedWork[]> =>
  request<FeaturedWork[]>('/home/featured');

export const getTrending = (): Promise<TrendingWork[]> =>
  request<TrendingWork[]>('/home/trending-this-week');

export const getTopCreators = (): Promise<TopCreatorsResponse> =>
  request<TopCreatorsResponse>('/home/top-creators');

export const getScheduledReleases = (): Promise<ScheduledRelease[]> =>
  request<ScheduledRelease[]>('/home/scheduled-releases');

export const getRankingAllTime = (): Promise<RankingRow[]> =>
  request<RankingRow[]>('/home/ranking/all-time');

export const getAnnouncements = (): Promise<Announcement[]> =>
  request<Announcement[]>('/home/announcements');

// ─── Ranking "Classement" (DR-7) ──────────────────────────────────────────────
export const getRanking = (genre?: string): Promise<RankingRow[]> =>
  request<RankingRow[]>(`/ranking/all-time${genre ? `?genre=${encodeURIComponent(genre)}` : ''}`);

// Category tabs (user-requested 2026-07-05 — replaces the genre-filter chips on /classement).
import type { RankingCategory, RankingEntry } from '@encre-et-plume/shared';

export const getRankingByCategory = (category: RankingCategory): Promise<RankingEntry[]> =>
  request<RankingEntry[]>(`/ranking?category=${encodeURIComponent(category)}`);

/** Build a srcset string from MediaVariants for responsive img rendering (no next/image). */
export function buildSrcSet(variants: MediaVariants): string {
  const parts: string[] = [];
  if (variants.thumb) parts.push(`${variants.thumb} 320w`);
  if (variants.web) parts.push(`${variants.web} 1280w`);
  return parts.join(', ');
}

// ─── Catalog "Découvrir" (DR-2) ───────────────────────────────────────────────
import type { CatalogResponse, ActiveContest, EditorPickItem } from '@encre-et-plume/shared';

export const getCatalog = (query: URLSearchParams): Promise<CatalogResponse> =>
  request<CatalogResponse>(`/catalog${query.toString() ? `?${query.toString()}` : ''}`);

export const getCatalogTrending = (): Promise<TrendingWork[]> =>
  request<TrendingWork[]>('/catalog/trending');

export const getActiveContest = (): Promise<ActiveContest | null> =>
  request<ActiveContest | null>('/contests/active');

export const getCatalogEditorPick = (): Promise<EditorPickItem[]> =>
  request<EditorPickItem[]>('/catalog/editor-pick');

// ─── Work page "Œuvre" (DR-3) ─────────────────────────────────────────────────
import type { WorkDetail, WorkChaptersResponse, PlancheDto } from '@encre-et-plume/shared';

export const getWork = (slug: string): Promise<WorkDetail> =>
  request<WorkDetail>(`/works/${encodeURIComponent(slug)}`);

export const getWorkChapters = (slug: string, page: number): Promise<WorkChaptersResponse> =>
  request<WorkChaptersResponse>(`/works/${encodeURIComponent(slug)}/chapters?page=${page}`);

export const getWorkPlanches = (slug: string): Promise<PlancheDto[]> =>
  request<PlancheDto[]>(`/works/${encodeURIComponent(slug)}/planches`);

// ─── Reader "Lecteur" (DR-4) ───────────────────────────────────────────────────
import type { ChapterPagesResponse, FavoriteWorkDto, ReadingProgressInput } from '@encre-et-plume/shared';

export const getChapterPages = (slug: string, chapterNumber: number): Promise<ChapterPagesResponse> =>
  request<ChapterPagesResponse>(`/works/${encodeURIComponent(slug)}/chapters/${chapterNumber}/pages`);

export const getMyFavorites = (): Promise<FavoriteWorkDto[]> => request<FavoriteWorkDto[]>('/me/favorites');

export const putReadingProgress = (body: ReadingProgressInput): Promise<void> =>
  request<void>('/me/reading-progress', { method: 'PUT', body: JSON.stringify(body) });

// ─── Reading history & resume (DR-11) ─────────────────────────────────────────
import type { ReadingHistoryResponse, ReadingHistoryEntry } from '@encre-et-plume/shared';

export const getReadingHistory = (page = 1): Promise<ReadingHistoryResponse> =>
  request<ReadingHistoryResponse>(`/me/reading-history?page=${page}`);

export const getReadingHistoryForWork = (slug: string): Promise<ReadingHistoryEntry> =>
  request<ReadingHistoryEntry>(`/me/reading-history/${encodeURIComponent(slug)}`);

// ─── Illustration gallery "Galerie" (DR-5) ────────────────────────────────────
import type {
  GalleryListResponse,
  GalleryFeatureCard,
  GalleryPreview,
  GalleryIllustrationCard,
  IllustrationDetail,
} from '@encre-et-plume/shared';

export const getGallery = (query: URLSearchParams): Promise<GalleryListResponse> =>
  request<GalleryListResponse>(`/illustrations${query.toString() ? `?${query.toString()}` : ''}`);

export const getGalleryTrending = (): Promise<GalleryFeatureCard[]> =>
  request<GalleryFeatureCard[]>('/illustrations/trending');

export const getGalleryPreview = (id: string): Promise<GalleryPreview> =>
  request<GalleryPreview>(`/illustrations/${encodeURIComponent(id)}/preview`);

// ─── Illustration detail "Illustration" (DR-6) ────────────────────────────────
export const getIllustration = (id: string): Promise<IllustrationDetail> =>
  request<IllustrationDetail>(`/illustrations/${encodeURIComponent(id)}`);

export const getIllustrationMore = (id: string): Promise<GalleryIllustrationCard[]> =>
  request<GalleryIllustrationCard[]>(`/illustrations/${encodeURIComponent(id)}/more`);

// ─── "Ma liste & coups de cœur" (DR-8) ────────────────────────────────────────
import type { ListItemDto, LikedWorkDto } from '@encre-et-plume/shared';

export const getMyList = (): Promise<ListItemDto[]> => request<ListItemDto[]>('/me/list');

export const getMyLikes = (): Promise<LikedWorkDto[]> => request<LikedWorkDto[]>('/me/likes');

// removeFromMyList (DELETE /me/list/:slug) removed — DR-9 B5 consolidated unsave onto the
// counter-aware DELETE /reactions/save (below), the route this wrapper called no longer exists.

// Liked/saved ILLUSTRATIONS shown alongside works in the same tabs (DR-8/DR-9 addendum).
import type { LikedIllustrationDto } from '@encre-et-plume/shared';

export const getLikedIllustrations = (): Promise<LikedIllustrationDto[]> =>
  request<LikedIllustrationDto[]>('/me/illustrations/liked');

export const getSavedIllustrations = (): Promise<LikedIllustrationDto[]> =>
  request<LikedIllustrationDto[]>('/me/illustrations/saved');

// ─── Reactions ♥/★ (DR-9) ──────────────────────────────────────────────────────
import type { ReactionTargetType, ReactionToggleRequest, ReactionToggleResponse, ReactionStateResponse } from '@encre-et-plume/shared';

export const likeReaction = (body: ReactionToggleRequest): Promise<ReactionToggleResponse> =>
  request<ReactionToggleResponse>('/reactions/like', { method: 'POST', body: JSON.stringify(body) });

export const unlikeReaction = (body: ReactionToggleRequest): Promise<ReactionToggleResponse> =>
  request<ReactionToggleResponse>('/reactions/like', { method: 'DELETE', body: JSON.stringify(body) });

export const saveReaction = (body: ReactionToggleRequest): Promise<ReactionToggleResponse> =>
  request<ReactionToggleResponse>('/reactions/save', { method: 'POST', body: JSON.stringify(body) });

export const unsaveReaction = (body: ReactionToggleRequest): Promise<ReactionToggleResponse> =>
  request<ReactionToggleResponse>('/reactions/save', { method: 'DELETE', body: JSON.stringify(body) });

export const getReactionState = (targetType: ReactionTargetType, ids: string[]): Promise<ReactionStateResponse> =>
  ids.length === 0
    ? Promise.resolve({})
    : request<ReactionStateResponse>(`/reactions/state?targetType=${targetType}&ids=${ids.map(encodeURIComponent).join(',')}`);

// ─── Support & contact (F-21) ─────────────────────────────────────────────────
import type { CreateSupportTicketRequest, CreateSupportTicketResponse } from '@encre-et-plume/shared';

export const createSupportTicket = (
  body: CreateSupportTicketRequest,
): Promise<CreateSupportTicketResponse> =>
  request<CreateSupportTicketResponse>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
