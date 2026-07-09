// F-19 "Confidentialité" control — "Qui peut m'envoyer des messages" via OnBrandSelect
// (anyone / requests / contacts), auto-applied on change through PATCH /accounts/me/preferences.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary } from '@encre-et-plume/shared';

const mockAccount = vi.hoisted(() => ({ current: null as AccountSummary | null }));
const mockRefresh = vi.hoisted(() => vi.fn());

vi.mock('../lib/session', () => ({
  useSession: () => ({ account: mockAccount.current, loading: false, refresh: mockRefresh }),
}));

vi.mock('../lib/api', () => ({
  updateMyPreferences: vi.fn(),
}));

import * as api from '../lib/api';
import ConfidentialiteSettings from '../components/settings/ConfidentialiteSettings';

const base: AccountSummary = {
  id: 'a1',
  displayName: 'Yuki',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'yuki',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

describe('ConfidentialiteSettings (F-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccount.current = { ...base };
    vi.mocked(api.updateMyPreferences).mockResolvedValue({ ...base });
  });

  it('renders nothing for a visitor', () => {
    mockAccount.current = null;
    const { container } = render(<ConfidentialiteSettings />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the labelled control with the three exact option labels (no native select)', async () => {
    render(<ConfidentialiteSettings />);
    const combobox = screen.getByRole('combobox', { name: "Qui peut m'envoyer des messages" });
    expect(combobox).toBeInTheDocument();
    // Custom popover listbox, not a native <select>.
    expect(document.querySelector('select')).toBeNull();
    // Current value reflects the account preference.
    expect(combobox).toHaveTextContent('Demandes de message');

    await userEvent.click(combobox);
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveTextContent('Tout le monde');
    expect(listbox).toHaveTextContent('Demandes de message');
    expect(listbox).toHaveTextContent('Contacts uniquement');
  });

  it('shows the helper line', () => {
    render(<ConfidentialiteSettings />);
    expect(
      screen.getByText("Détermine comment un message d'un membre hors de vos contacts vous parvient."),
    ).toBeInTheDocument();
  });

  it('auto-applies on change: PATCHes { dmPolicy } (no submit button) and refreshes the session', async () => {
    render(<ConfidentialiteSettings />);
    // No "Appliquer"/submit button.
    expect(screen.queryByRole('button', { name: /appliquer|enregistrer/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: "Qui peut m'envoyer des messages" }));
    await userEvent.click(screen.getByRole('option', { name: 'Contacts uniquement' }));

    await waitFor(() => {
      expect(api.updateMyPreferences).toHaveBeenCalledWith({ dmPolicy: 'contacts' });
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('reverts and shows an error when the save fails', async () => {
    vi.mocked(api.updateMyPreferences).mockRejectedValue(new Error('boom'));
    render(<ConfidentialiteSettings />);
    await userEvent.click(screen.getByRole('combobox', { name: "Qui peut m'envoyer des messages" }));
    await userEvent.click(screen.getByRole('option', { name: 'Tout le monde' }));

    expect(await screen.findByText('Enregistrement impossible. Réessayez.')).toBeInTheDocument();
    // Reverted to the previous value.
    expect(screen.getByRole('combobox', { name: "Qui peut m'envoyer des messages" })).toHaveTextContent(
      'Demandes de message',
    );
  });
});
