import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecurityIdentifiants from '../components/security/SecurityIdentifiants';

vi.mock('../lib/api', () => ({
  getSecurityOverview: vi.fn(),
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
}));

import * as api from '../lib/api';

function setup() {
  vi.mocked(api.getSecurityOverview).mockResolvedValue({
    twoFactorEnabled: false,
    pendingEmail: null,
  });
}

describe('SecurityIdentifiants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('renders both sub-form headings', async () => {
    render(<SecurityIdentifiants />);
    expect(await screen.findByText(/modifier l'adresse e-mail/i)).toBeInTheDocument();
    expect(screen.getByText(/modifier le mot de passe/i)).toBeInTheDocument();
  });

  it('shows pending email from overview on mount', async () => {
    vi.mocked(api.getSecurityOverview).mockResolvedValue({
      twoFactorEnabled: false,
      pendingEmail: 'new@example.com',
    });
    render(<SecurityIdentifiants />);
    expect(
      await screen.findByText(/en attente de confirmation/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/new@example\.com/)).toBeInTheDocument();
  });

  it('email form: shows success pending state after changeEmail', async () => {
    vi.mocked(api.changeEmail).mockResolvedValue({ pendingEmail: 'next@example.com' });
    const user = userEvent.setup();
    render(<SecurityIdentifiants />);
    await screen.findByText(/modifier l'adresse e-mail/i);

    // Scope to the email form to avoid label clashes with the password form
    const emailForm = screen.getByRole('form', { name: /modifier l'adresse e-mail/i });
    await user.type(within(emailForm).getByLabelText(/nouvelle adresse e-mail/i), 'next@example.com');
    await user.type(within(emailForm).getByLabelText(/mot de passe actuel/i), 'secret123');
    await user.click(within(emailForm).getByRole('button', { name: /enregistrer.*e-mail/i }));

    expect(await screen.findByText(/en attente de confirmation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/next@example\.com/).length).toBeGreaterThan(0);
  });

  it('email form: shows "Mot de passe incorrect." on INVALID_PASSWORD', async () => {
    vi.mocked(api.changeEmail).mockRejectedValue({
      error: 'INVALID_PASSWORD',
      message: 'Mot de passe incorrect.',
    });
    const user = userEvent.setup();
    render(<SecurityIdentifiants />);
    await screen.findByText(/modifier l'adresse e-mail/i);

    const emailForm = screen.getByRole('form', { name: /modifier l'adresse e-mail/i });
    await user.type(within(emailForm).getByLabelText(/nouvelle adresse e-mail/i), 'next@example.com');
    await user.type(within(emailForm).getByLabelText(/mot de passe actuel/i), 'wrong');
    await user.click(within(emailForm).getByRole('button', { name: /enregistrer.*e-mail/i }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
  });

  it('password form: client-side mismatch blocks submit', async () => {
    const user = userEvent.setup();
    render(<SecurityIdentifiants />);
    await screen.findByText(/modifier le mot de passe/i);

    const pwForm = screen.getByRole('form', { name: /modifier le mot de passe/i });
    await user.type(within(pwForm).getByLabelText(/mot de passe actuel/i), 'oldPass1');
    await user.type(within(pwForm).getByLabelText('Nouveau mot de passe'), 'newPass1!');
    await user.type(within(pwForm).getByLabelText(/confirmer/i), 'different!');
    await user.click(within(pwForm).getByRole('button', { name: /enregistrer.*mot de passe/i }));

    expect(await screen.findByText(/les mots de passe ne correspondent pas/i)).toBeInTheDocument();
    expect(vi.mocked(api.changePassword)).not.toHaveBeenCalled();
  });

  it('password form: shows success after changePassword', async () => {
    vi.mocked(api.changePassword).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SecurityIdentifiants />);
    await screen.findByText(/modifier le mot de passe/i);

    const pwForm = screen.getByRole('form', { name: /modifier le mot de passe/i });
    await user.type(within(pwForm).getByLabelText(/mot de passe actuel/i), 'oldPass1');
    await user.type(within(pwForm).getByLabelText('Nouveau mot de passe'), 'newPass1!');
    await user.type(within(pwForm).getByLabelText(/confirmer/i), 'newPass1!');
    await user.click(within(pwForm).getByRole('button', { name: /enregistrer.*mot de passe/i }));

    expect(await screen.findByText(/mot de passe mis à jour/i)).toBeInTheDocument();
    expect(await screen.findByText(/autres sessions ont été déconnectées/i)).toBeInTheDocument();
  });

  it('password form: shows INVALID_PASSWORD error from server', async () => {
    vi.mocked(api.changePassword).mockRejectedValue({
      error: 'INVALID_PASSWORD',
      message: 'Mot de passe incorrect.',
    });
    const user = userEvent.setup();
    render(<SecurityIdentifiants />);
    await screen.findByText(/modifier le mot de passe/i);

    const pwForm = screen.getByRole('form', { name: /modifier le mot de passe/i });
    await user.type(within(pwForm).getByLabelText(/mot de passe actuel/i), 'wrong');
    await user.type(within(pwForm).getByLabelText('Nouveau mot de passe'), 'NewPass1!');
    await user.type(within(pwForm).getByLabelText(/confirmer/i), 'NewPass1!');
    await user.click(within(pwForm).getByRole('button', { name: /enregistrer.*mot de passe/i }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
  });
});
