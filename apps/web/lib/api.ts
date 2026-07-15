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

// ─── Partner directory "Trouver un·e partenaire" (MC-1) ───────────────────────
import type { PartnersResponse, CallsResponse } from '@encre-et-plume/shared';

export const getPartners = (query: URLSearchParams): Promise<PartnersResponse> =>
  request<PartnersResponse>(`/partners${query.toString() ? `?${query.toString()}` : ''}`);

export const getCalls = (limit = 2): Promise<CallsResponse> =>
  request<CallsResponse>(`/calls?limit=${limit}`);

// ─── Appels à projets board (MC-4) ────────────────────────────────────────────
import type { CallsBoardQuery, CallsBoardResponse, CreateCallRequest, UpdateCallRequest, CallCard, CallDetail } from '@encre-et-plume/shared';

export const getCallsBoard = (query: CallsBoardQuery = {}): Promise<CallsBoardResponse> => {
  const q = new URLSearchParams();
  if (query.role) q.set('role', query.role);
  (query.genre ?? []).forEach((g) => q.append('genre', g));
  if (query.status) q.set('status', query.status);
  if (query.page) q.set('page', String(query.page));
  return request<CallsBoardResponse>(`/calls${q.toString() ? `?${q.toString()}` : ''}`);
};

// MC-4X: full call detail (GET /calls/:id) — samples gallery + PDF documents for the detail modal.
export const getCallDetail = (id: string): Promise<CallDetail> =>
  request<CallDetail>(`/calls/${encodeURIComponent(id)}`);

export const createCall = (body: CreateCallRequest): Promise<CallCard> =>
  request<CallCard>('/calls', { method: 'POST', body: JSON.stringify(body) });

// MC-7 round 3: owner call management. PATCH edits fields (open calls only); DELETE (204) removes it.
export const updateCall = (id: string, body: UpdateCallRequest): Promise<CallCard> =>
  request<CallCard>(`/calls/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteCall = (id: string): Promise<void> =>
  request<void>(`/calls/${encodeURIComponent(id)}`, { method: 'DELETE' });

// MC-4 amendment: owner ends a call early — PATCH /calls/:id { status: 'closed' }. Distinct from delete
// (delete stays blocked once an applicant is accepted; close-early is always available to the owner).
export const closeCall = (id: string): Promise<CallCard> =>
  request<CallCard>(`/calls/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'closed' }),
  });

// ─── Apply to a call "Candidater" (MC-5) ──────────────────────────────────────
import type { ApplyToCallRequest, ApplicationDto } from '@encre-et-plume/shared';

export const applyToCall = (callId: string, body: ApplyToCallRequest): Promise<ApplicationDto> =>
  request<ApplicationDto>(`/calls/${encodeURIComponent(callId)}/applications`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

// ─── Mes candidatures (MC-6) ──────────────────────────────────────────────────
import type { MyApplicationsQuery, MyApplicationsResponse, MyApplicationRow } from '@encre-et-plume/shared';

export const getMyApplications = (query: MyApplicationsQuery = {}): Promise<MyApplicationsResponse> => {
  const q = new URLSearchParams();
  if (query.status && query.status !== 'all') q.set('status', query.status);
  if (query.page && query.page > 1) q.set('page', String(query.page));
  return request<MyApplicationsResponse>(`/me/applications${q.toString() ? `?${q.toString()}` : ''}`);
};

// Withdraw a pending OR accepted application (204). Owner extension — DELETE /me/applications/:id.
export const withdrawApplication = (id: string): Promise<void> =>
  request<void>(`/me/applications/${encodeURIComponent(id)}`, { method: 'DELETE' });

// MC-6 amendment — view + edit the caller's own application.
import type { EditApplicationRequest } from '@encre-et-plume/shared';

// GET /me/applications/:id — the caller's application detail (message + all samples/documents).
export const getMyApplication = (id: string): Promise<MyApplicationRow> =>
  request<MyApplicationRow>(`/me/applications/${encodeURIComponent(id)}`);

// PATCH /me/applications/:id — edit message + samples (PENDING only server-side → 409 otherwise).
export const updateMyApplication = (id: string, body: EditApplicationRequest): Promise<MyApplicationRow> =>
  request<MyApplicationRow>(`/me/applications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

// ─── Candidatures reçues "Mes appels à projets" (MC-7) ────────────────────────
import type { ReceivedApplicationsResponse } from '@encre-et-plume/shared';

export const getReceivedApplications = (): Promise<ReceivedApplicationsResponse> =>
  request<ReceivedApplicationsResponse>('/me/calls/applications');

export const decideApplication = (
  id: string,
  status: 'accepted' | 'rejected',
): Promise<ApplicationDto> =>
  request<ApplicationDto>(`/applications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

// MC-7 amendment: owner removes an applicant regardless of status (deletes the row; frees an accepted
// seat). Owner resolved server-side from call.authorId; non-owner → 404. Distinct from "Refuser".
export const removeApplicant = (id: string): Promise<void> =>
  request<void>(`/applications/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ─── Match suggestions (MC-2) ─────────────────────────────────────────────────
import type { MatchSuggestionsResponse } from '@encre-et-plume/shared';

// Omit `limit` — the server default (4) is what the aside shows.
export const getMatchSuggestions = (limit?: number): Promise<MatchSuggestionsResponse> =>
  request<MatchSuggestionsResponse>(`/matches/suggestions${limit ? `?limit=${limit}` : ''}`);

// ─── Collaboration invitations "Proposer une collab" (MC-3) ───────────────────
import type {
  MyProjectsResponse,
  MyProjectsQuery,
  CreateInvitationRequest,
  CreateInvitationsResponse,
  InvitationDto,
  InvitationsResponse,
  InvitationDirection,
  RespondInvitationRequest,
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectWorkspaceResponse,
  UpdateProjectInfoRequest,
  UpdateProjectInfoResponse,
  CreatePageRequest,
  UpdatePageRequest,
  UpdatePageStageRequest,
  WorkspacePage,
  PageStage,
} from '@encre-et-plume/shared';

// CS-1 — "Nouveau projet" wizard (manga/histoire). The Illustration(s) type routes to publishIllustration.
export const createProject = (body: CreateProjectRequest): Promise<CreateProjectResponse> =>
  request<CreateProjectResponse>('/projects', { method: 'POST', body: JSON.stringify(body) });

// ─── CS-2 · project workspace "Espace projet" ────────────────────────────────
export const getProjectWorkspace = (slug: string): Promise<ProjectWorkspaceResponse> =>
  request<ProjectWorkspaceResponse>(`/projects/${encodeURIComponent(slug)}`);

export const updateProjectInfo = (
  slug: string,
  body: UpdateProjectInfoRequest,
): Promise<UpdateProjectInfoResponse> =>
  request<UpdateProjectInfoResponse>(`/projects/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const createPage = (slug: string, body: CreatePageRequest): Promise<WorkspacePage> =>
  request<WorkspacePage>(`/projects/${encodeURIComponent(slug)}/pages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updatePage = (id: string, body: UpdatePageRequest): Promise<WorkspacePage> =>
  request<WorkspacePage>(`/pages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deletePage = (id: string): Promise<void> =>
  request<void>(`/pages/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const updatePageStage = (id: string, stage: PageStage): Promise<WorkspacePage> =>
  request<WorkspacePage>(`/pages/${encodeURIComponent(id)}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stage } satisfies UpdatePageStageRequest),
  });

// ─── CS-2 card-modal extension: detail, labels, checklist, comments ────────────
import type {
  PageDetailResponse,
  ProjectLabelItem,
  CreateLabelRequest,
  UpdateLabelRequest,
  PageChecklistItemDto,
  CreateChecklistItemRequest,
  UpdateChecklistItemRequest,
  PageCommentItem,
  CreatePageCommentRequest,
  UpdatePageCommentRequest,
} from '@encre-et-plume/shared';

export const getPageDetail = (id: string): Promise<PageDetailResponse> =>
  request<PageDetailResponse>(`/pages/${encodeURIComponent(id)}`);

export const getProjectLabels = (slug: string): Promise<ProjectLabelItem[]> =>
  request<ProjectLabelItem[]>(`/projects/${encodeURIComponent(slug)}/labels`);

export const createProjectLabel = (slug: string, body: CreateLabelRequest): Promise<ProjectLabelItem> =>
  request<ProjectLabelItem>(`/projects/${encodeURIComponent(slug)}/labels`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateProjectLabel = (id: string, body: UpdateLabelRequest): Promise<ProjectLabelItem> =>
  request<ProjectLabelItem>(`/labels/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteProjectLabel = (id: string): Promise<void> =>
  request<void>(`/labels/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const addChecklistItem = (pageId: string, body: CreateChecklistItemRequest): Promise<PageChecklistItemDto> =>
  request<PageChecklistItemDto>(`/pages/${encodeURIComponent(pageId)}/checklist`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateChecklistItem = (itemId: string, body: UpdateChecklistItemRequest): Promise<PageChecklistItemDto> =>
  request<PageChecklistItemDto>(`/checklist/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteChecklistItem = (itemId: string): Promise<void> =>
  request<void>(`/checklist/${encodeURIComponent(itemId)}`, { method: 'DELETE' });

export const addPageComment = (pageId: string, body: CreatePageCommentRequest): Promise<PageCommentItem> =>
  request<PageCommentItem>(`/pages/${encodeURIComponent(pageId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updatePageComment = (id: string, body: UpdatePageCommentRequest): Promise<PageCommentItem> =>
  request<PageCommentItem>(`/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deletePageComment = (id: string): Promise<void> =>
  request<void>(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ─── CS-3 · project assets (versioned files) ─────────────────────────────────
import type {
  AssetItem,
  AssetListQuery,
  AssetListResponse,
  CreateAssetRequest,
  CreateAssetFromUrlRequest,
  AddAssetVersionRequest,
  AssetVersionItem,
  AssetPreviewResponse,
  LinkAssetRequest,
} from '@encre-et-plume/shared';

export const listProjectAssets = (slug: string, q: AssetListQuery = {}): Promise<AssetListResponse> => {
  const p = new URLSearchParams();
  if (q.type) p.set('type', q.type);
  if (q.pageId) p.set('pageId', q.pageId);
  if (q.q) p.set('q', q.q);
  if (q.sort && q.sort !== 'recent') p.set('sort', q.sort);
  if (q.page && q.page > 1) p.set('page', String(q.page));
  const qs = p.toString();
  return request<AssetListResponse>(`/projects/${encodeURIComponent(slug)}/assets${qs ? `?${qs}` : ''}`);
};

export const createProjectAsset = (slug: string, body: CreateAssetRequest): Promise<AssetItem> =>
  request<AssetItem>(`/projects/${encodeURIComponent(slug)}/assets`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const createProjectAssetFromUrl = (
  slug: string,
  body: CreateAssetFromUrlRequest,
): Promise<AssetItem> =>
  request<AssetItem>(`/projects/${encodeURIComponent(slug)}/assets/from-url`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const addAssetVersion = (
  slug: string,
  assetId: string,
  body: AddAssetVersionRequest,
): Promise<AssetItem> =>
  request<AssetItem>(`/projects/${encodeURIComponent(slug)}/assets/${encodeURIComponent(assetId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getAssetVersions = (assetId: string): Promise<AssetVersionItem[]> =>
  request<AssetVersionItem[]>(`/assets/${encodeURIComponent(assetId)}/versions`);

export const getAssetPreview = (assetId: string): Promise<AssetPreviewResponse> =>
  request<AssetPreviewResponse>(`/assets/${encodeURIComponent(assetId)}/preview`);

// Repoint the asset's active/current version to an existing version (member-gated). Returns the
// refreshed AssetItem — currentVersion/size follow the switch, so the card/grid/badge re-derive.
export const setAssetActiveVersion = (assetId: string, version: number): Promise<AssetItem> =>
  request<AssetItem>(`/assets/${encodeURIComponent(assetId)}/active-version`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });

export const linkAssetToPage = (assetId: string, body: LinkAssetRequest): Promise<AssetItem> =>
  request<AssetItem>(`/assets/${encodeURIComponent(assetId)}/link`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

// Detach an asset from ONE card (member-gated, per-card unlink). Returns the refreshed AssetItem —
// its other cards keep the link (linkedPages drops only this pageId).
export const unlinkAssetFromPage = (assetId: string, pageId: string): Promise<AssetItem> =>
  request<AssetItem>(
    `/assets/${encodeURIComponent(assetId)}/link?pageId=${encodeURIComponent(pageId)}`,
    { method: 'DELETE' },
  );

// Hard-delete an asset + its whole version chain (member-gated). 204, no body.
export const deleteAsset = (assetId: string): Promise<void> =>
  request<void>(`/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });

// No-arg call keeps hitting the legacy picker mode (MC-3 InviteModal / MC-4 PostCallModal, unchanged).
// The CS-12 dashboard passes { scope: 'all', q, status, page } for the merged projects+collections list.
export const getMyProjects = (params?: MyProjectsQuery): Promise<MyProjectsResponse> => {
  if (!params) return request<MyProjectsResponse>('/projects/mine');
  const p = new URLSearchParams();
  if (params.scope) p.set('scope', params.scope);
  if (params.q) p.set('q', params.q);
  if (params.status && params.status !== 'tous') p.set('status', params.status);
  if (params.type && params.type !== 'tous') p.set('type', params.type);
  if (params.page && params.page > 1) p.set('page', String(params.page));
  const qs = p.toString();
  return request<MyProjectsResponse>(`/projects/mine${qs ? `?${qs}` : ''}`);
};

export const createInvitation = (
  body: CreateInvitationRequest,
): Promise<CreateInvitationsResponse> =>
  request<CreateInvitationsResponse>('/invitations', { method: 'POST', body: JSON.stringify(body) });

export const listInvitations = (
  direction: InvitationDirection,
  page?: number,
  pageSize?: number,
): Promise<InvitationsResponse> => {
  const q = new URLSearchParams({ direction });
  if (page) q.set('page', String(page));
  if (pageSize) q.set('pageSize', String(pageSize));
  return request<InvitationsResponse>(`/invitations?${q.toString()}`);
};

export const respondInvitation = (
  id: string,
  status: RespondInvitationRequest['status'],
): Promise<InvitationDto> =>
  request<InvitationDto>(`/invitations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status } satisfies RespondInvitationRequest),
  });

// ─── Contacts & connexions (MC-8) ─────────────────────────────────────────────
import type {
  ContactsResponse,
  ConnectionRequestsResponse,
  ConnectionRequestDirection,
  CreateConnectionRequestBody,
  DecideConnectionRequestBody,
  ConnectionRequestDto,
  ConnectionSuggestionsResponse,
  PeopleSearchResponse,
  PresenceResponse,
} from '@encre-et-plume/shared';

export const getContacts = (): Promise<ContactsResponse> =>
  request<ContactsResponse>('/contacts');

export const removeContact = (userId: string): Promise<void> =>
  request<void>(`/contacts/${encodeURIComponent(userId)}`, { method: 'DELETE' });

export const getConnectionRequests = (
  direction?: ConnectionRequestDirection,
): Promise<ConnectionRequestsResponse> =>
  request<ConnectionRequestsResponse>(
    `/connections/requests${direction === 'outgoing' ? '?direction=outgoing' : ''}`,
  );

export const sendConnectionRequest = (toUser: string): Promise<ConnectionRequestDto> =>
  request<ConnectionRequestDto>('/connections/requests', {
    method: 'POST',
    body: JSON.stringify({ toUser } satisfies CreateConnectionRequestBody),
  });

// MC-8 (D12): withdraw the viewer's pending outgoing request to a target user.
export const withdrawConnectionRequest = (userId: string): Promise<void> =>
  request<void>(`/connections/requests/sent/${encodeURIComponent(userId)}`, { method: 'DELETE' });

export const decideConnectionRequest = (
  id: string,
  status: DecideConnectionRequestBody['status'],
): Promise<ConnectionRequestDto> =>
  request<ConnectionRequestDto>(`/connections/requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status } satisfies DecideConnectionRequestBody),
  });

export const getConnectionSuggestions = (): Promise<ConnectionSuggestionsResponse> =>
  request<ConnectionSuggestionsResponse>('/connections/suggestions');

export const searchPeople = (q: string): Promise<PeopleSearchResponse> =>
  request<PeopleSearchResponse>(`/people/search?q=${encodeURIComponent(q)}`);

export const getPresence = (userIds: string[]): Promise<PresenceResponse> =>
  userIds.length === 0
    ? Promise.resolve({ items: [] })
    : request<PresenceResponse>(`/presence?userIds=${userIds.map(encodeURIComponent).join(',')}`);

// ─── Messaging (MC-9) ─────────────────────────────────────────────────────────
import type {
  ConversationsResponse,
  MessagesPage,
  MessageDto,
  SendMessageRequest,
  CreateConversationRequest,
  ConversationItem,
  ConversationRequestAction,
  MarkReadResponse,
} from '@encre-et-plume/shared';

// MC-9 delta: `filter=requests` returns the viewer's incoming pending DM requests (Demandes tab).
export const getConversations = (
  cursor?: string,
  filter?: 'requests',
): Promise<ConversationsResponse> => {
  const q = new URLSearchParams();
  if (cursor) q.set('cursor', cursor);
  if (filter) q.set('filter', filter);
  return request<ConversationsResponse>(`/conversations${q.toString() ? `?${q}` : ''}`);
};

// MC-9 delta: recipient accepts/declines a DM request → PATCH /conversations/:id/request.
export const respondConversationRequest = (
  conversationId: string,
  action: ConversationRequestAction,
): Promise<ConversationItem> =>
  request<ConversationItem>(`/conversations/${encodeURIComponent(conversationId)}/request`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });

export const getMessages = (conversationId: string, cursor?: string): Promise<MessagesPage> =>
  request<MessagesPage>(
    `/conversations/${encodeURIComponent(conversationId)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  );

export const sendMessage = (conversationId: string, body: SendMessageRequest): Promise<MessageDto> =>
  request<MessageDto>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const createConversation = (body: CreateConversationRequest): Promise<ConversationItem> =>
  request<ConversationItem>('/conversations', { method: 'POST', body: JSON.stringify(body) });

export const markConversationRead = (conversationId: string): Promise<MarkReadResponse> =>
  request<MarkReadResponse>(`/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST' });

// ─── MC-12 group management (standalone groups) ─────────────────────────────────
export const addGroupParticipant = (conversationId: string, accountId: string): Promise<ConversationItem> =>
  request<ConversationItem>(`/conversations/${encodeURIComponent(conversationId)}/participants`, {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });

export const removeGroupParticipant = (conversationId: string, accountId: string): Promise<ConversationItem> =>
  request<ConversationItem>(
    `/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(accountId)}`,
    { method: 'DELETE' },
  );

export const leaveGroup = (conversationId: string): Promise<void> =>
  request<void>(`/conversations/${encodeURIComponent(conversationId)}/participants/me`, { method: 'DELETE' });

// ─── Salon "Le Comptoir" (MC-11) ────────────────────────────────────────────────
import type {
  SalonSummary,
  SalonMessagesPage,
  SalonMessageDto,
  SalonMembershipResponse,
  SalonOnlineResponse,
  SalonPresenceResponse,
  AccountSearchResponse,
} from '@encre-et-plume/shared';

export const getSalon = (): Promise<SalonSummary> => request<SalonSummary>('/salon');

// MC-13: the live Comptoir room roster (who is currently in the room).
export const getSalonPresence = (): Promise<SalonPresenceResponse> =>
  request<SalonPresenceResponse>('/salon/presence');

// MC-13: reachable-user search for both group pickers (contacts OR dmPolicy ∈ {anyone, requests}).
export const searchAccounts = (q: string): Promise<AccountSearchResponse> =>
  request<AccountSearchResponse>(`/accounts/search?q=${encodeURIComponent(q)}`);

export const getSalonMessages = (cursor?: string): Promise<SalonMessagesPage> =>
  request<SalonMessagesPage>(`/salon/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);

export const getSalonOnline = (): Promise<SalonOnlineResponse> =>
  request<SalonOnlineResponse>('/salon/online');

export const joinSalon = (): Promise<SalonMembershipResponse> =>
  request<SalonMembershipResponse>('/salon/join', { method: 'POST' });

export const leaveSalon = (): Promise<SalonMembershipResponse> =>
  request<SalonMembershipResponse>('/salon/leave', { method: 'POST' });

export const sendSalonMessage = (body: string): Promise<SalonMessageDto> =>
  request<SalonMessageDto>('/salon/messages', { method: 'POST', body: JSON.stringify({ body }) });

export const markSalonRead = (): Promise<MarkReadResponse> =>
  request<MarkReadResponse>('/salon/read', { method: 'POST' });

// ─── Blocks & mute (MC-10) ─────────────────────────────────────────────────────
import type { BlockKind, BlockDto, BlocksResponse, CreateBlockRequest } from '@encre-et-plume/shared';

export const getMyBlocks = (): Promise<BlocksResponse> => request<BlocksResponse>('/me/blocks');

export const createBlock = (body: CreateBlockRequest): Promise<BlockDto> =>
  request<BlockDto>('/me/blocks', { method: 'POST', body: JSON.stringify(body) });

export const deleteBlock = (userId: string, kind: BlockKind): Promise<void> =>
  request<void>(`/me/blocks/${encodeURIComponent(userId)}?kind=${kind}`, { method: 'DELETE' });

// ─── Illustration collections "Collection" (DR-12) ────────────────────────────
import type {
  CollectionSummary,
  CollectionDetail,
  CollectionsListResponse,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  ReorderCollectionRequest,
  AddCollectionIllustrationRequest,
  ProfileCollectionsResponse,
  PublishIllustrationRequest,
  PublishIllustrationResponse,
  UpdateIllustrationRequest,
} from '@encre-et-plume/shared';

export const createCollection = (body: CreateCollectionRequest): Promise<CollectionSummary> =>
  request<CollectionSummary>('/collections', { method: 'POST', body: JSON.stringify(body) });

export const getMyCollections = (): Promise<CollectionSummary[]> =>
  request<CollectionSummary[]>('/collections/mine');

export const getCollection = (idOrSlug: string): Promise<CollectionDetail> =>
  request<CollectionDetail>(`/collections/${encodeURIComponent(idOrSlug)}`);

export const updateCollection = (id: string, body: UpdateCollectionRequest): Promise<CollectionDetail> =>
  request<CollectionDetail>(`/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteCollection = (id: string): Promise<void> =>
  request<void>(`/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const addCollectionIllustration = (id: string, illustrationId: string): Promise<CollectionDetail> =>
  request<CollectionDetail>(`/collections/${encodeURIComponent(id)}/illustrations`, {
    method: 'POST',
    body: JSON.stringify({ illustrationId } satisfies AddCollectionIllustrationRequest),
  });

export const removeCollectionIllustration = (id: string, illustrationId: string): Promise<void> =>
  request<void>(`/collections/${encodeURIComponent(id)}/illustrations/${encodeURIComponent(illustrationId)}`, {
    method: 'DELETE',
  });

export const reorderCollection = (id: string, illustrationIds: string[]): Promise<CollectionDetail> =>
  request<CollectionDetail>(`/collections/${encodeURIComponent(id)}/order`, {
    method: 'PATCH',
    body: JSON.stringify({ illustrationIds } satisfies ReorderCollectionRequest),
  });

export const publishIllustration = (body: PublishIllustrationRequest): Promise<PublishIllustrationResponse> =>
  request<PublishIllustrationResponse>('/illustrations', { method: 'POST', body: JSON.stringify(body) });

export const getMyIllustrations = (): Promise<GalleryIllustrationCard[]> =>
  request<GalleryIllustrationCard[]>('/illustrations/mine');

export const getProfileCollections = (slug: string): Promise<ProfileCollectionsResponse> =>
  request<ProfileCollectionsResponse>(`/profiles/${encodeURIComponent(slug)}/collections`);

// DR-12 iter2 FE-8 — public "Collections" facet of the Galerie (q/tags/genre/page → collection cards).
export const getCollectionsList = (params: URLSearchParams): Promise<CollectionsListResponse> =>
  request<CollectionsListResponse>(`/collections?${params.toString()}`);

// DR-12 iter3 FE-13 — owner-only illustration edit (partial: title/category/description/hashtags/
// tools/license/visibility). Returns the full updated IllustrationDetail (D20).
export const updateIllustration = (
  id: string,
  body: UpdateIllustrationRequest,
): Promise<IllustrationDetail> =>
  request<IllustrationDetail>(`/illustrations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteIllustration = (id: string): Promise<void> =>
  request<void>(`/illustrations/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ─── Collaborative scenario editor "Éditeur" (CS-4) ───────────────────────────
import type {
  EditorDocumentResponse,
  AutosaveDocumentRequest,
  AutosaveDocumentResponse,
  SnapshotVersionRequest,
  SnapshotVersionResponse,
  CaseCommentDto,
  CreateCaseCommentRequest,
  DeleteCaseCommentResponse,
  SharePageResponse,
} from '@encre-et-plume/shared';

// D9 — an optional `?asset=<id>` overrides the card's default linked scenario so the file dropdown /
// CardModal "Éditer" / import can open a CHOSEN scenario/texte asset into the editor.
const assetQuery = (assetId?: string) => (assetId ? `?asset=${encodeURIComponent(assetId)}` : '');

export const getEditorDocument = (pageId: string, assetId?: string): Promise<EditorDocumentResponse> =>
  request<EditorDocumentResponse>(`/pages/${encodeURIComponent(pageId)}/document${assetQuery(assetId)}`);

export const autosaveEditorDocument = (
  pageId: string,
  body: AutosaveDocumentRequest,
  assetId?: string,
): Promise<AutosaveDocumentResponse> =>
  request<AutosaveDocumentResponse>(`/pages/${encodeURIComponent(pageId)}/document${assetQuery(assetId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const snapshotEditorVersion = (
  pageId: string,
  body: SnapshotVersionRequest,
  assetId?: string,
): Promise<SnapshotVersionResponse> =>
  request<SnapshotVersionResponse>(`/pages/${encodeURIComponent(pageId)}/document/versions${assetQuery(assetId)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const addCaseComment = (
  pageId: string,
  caseNo: number,
  body: CreateCaseCommentRequest,
  assetId?: string,
): Promise<CaseCommentDto> =>
  request<CaseCommentDto>(`/pages/${encodeURIComponent(pageId)}/cases/${caseNo}/comments${assetQuery(assetId)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

// CS-15 — author-only delete of a scenario comment (same `?asset=` override the editor opened with).
export const deleteCaseComment = (
  pageId: string,
  commentId: string,
  assetId?: string,
): Promise<DeleteCaseCommentResponse> =>
  request<DeleteCaseCommentResponse>(
    `/pages/${encodeURIComponent(pageId)}/document/comments/${encodeURIComponent(commentId)}${assetQuery(assetId)}`,
    { method: 'DELETE' },
  );

export const sharePage = (pageId: string): Promise<SharePageResponse> =>
  request<SharePageResponse>(`/pages/${encodeURIComponent(pageId)}/share`, { method: 'POST' });

// ─── CS-5 Révision & corrections ──────────────────────────────────────────────
import type {
  ReviewPayload,
  CorrectionDto,
  CreateCorrectionRequest,
  UpdateCorrectionRequest,
  CorrectionListQuery,
  CorrectionListResponse,
  ValidateReviewResponse,
} from '@encre-et-plume/shared';

// Two-version review payload. `file` picks the reviewed asset; `from`/`to` override the auto-picked
// filedAgainstVersion↔head pair. All params optional (server auto-selects).
export const getReview = (
  pageId: string,
  opts?: { file?: string; from?: number; to?: number },
): Promise<ReviewPayload> => {
  const q = new URLSearchParams();
  if (opts?.file) q.set('file', opts.file);
  if (opts?.from != null) q.set('from', String(opts.from));
  if (opts?.to != null) q.set('to', String(opts.to));
  const qs = q.toString();
  return request<ReviewPayload>(`/pages/${encodeURIComponent(pageId)}/review${qs ? `?${qs}` : ''}`);
};

export const createCorrection = (pageId: string, body: CreateCorrectionRequest): Promise<CorrectionDto> =>
  request<CorrectionDto>(`/pages/${encodeURIComponent(pageId)}/corrections`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const listCorrections = (pageId: string, query?: CorrectionListQuery): Promise<CorrectionListResponse> => {
  const q = new URLSearchParams();
  if (query?.type) q.set('type', query.type);
  if (query?.status) q.set('status', query.status);
  if (query?.page != null) q.set('page', String(query.page));
  const qs = q.toString();
  return request<CorrectionListResponse>(
    `/pages/${encodeURIComponent(pageId)}/corrections${qs ? `?${qs}` : ''}`,
  );
};

export const updateCorrection = (id: string, body: UpdateCorrectionRequest): Promise<CorrectionDto> =>
  request<CorrectionDto>(`/corrections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteCorrection = (id: string): Promise<void> =>
  request<void>(`/corrections/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const validateReview = (pageId: string): Promise<ValidateReviewResponse> =>
  request<ValidateReviewResponse>(`/pages/${encodeURIComponent(pageId)}/review/validate`, { method: 'POST' });

// ─── Support & contact (F-21) ─────────────────────────────────────────────────
import type { CreateSupportTicketRequest, CreateSupportTicketResponse } from '@encre-et-plume/shared';

export const createSupportTicket = (
  body: CreateSupportTicketRequest,
): Promise<CreateSupportTicketResponse> =>
  request<CreateSupportTicketResponse>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
