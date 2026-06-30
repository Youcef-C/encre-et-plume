// Thin fetch wrapper — all requests use credentials:'include' for the ep_session cookie (D3).
import type {
  SignupRequest,
  LoginRequest,
  AuthResponse,
  AccountSummary,
  ApiError,
  ProfileResponse,
  PortfolioItemResponse,
  UpdateProfileRequest,
  NotificationItem,
  UnreadCounts,
  MarkAllReadResponse,
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

export const signup = (body: SignupRequest): Promise<AuthResponse> =>
  request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) });

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

// ─── Notifications (F-5) ─────────────────────────────────────────────────────

export const getNotifications = (): Promise<NotificationItem[]> =>
  request<NotificationItem[]>('/notifications');

export const getUnreadCounts = (): Promise<UnreadCounts> =>
  request<UnreadCounts>('/notifications/unread-counts');

export const markNotificationRead = (id: string): Promise<void> =>
  request<void>(`/notifications/${id}/read`, { method: 'POST' });

export const markAllNotificationsRead = (): Promise<MarkAllReadResponse> =>
  request<MarkAllReadResponse>('/notifications/read-all', { method: 'POST' });
