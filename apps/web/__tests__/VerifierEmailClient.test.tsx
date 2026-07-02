import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === 'token' ? 'test-token-abc' : null) }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    confirmEmail: vi.fn(),
    resendVerificationEmail: vi.fn(),
  };
});

import * as api from '../lib/api';
import VerifierEmailClient from '../app/verifier-email/VerifierEmailClient';

const mockAccount: AccountSummary = {
  id: 'u1',
  displayName: 'Yuki Moreau',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  emailVerified: false,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
};

const mockRefresh = vi.fn();

function renderPage(account: AccountSummary | null = mockAccount) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: mockRefresh, logout: vi.fn() }}
    >
      <VerifierEmailClient />
    </SessionContext.Provider>,
  );
}

describe('VerifierEmailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefresh.mockResolvedValue(undefined);
  });

  it('shows success "Adresse e-mail vérifiée !" when confirmEmail resolves', async () => {
    vi.mocked(api.confirmEmail).mockResolvedValueOnce({ emailVerified: true });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Adresse e-mail vérifiée/)).toBeInTheDocument(),
    );
  });

  it('calls session.refresh() after successful confirmation', async () => {
    vi.mocked(api.confirmEmail).mockResolvedValueOnce({ emailVerified: true });
    renderPage();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('shows error "Lien invalide ou expiré." when confirmEmail rejects', async () => {
    vi.mocked(api.confirmEmail).mockRejectedValueOnce({
      statusCode: 400,
      message: 'Token invalide.',
      error: 'EMAIL_TOKEN_INVALID',
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Lien invalide ou expiré/)).toBeInTheDocument(),
    );
  });

  it('shows "Renvoyer l\'e-mail" on error when logged in', async () => {
    vi.mocked(api.confirmEmail).mockRejectedValueOnce({
      statusCode: 400,
      message: 'Token invalide.',
      error: 'EMAIL_TOKEN_INVALID',
    });
    renderPage(mockAccount);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Renvoyer l'e-mail/ })).toBeInTheDocument(),
    );
  });

  it('does not show "Renvoyer l\'e-mail" on error when not logged in', async () => {
    vi.mocked(api.confirmEmail).mockRejectedValueOnce({
      statusCode: 400,
      message: 'Token invalide.',
      error: 'EMAIL_TOKEN_INVALID',
    });
    renderPage(null);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Renvoyer l'e-mail/ })).not.toBeInTheDocument(),
    );
  });

  it('has a status region for accessibility', async () => {
    vi.mocked(api.confirmEmail).mockResolvedValueOnce({ emailVerified: true });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('status')).toBeInTheDocument(),
    );
  });
});
