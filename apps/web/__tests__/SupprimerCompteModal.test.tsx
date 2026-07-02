import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import SupprimerCompteModal from '../components/SupprimerCompteModal';

// vi.hoisted ensures mockPush is available inside the vi.mock factory
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('../lib/api', () => ({
  deleteAccount: vi.fn(),
}));
import * as api from '../lib/api';

const mockLogout = vi.fn().mockResolvedValue(undefined);

const mockAccount: AccountSummary = {
  id: 'c1',
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  role: 'utilisateur',
  verified: false,
  emailVerified: true,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  needsCguReconsent: false,
};

function renderModal() {
  return render(
    <SessionContext.Provider
      value={{ account: mockAccount, loading: false, refresh: vi.fn(), logout: mockLogout }}
    >
      <SupprimerCompteModal />
    </SessionContext.Provider>,
  );
}

describe('SupprimerCompteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Supprimer mon compte" trigger button', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /supprimer mon compte/i })).toBeInTheDocument();
  });

  it('opens focus-trapped dialog with explicit title when trigger clicked', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    const dialog = screen.getByRole('dialog', { name: /supprimer mon compte/i });
    expect(dialog).toBeInTheDocument();
  });

  it('shows consequences list in the modal', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/profil supprimé/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/abonnements arrêtés/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/données de paiement/i)).toBeInTheDocument();
  });

  it('submit disabled when neither confirmation word nor password entered', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    expect(screen.getByRole('button', { name: /confirmer la suppression/i })).toBeDisabled();
  });

  it('submit disabled when only confirmation word typed (no password)', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    await user.type(screen.getByLabelText(/tapez.*supprimer/i), 'SUPPRIMER');
    expect(screen.getByRole('button', { name: /confirmer la suppression/i })).toBeDisabled();
  });

  it('submit disabled when only password entered (no confirmation word)', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    await user.type(screen.getByLabelText(/mot de passe/i), 'mypassword');
    expect(screen.getByRole('button', { name: /confirmer la suppression/i })).toBeDisabled();
  });

  it('submit disabled when wrong word typed (not exactly "SUPPRIMER")', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    await user.type(screen.getByLabelText(/tapez.*supprimer/i), 'supprimer');
    await user.type(screen.getByLabelText(/mot de passe/i), 'mypassword');
    expect(screen.getByRole('button', { name: /confirmer la suppression/i })).toBeDisabled();
  });

  it('submit enabled when "SUPPRIMER" typed exactly and password non-empty', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    await user.type(screen.getByLabelText(/tapez.*supprimer/i), 'SUPPRIMER');
    await user.type(screen.getByLabelText(/mot de passe/i), 'mypassword');
    expect(screen.getByRole('button', { name: /confirmer la suppression/i })).not.toBeDisabled();
  });

  it('shows wrong-password error from API (401 INVALID_PASSWORD)', async () => {
    vi.mocked(api.deleteAccount).mockRejectedValue({
      statusCode: 401,
      error: 'INVALID_PASSWORD',
      message: 'Mot de passe incorrect',
    });
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    await user.type(screen.getByLabelText(/tapez.*supprimer/i), 'SUPPRIMER');
    await user.type(screen.getByLabelText(/mot de passe/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /confirmer la suppression/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/mot de passe incorrect/i);
    });
  });

  it('on success: hard-navigates to /compte-supprime (no client logout — the API cleared the cookie)', async () => {
    vi.mocked(api.deleteAccount).mockResolvedValue({ deleted: true });
    const assignSpy = vi.fn();
    // jsdom's window.location is not configurable via vi.spyOn — replace wholesale.
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...original, assign: assignSpy },
      writable: true,
    });
    try {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
      await user.type(screen.getByLabelText(/tapez.*supprimer/i), 'SUPPRIMER');
      await user.type(screen.getByLabelText(/mot de passe/i), 'correctpass');
      await user.click(screen.getByRole('button', { name: /confirmer la suppression/i }));
      await waitFor(() => {
        expect(assignSpy).toHaveBeenCalledWith('/compte-supprime');
      });
      // No client-side logout: it would re-render the guard and race the navigation.
      expect(mockLogout).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true });
    }
  });

  it('Escape key closes the modal', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /supprimer mon compte/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
