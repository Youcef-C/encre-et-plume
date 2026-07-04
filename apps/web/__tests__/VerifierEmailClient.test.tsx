import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// Stable router reference for routing assertions
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
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
  needsCguReconsent: false,
  onboarded: false,
  isAdult: true,
};

const mockRefresh = vi.fn();

function renderPage(account: AccountSummary | null = null) {
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

  it('announces success FIRST, then redirects to POST_VERIFICATION_REDIRECT ("/onboarding") after a short delay', async () => {
    vi.mocked(api.confirmEmail).mockResolvedValueOnce({ emailVerified: true });
    renderPage();
    // The success message must be visible BEFORE the redirect fires (announced delay ~1.5s)
    await waitFor(() =>
      expect(screen.getByText(/Adresse e-mail vérifiée/)).toBeInTheDocument(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'), { timeout: 3000 });
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

  it('shows email input and "Renvoyer l\'e-mail" button on error (always, no session needed)', async () => {
    vi.mocked(api.confirmEmail).mockRejectedValueOnce({
      statusCode: 400,
      message: 'Token invalide.',
      error: 'EMAIL_TOKEN_INVALID',
    });
    renderPage(null); // no session
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /e-mail/i })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /renvoyer l'e-mail/i }),
      ).toBeInTheDocument();
    });
  });

  it('calls resendVerificationEmail with the typed email on resend', async () => {
    vi.mocked(api.confirmEmail).mockRejectedValueOnce({
      statusCode: 400,
      message: 'Token invalide.',
      error: 'EMAIL_TOKEN_INVALID',
    });
    vi.mocked(api.resendVerificationEmail).mockResolvedValueOnce({ ok: true });

    const user = userEvent.setup();
    renderPage(null);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /e-mail/i })).toBeInTheDocument(),
    );
    await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'yuki@example.com');
    await user.click(screen.getByRole('button', { name: /renvoyer l'e-mail/i }));

    await waitFor(() => {
      expect(api.resendVerificationEmail).toHaveBeenCalledWith('yuki@example.com');
    });
  });

  it('shows "E-mail envoyé." after successful resend from error state', async () => {
    vi.mocked(api.confirmEmail).mockRejectedValueOnce({
      statusCode: 400,
      message: 'Token invalide.',
      error: 'EMAIL_TOKEN_INVALID',
    });
    vi.mocked(api.resendVerificationEmail).mockResolvedValueOnce({ ok: true });

    const user = userEvent.setup();
    renderPage(null);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /e-mail/i })).toBeInTheDocument(),
    );
    await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'yuki@example.com');
    await user.click(screen.getByRole('button', { name: /renvoyer l'e-mail/i }));

    await waitFor(() => {
      expect(screen.getByText('E-mail envoyé.')).toBeInTheDocument();
    });
  });

  it('has a status region for accessibility', async () => {
    vi.mocked(api.confirmEmail).mockResolvedValueOnce({ emailVerified: true });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('status')).toBeInTheDocument(),
    );
  });

  // kept: pre-existing check — logged-in rendering still works
  it('shows email input in error state even when logged in', async () => {
    vi.mocked(api.confirmEmail).mockRejectedValueOnce({
      statusCode: 400,
      message: 'Token invalide.',
      error: 'EMAIL_TOKEN_INVALID',
    });
    renderPage(mockAccount);
    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /e-mail/i }),
      ).toBeInTheDocument();
    });
  });
});
