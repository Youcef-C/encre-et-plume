// DR-10 Paramètres control — "Contenu 18+" section: shows current isAdult status, lets a
// signed-in user set/update their birthdate (PATCH /accounts/me/birthdate), and revoke the
// remembered "Ne plus me demander" 18+ clearance on this device.
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
  updateMyBirthdate: vi.fn(),
}));

import * as api from '../lib/api';
import { clearAge, resetAgeGateForTests } from '../lib/ageGate';
import AdultContentSettings from '../components/settings/AdultContentSettings';

const base: AccountSummary = {
  id: 'a1',
  displayName: 'Yuki',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'yuki',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: null,
};

const adult: AccountSummary = { ...base, isAdult: true };
const minor: AccountSummary = { ...base, isAdult: false };

describe('AdultContentSettings (DR-10 Paramètres control)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    resetAgeGateForTests();
    mockAccount.current = null;
  });

  it('renders nothing for a visitor (no account)', () => {
    const { container } = render(<AdultContentSettings />);
    expect(container).toBeEmptyDOMElement();
  });

  it('adult: shows the "accès autorisé" status', () => {
    mockAccount.current = adult;
    render(<AdultContentSettings />);
    expect(screen.getByText('Vous avez accès au contenu réservé aux adultes (18+).')).toBeInTheDocument();
  });

  it('minor: shows the "accès restreint" status', () => {
    mockAccount.current = minor;
    render(<AdultContentSettings />);
    expect(screen.getByText(/accès restreint/i)).toBeInTheDocument();
  });

  it('no birthdate: shows the "non renseignée" status', () => {
    mockAccount.current = base;
    render(<AdultContentSettings />);
    expect(screen.getByText('Date de naissance non renseignée.')).toBeInTheDocument();
  });

  it('submitting a valid birthdate calls updateMyBirthdate then refreshes the session', async () => {
    mockAccount.current = base;
    vi.mocked(api.updateMyBirthdate).mockResolvedValue({ ...adult });
    const user = userEvent.setup();
    render(<AdultContentSettings />);
    await user.type(screen.getByLabelText(/date de naissance/i), '1990-01-01');
    await user.click(screen.getByRole('button', { name: /définir|mettre à jour/i }));
    await waitFor(() => {
      expect(api.updateMyBirthdate).toHaveBeenCalledWith('1990-01-01');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('submitting an implausible birthdate shows "Date invalide" and does not call the API', async () => {
    mockAccount.current = base;
    const user = userEvent.setup();
    render(<AdultContentSettings />);
    await user.type(screen.getByLabelText(/date de naissance/i), '2999-01-01');
    await user.click(screen.getByRole('button', { name: /définir|mettre à jour/i }));
    expect(await screen.findByText('Date invalide')).toBeInTheDocument();
    expect(api.updateMyBirthdate).not.toHaveBeenCalled();
  });

  it('adult with no remembered clearance: revoke button is disabled', () => {
    mockAccount.current = adult;
    render(<AdultContentSettings />);
    expect(screen.getByRole('button', { name: /réactiver la confirmation 18\+/i })).toBeDisabled();
  });

  it('adult with a remembered clearance: revoking clears the device flag and disables the button', async () => {
    mockAccount.current = adult;
    clearAge(adult, true);
    expect(localStorage.getItem(`ep_age_cleared:${adult.id}`)).toBe('1');
    const user = userEvent.setup();
    render(<AdultContentSettings />);
    const button = screen.getByRole('button', { name: /réactiver la confirmation 18\+/i });
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(localStorage.getItem(`ep_age_cleared:${adult.id}`)).toBeNull();
    expect(button).toBeDisabled();
  });

  it('minor: no revoke affordance is rendered (never had a clearance to revoke)', () => {
    mockAccount.current = minor;
    render(<AdultContentSettings />);
    expect(screen.queryByRole('button', { name: /réactiver la confirmation 18\+/i })).not.toBeInTheDocument();
  });
});
