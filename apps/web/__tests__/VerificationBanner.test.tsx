import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    resendVerificationEmail: vi.fn(),
  };
});

import * as api from '../lib/api';
import VerificationBanner from '../components/VerificationBanner';

const baseUnverified: AccountSummary = {
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

const baseVerified: AccountSummary = { ...baseUnverified, emailVerified: true };

function renderBanner(account: AccountSummary | null) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <VerificationBanner />
    </SessionContext.Provider>,
  );
}

describe('VerificationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders banner text when account is unverified', () => {
    renderBanner(baseUnverified);
    expect(
      screen.getByText(/Vérifiez votre adresse e-mail/),
    ).toBeInTheDocument();
  });

  it('renders "Renvoyer l\'e-mail" button when unverified', () => {
    renderBanner(baseUnverified);
    expect(screen.getByRole('button', { name: /Renvoyer l'e-mail/ })).toBeInTheDocument();
  });

  it('renders nothing when emailVerified is true', () => {
    const { container } = renderBanner(baseVerified);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when account is null', () => {
    const { container } = renderBanner(null);
    expect(container.firstChild).toBeNull();
  });

  it('shows success message after successful resend', async () => {
    vi.mocked(api.resendVerificationEmail).mockResolvedValueOnce(undefined);
    renderBanner(baseUnverified);
    await userEvent.click(screen.getByRole('button', { name: /Renvoyer l'e-mail/ }));
    await waitFor(() => expect(screen.getByText(/E-mail envoyé/)).toBeInTheDocument());
  });

  it('shows cooldown message on 429 rate-limited error', async () => {
    vi.mocked(api.resendVerificationEmail).mockRejectedValueOnce({
      statusCode: 429,
      message: 'Trop de tentatives.',
      error: 'RATE_LIMITED',
    });
    renderBanner(baseUnverified);
    await userEvent.click(screen.getByRole('button', { name: /Renvoyer l'e-mail/ }));
    await waitFor(() =>
      expect(screen.getByText(/Veuillez patienter/)).toBeInTheDocument(),
    );
  });

  it('disables button while resend is pending', async () => {
    let resolve!: () => void;
    vi.mocked(api.resendVerificationEmail).mockReturnValueOnce(
      new Promise<void>((r) => { resolve = r; }),
    );
    renderBanner(baseUnverified);
    const btn = screen.getByRole('button', { name: /Renvoyer l'e-mail/ });
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
    resolve();
  });

  it('has role="status" accessibility region', () => {
    renderBanner(baseUnverified);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
