// Thin fetch wrapper — all requests use credentials:'include' for the ep_session cookie (D3).
import type {
  SignupRequest,
  LoginRequest,
  AuthResponse,
  AccountSummary,
  ApiError,
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
