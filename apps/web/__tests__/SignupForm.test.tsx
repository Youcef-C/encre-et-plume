import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import SignupForm from '../components/SignupForm';

// Mock next/navigation (router.push)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock the API module — tests control what signup resolves/rejects
vi.mock('../lib/api', () => ({
  signup: vi.fn(),
  getMe: vi.fn(),
}));

import * as api from '../lib/api';

const mockAccount: AccountSummary = {
  id: 'c1',
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

// Minimal session context provider for tests
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
  return render(<SignupForm />, { wrapper: Wrapper });
}

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders three labelled fields: Nom d\'affichage, E-mail, Mot de passe', () => {
    renderForm();
    expect(screen.getByLabelText(/nom d'affichage/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
  });

  it('shows French required errors on empty submit', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText('Le nom est requis')).toBeInTheDocument();
    expect(await screen.findByText('E-mail requis')).toBeInTheDocument();
    expect(await screen.findByText('Mot de passe requis')).toBeInTheDocument();
  });

  it('shows "E-mail invalide" for a malformed email', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/nom d'affichage/i), 'Yuki');
    await user.type(screen.getByLabelText(/e-mail/i), 'not-an-email');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText('E-mail invalide')).toBeInTheDocument();
  });

  it('moves focus to the first invalid field after empty submit', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    await waitFor(() => {
      // First error is displayName field
      expect(document.activeElement).toBe(screen.getByLabelText(/nom d'affichage/i));
    });
  });

  it('shows server EMAIL_TAKEN error message inline', async () => {
    vi.mocked(api.signup).mockRejectedValueOnce({
      statusCode: 409,
      message: 'Cet e-mail est déjà utilisé',
      error: 'EMAIL_TAKEN',
    });

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/nom d'affichage/i), 'Yuki Moreau');
    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText('Cet e-mail est déjà utilisé')).toBeInTheDocument();
  });

  it('disables submit button and shows "Création…" while submitting', async () => {
    // signup never resolves during this test
    vi.mocked(api.signup).mockReturnValue(new Promise(() => {}));
    mockRefresh.mockResolvedValue(mockAccount);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/nom d'affichage/i), 'Yuki Moreau');
    await user.type(screen.getByLabelText(/e-mail/i), 'yuki@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /création/i })).toBeDisabled();
    });
  });
});
