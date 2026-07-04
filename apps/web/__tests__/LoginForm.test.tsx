import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import LoginForm from '../components/LoginForm';

// Stable router reference for routing assertions
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('../lib/api', () => ({
  login: vi.fn(),
  getMe: vi.fn(),
  twoFactorVerify: vi.fn(),
}));

import * as api from '../lib/api';
// Also import twoFactorVerify for 2FA tests
const mockTwoFactorVerify = vi.fn();

const mockRefresh = vi.fn();
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SessionContext.Provider
      value={{ account: null, loading: false, refresh: mockRefresh, logout: vi.fn() }}
    >
      {children}
    </SessionContext.Provider>
  );
}

function renderForm() {
  return render(<LoginForm />, { wrapper: Wrapper });
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders E-mail, Mot de passe fields and "Se souvenir de moi" checkbox', () => {
    renderForm();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/se souvenir de moi/i)).toBeInTheDocument();
  });

  it('disables submit button and shows "Connexion…" while loading', async () => {
    vi.mocked(api.login).mockReturnValue(new Promise(() => {})); // never resolves
    mockRefresh.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connexion/i })).toBeDisabled();
    });
  });

  it('shows "Identifiants invalides" on 401 from server', async () => {
    vi.mocked(api.login).mockRejectedValueOnce({
      statusCode: 401,
      message: 'Identifiants invalides',
      error: 'INVALID_CREDENTIALS',
    });

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByText('Identifiants invalides')).toBeInTheDocument();
  });

  it('shows French validation errors on empty submit', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByText('E-mail requis')).toBeInTheDocument();
    expect(await screen.findByText('Mot de passe requis')).toBeInTheDocument();
  });

  it('renders "Mot de passe oublié ?" link to /mot-de-passe-oublie', () => {
    renderForm();
    const link = screen.getByRole('link', { name: /mot de passe oublié/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/mot-de-passe-oublie');
  });

  it('routes to /verifier-email/envoye?...reason=login on 403 EMAIL_NOT_VERIFIED', async () => {
    vi.mocked(api.login).mockRejectedValueOnce({
      statusCode: 403,
      message: 'Confirmez votre e-mail pour continuer.',
      error: 'EMAIL_NOT_VERIFIED',
    });

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        '/verifier-email/envoye?email=yuki%40example.com&reason=login',
      );
    });
    // No inline server error shown
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── 2FA login step ───────────────────────────────────────────────────────────

  it('swaps to 2FA code step when login returns twoFactorRequired', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({
      twoFactorRequired: true,
      challengeToken: 'tok-abc',
    } as never);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByLabelText(/code de vérification/i)).toBeInTheDocument();
  });

  it('2FA: submits code and redirects on success', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({
      twoFactorRequired: true,
      challengeToken: 'tok-abc',
    } as never);
    vi.mocked(api.twoFactorVerify).mockResolvedValueOnce({
      account: {
        id: 'c1', displayName: 'Yuki', email: 'yuki@example.com',
        role: 'utilisateur', verified: false, emailVerified: true,
        slug: 'yuki', avatar: null, createdAt: new Date().toISOString(),
        preferences: { theme: 'system' as const }, needsCguReconsent: false, onboarded: true,
        isAdult: true,
      },
    });
    mockRefresh.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await screen.findByLabelText(/code de vérification/i);
    await user.type(screen.getByLabelText(/code de vérification/i), '123456');
    await user.click(screen.getByRole('button', { name: /vérifier/i }));

    await waitFor(() => {
      expect(vi.mocked(api.twoFactorVerify)).toHaveBeenCalledWith({
        challengeToken: 'tok-abc',
        code: '123456',
      });
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('2FA: shows "Code invalide." on TWO_FACTOR_INVALID_CODE', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({
      twoFactorRequired: true,
      challengeToken: 'tok-abc',
    } as never);
    vi.mocked(api.twoFactorVerify).mockRejectedValueOnce({
      error: 'TWO_FACTOR_INVALID_CODE',
      message: 'Code invalide.',
    });

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await screen.findByLabelText(/code de vérification/i);
    await user.type(screen.getByLabelText(/code de vérification/i), '000000');
    await user.click(screen.getByRole('button', { name: /vérifier/i }));

    expect(await screen.findByText('Code invalide.')).toBeInTheDocument();
  });

  it('2FA: "Utiliser un code de secours" toggle relabels the field', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({
      twoFactorRequired: true,
      challengeToken: 'tok-abc',
    } as never);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await screen.findByLabelText(/code de vérification/i);
    await user.click(screen.getByRole('button', { name: /utiliser un code de secours/i }));

    expect(await screen.findByLabelText(/code de secours/i)).toBeInTheDocument();
  });

  it('2FA: TWO_FACTOR_CHALLENGE_INVALID resets to login step 1', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({
      twoFactorRequired: true,
      challengeToken: 'tok-abc',
    } as never);
    vi.mocked(api.twoFactorVerify).mockRejectedValueOnce({
      error: 'TWO_FACTOR_CHALLENGE_INVALID',
      message: 'Session expirée, reconnectez-vous.',
    });

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await screen.findByLabelText(/code de vérification/i);
    await user.type(screen.getByLabelText(/code de vérification/i), '000000');
    await user.click(screen.getByRole('button', { name: /vérifier/i }));

    // Should return to step 1 (email field visible again)
    expect(await screen.findByLabelText(/^e-mail$/i)).toBeInTheDocument();
    expect(await screen.findByText(/session expirée/i)).toBeInTheDocument();
  });

  it('non-2FA login unchanged: no code step for accounts without 2FA', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({
      account: {
        id: 'c1', displayName: 'Yuki', email: 'yuki@example.com',
        role: 'utilisateur', verified: false, emailVerified: true,
        slug: 'yuki', avatar: null, createdAt: new Date().toISOString(),
        preferences: { theme: 'system' as const }, needsCguReconsent: false, onboarded: true,
        isAdult: true,
      },
    });
    mockRefresh.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(screen.queryByLabelText(/code de vérification/i)).not.toBeInTheDocument();
  });

  it('passes rememberMe=true when checkbox is checked', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({
      account: {
        id: 'c1',
        displayName: 'Yuki',
        email: 'yuki@example.com',
        role: 'utilisateur',
        verified: false,
        emailVerified: false,
        slug: 'yuki',
        avatar: null,
        createdAt: new Date().toISOString(),
        preferences: { theme: 'system' as const },
        needsCguReconsent: false,
  onboarded: false,
        isAdult: true,
      },
    });
    mockRefresh.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByLabelText(/se souvenir de moi/i));
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(vi.mocked(api.login)).toHaveBeenCalledWith({
        email: 'yuki@example.com',
        password: 'password123',
        rememberMe: true,
      });
    });
  });
});
