import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Module-level token holder — mutated per test via beforeEach.
// The factory closure evaluates navState.token lazily (at call time), so this works safely.
const navState: { token: string | null } = { token: 'valid-reset-token' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === 'token' ? navState.token : null) }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, confirmPasswordReset: vi.fn() };
});

import * as api from '../lib/api';
import ReinitialiserMotDePasseClient from '../app/reinitialiser-mot-de-passe/ReinitialiserMotDePasseClient';

describe('ReinitialiserMotDePasseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navState.token = 'valid-reset-token';
  });

  it('shows "Lien invalide ou expiré." and back link when no token in URL', () => {
    navState.token = null;
    render(<ReinitialiserMotDePasseClient />);
    expect(screen.getByText(/Lien invalide ou expiré/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /nouveau lien/i }),
    ).toHaveAttribute('href', '/mot-de-passe-oublie');
  });

  it('shows inline error for weak password (< 8 chars)', async () => {
    const user = userEvent.setup();
    render(<ReinitialiserMotDePasseClient />);

    await user.type(screen.getByLabelText(/nouveau mot de passe/i), 'short');
    await user.type(screen.getByLabelText(/confirmer/i), 'short');
    await user.click(screen.getByRole('button', { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/au moins 8 caractères/)).toBeInTheDocument();
    });
  });

  it('shows inline error for password mismatch', async () => {
    const user = userEvent.setup();
    render(<ReinitialiserMotDePasseClient />);

    await user.type(screen.getByLabelText(/nouveau mot de passe/i), 'password123');
    await user.type(screen.getByLabelText(/confirmer/i), 'different456');
    await user.click(screen.getByRole('button', { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/ne correspondent pas/)).toBeInTheDocument();
    });
  });

  it('shows success message on valid reset', async () => {
    vi.mocked(api.confirmPasswordReset).mockResolvedValueOnce({ reset: true });
    const user = userEvent.setup();
    render(<ReinitialiserMotDePasseClient />);

    await user.type(screen.getByLabelText(/nouveau mot de passe/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirmer/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Mot de passe mis à jour — reconnectez-vous/),
      ).toBeInTheDocument();
    });
  });

  it('shows error state with back link on invalid/expired server error', async () => {
    vi.mocked(api.confirmPasswordReset).mockRejectedValueOnce({
      statusCode: 400,
      error: 'PASSWORD_RESET_TOKEN_INVALID',
      message: 'Lien invalide ou expiré.',
    });
    const user = userEvent.setup();
    render(<ReinitialiserMotDePasseClient />);

    await user.type(screen.getByLabelText(/nouveau mot de passe/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirmer/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/Lien invalide ou expiré/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /nouveau lien/i })).toBeInTheDocument();
    });
  });

  it('has a status region for accessibility on outcome', async () => {
    vi.mocked(api.confirmPasswordReset).mockResolvedValueOnce({ reset: true });
    const user = userEvent.setup();
    render(<ReinitialiserMotDePasseClient />);

    await user.type(screen.getByLabelText(/nouveau mot de passe/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirmer/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
  });
});
