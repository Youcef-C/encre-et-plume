import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import LoginForm from '../components/LoginForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../lib/api', () => ({
  login: vi.fn(),
  getMe: vi.fn(),
}));

import * as api from '../lib/api';

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
