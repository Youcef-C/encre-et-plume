import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import SignupForm from '../components/SignupForm';

// Stable router reference so we can assert routing behavior
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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
  needsCguReconsent: false,
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

// Field locators — password label anchored so it doesn't match "Confirmer le mot de passe"
const nameField = () => screen.getByLabelText(/nom d'affichage/i);
const emailField = () => screen.getByLabelText(/e-mail/i);
const usernameField = () => screen.getByLabelText(/nom d'utilisateur/i);
const passwordField = () => screen.getByLabelText(/^mot de passe$/i);
const confirmField = () => screen.getByLabelText(/confirmer le mot de passe/i);
const submitBtn = () => screen.getByRole('button', { name: /créer mon compte/i });
// F-13: CGU consent checkbox
const cguCheckbox = () => screen.getByRole('checkbox', { name: /j'accepte les/i });

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders five labelled fields: Nom d\'affichage, E-mail, Nom d\'utilisateur (@), Mot de passe, Confirmer', () => {
    renderForm();
    expect(nameField()).toBeInTheDocument();
    expect(emailField()).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
    expect(passwordField()).toBeInTheDocument();
    expect(confirmField()).toBeInTheDocument();
  });

  it('shows French required errors on empty submit (after accepting CGU to enable button)', async () => {
    const user = userEvent.setup();
    renderForm();

    // F-13: check CGU box to enable the submit button, then submit empty form
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    expect(await screen.findByText('Le nom est requis')).toBeInTheDocument();
    expect(await screen.findByText('E-mail requis')).toBeInTheDocument();
    expect(await screen.findByText('Mot de passe requis')).toBeInTheDocument();
  });

  it('shows "E-mail invalide" for a malformed email', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki');
    await user.type(emailField(), 'not-an-email');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password123');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    expect(await screen.findByText('E-mail invalide')).toBeInTheDocument();
  });

  it('moves focus to the first invalid field after empty submit', async () => {
    const user = userEvent.setup();
    renderForm();

    // F-13: check CGU box to enable submit
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    await waitFor(() => {
      // First error is displayName field
      expect(document.activeElement).toBe(nameField());
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

    await user.type(nameField(), 'Yuki Moreau');
    await user.type(emailField(), 'yuki@example.com');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password123');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    expect(await screen.findByText('Cet e-mail est déjà utilisé')).toBeInTheDocument();
  });

  it('disables submit button and shows "Création…" while submitting', async () => {
    // signup never resolves during this test
    vi.mocked(api.signup).mockReturnValue(new Promise(() => {}));
    mockRefresh.mockResolvedValue(mockAccount);

    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki Moreau');
    await user.type(emailField(), 'yuki@example.com');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password123');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /création/i })).toBeDisabled();
    });
  });

  // ── F-1 enhancement: username (@handle) suggestion ─────────────────────────

  it('auto-suggests the username from the display name (slugified) as the user types', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yüki Moreau');

    expect(usernameField()).toHaveValue('yuki-moreau');
  });

  it('stops auto-updating the username once the user edits it manually', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki');
    await user.clear(usernameField());
    await user.type(usernameField(), 'ma-plume');
    await user.type(nameField(), ' Moreau');

    expect(usernameField()).toHaveValue('ma-plume');
  });

  it('sends the chosen username with the signup request (and never the confirm password)', async () => {
    // signup now returns SignupResponse (no session)
    vi.mocked(api.signup).mockResolvedValueOnce({ verificationRequired: true, email: 'yuki@example.com' });
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki Moreau');
    await user.type(emailField(), 'yuki@example.com');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password123');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    await waitFor(() => {
      expect(api.signup).toHaveBeenCalledWith({
        displayName: 'Yuki Moreau',
        email: 'yuki@example.com',
        password: 'password123',
        username: 'yuki-moreau',
        acceptCgu: true,
      });
    });
  });

  it('routes to /verifier-email/envoye?email=… after successful signup (no refresh)', async () => {
    vi.mocked(api.signup).mockResolvedValueOnce({ verificationRequired: true, email: 'yuki@example.com' });
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki Moreau');
    await user.type(emailField(), 'yuki@example.com');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password123');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        '/verifier-email/envoye?email=yuki%40example.com',
      );
      // No session refresh — signup is now sessionless
      expect(mockRefresh).not.toHaveBeenCalled();
    });
  });

  it('shows an inline French format error for an invalid username', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki');
    await user.type(emailField(), 'yuki@example.com');
    await user.clear(usernameField());
    await user.type(usernameField(), 'Yü ki!');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password123');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    expect(
      await screen.findByText(/nom d'utilisateur invalide/i),
    ).toBeInTheDocument();
    expect(api.signup).not.toHaveBeenCalled();
  });

  it('maps a 409 USERNAME_TAKEN to an inline error on the username field', async () => {
    vi.mocked(api.signup).mockRejectedValueOnce({
      statusCode: 409,
      message: "Ce nom d'utilisateur est déjà pris.",
      error: 'USERNAME_TAKEN',
    });

    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki Moreau');
    await user.type(emailField(), 'yuki@example.com');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password123');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    expect(await screen.findByText("Ce nom d'utilisateur est déjà pris.")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(usernameField());
    });
  });

  // ── F-1 enhancement: double password confirmation ───────────────────────────

  it('blocks submit and shows the French mismatch error when passwords differ', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'Yuki Moreau');
    await user.type(emailField(), 'yuki@example.com');
    await user.type(passwordField(), 'password123');
    await user.type(confirmField(), 'password456');
    await user.click(cguCheckbox());
    await user.click(submitBtn());

    expect(
      await screen.findByText('Les mots de passe ne correspondent pas.'),
    ).toBeInTheDocument();
    expect(api.signup).not.toHaveBeenCalled();
  });

  // ── F-13: CGU consent checkbox ─────────────────────────────────────────────

  it('F-13: submit is disabled when CGU checkbox not checked', () => {
    renderForm();
    expect(submitBtn()).toBeDisabled();
  });

  it('F-13: checking CGU checkbox enables the submit button', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(submitBtn()).toBeDisabled();
    await user.click(cguCheckbox());
    expect(submitBtn()).not.toBeDisabled();
  });

  it('F-13: CGU label contains links to /cgu and /confidentialite (new tab)', () => {
    renderForm();
    const cguLink = screen.getByRole('link', { name: /conditions générales d'utilisation/i });
    const privacyLink = screen.getByRole('link', { name: /politique de confidentialité/i });
    expect(cguLink).toHaveAttribute('href', '/cgu');
    expect(cguLink).toHaveAttribute('target', '_blank');
    expect(privacyLink).toHaveAttribute('href', '/confidentialite');
    expect(privacyLink).toHaveAttribute('target', '_blank');
  });

  it('F-13: submitting with CGU unchecked (via Enter key) shows the inline error', async () => {
    const user = userEvent.setup();
    renderForm();
    // Simulate form submit bypass (e.g. Enter in a field) without checking CGU
    // The handleSubmit guard fires even though button is disabled (defensive)
    // Trigger via the form's submit event directly
    const form = document.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await screen.findByText('Vous devez accepter les conditions pour créer un compte.');
  });
});
