import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stable router reference for routing assertions
const mockPush = vi.hoisted(() => vi.fn());

// Mutable search-params so we can vary per test
const searchParamsState = vi.hoisted(() => ({ email: 'test@example.com', reason: null as string | null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (k: string) => {
      if (k === 'email') return searchParamsState.email;
      if (k === 'reason') return searchParamsState.reason;
      return null;
    },
  }),
}));

vi.mock('../lib/api', () => ({
  resendVerificationEmail: vi.fn(),
}));

import * as api from '../lib/api';
import EnvoyeClient from '../app/verifier-email/envoye/EnvoyeClient';

describe('EnvoyeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.email = 'test@example.com';
    searchParamsState.reason = null;
  });

  it('renders the "Vérifiez votre e-mail" heading', () => {
    render(<EnvoyeClient />);
    expect(
      screen.getByRole('heading', { name: /vérifiez votre e-mail/i }),
    ).toBeInTheDocument();
  });

  it('shows the email from the query param in the body copy', () => {
    render(<EnvoyeClient />);
    expect(screen.getByText(/Un lien de confirmation vous a été envoyé à/)).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('does NOT show the login message when reason is absent', () => {
    render(<EnvoyeClient />);
    expect(
      screen.queryByText(/Confirmez votre e-mail pour continuer/),
    ).not.toBeInTheDocument();
  });

  it('shows "Confirmez votre e-mail pour continuer." when reason=login', () => {
    searchParamsState.reason = 'login';
    render(<EnvoyeClient />);
    expect(
      screen.getByText(/Confirmez votre e-mail pour continuer/),
    ).toBeInTheDocument();
  });

  it('renders "Retour à la connexion" link pointing to /connexion', () => {
    render(<EnvoyeClient />);
    const link = screen.getByRole('link', { name: /retour à la connexion/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/connexion');
  });

  it('renders a "Renvoyer l\'e-mail" button in the idle state', () => {
    render(<EnvoyeClient />);
    expect(
      screen.getByRole('button', { name: /renvoyer l'e-mail/i }),
    ).toBeInTheDocument();
  });

  it('calls resendVerificationEmail with the email on button click', async () => {
    vi.mocked(api.resendVerificationEmail).mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<EnvoyeClient />);

    await user.click(screen.getByRole('button', { name: /renvoyer l'e-mail/i }));

    await waitFor(() => {
      expect(api.resendVerificationEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('shows "E-mail envoyé." after successful resend', async () => {
    vi.mocked(api.resendVerificationEmail).mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<EnvoyeClient />);

    await user.click(screen.getByRole('button', { name: /renvoyer l'e-mail/i }));

    await waitFor(() => {
      expect(screen.getByText('E-mail envoyé.')).toBeInTheDocument();
    });
  });

  it('shows cooldown message on 429 rate-limited error', async () => {
    vi.mocked(api.resendVerificationEmail).mockRejectedValueOnce({
      statusCode: 429,
      message: 'Trop de tentatives.',
      error: 'RATE_LIMITED',
    });
    const user = userEvent.setup();
    render(<EnvoyeClient />);

    await user.click(screen.getByRole('button', { name: /renvoyer l'e-mail/i }));

    await waitFor(() => {
      expect(screen.getByText(/Veuillez patienter avant de renvoyer/)).toBeInTheDocument();
    });
  });

  it('has a role="status" aria-live region for resend feedback', () => {
    render(<EnvoyeClient />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
