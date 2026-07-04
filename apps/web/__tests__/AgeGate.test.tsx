// DR-10 FE-3 — <AgeGate> focus-trapped interstitial. Branches on the current viewer
// (visitor / logged-in adult / logged-in minor / logged-in no-birthdate).
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
import AgeGate from '../components/age/AgeGate';

const adult: AccountSummary = {
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
  isAdult: true,
};
const minor: AccountSummary = { ...adult, id: 'm1', isAdult: false };
const noBirthdate: AccountSummary = { ...adult, id: 'n1', isAdult: null };

describe('AgeGate (DR-10 FE-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockAccount.current = null;
  });

  it('renders a focus-trapped dialog with the title', () => {
    render(<AgeGate onBack={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: /contenu réservé aux adultes/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('focuses the title on mount', async () => {
    render(<AgeGate onBack={vi.fn()} />);
    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleName(/contenu réservé aux adultes/i);
    });
  });

  it('visitor: shows self-declaration + a sign-in prompt link', () => {
    mockAccount.current = null;
    render(<AgeGate onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /j'ai 18 ans ou plus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute('href', '/connexion');
  });

  it('visitor: clicking continue sets the session clearance flag', async () => {
    mockAccount.current = null;
    const user = userEvent.setup();
    render(<AgeGate onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /j'ai 18 ans ou plus/i }));
    expect(sessionStorage.getItem('ep_age_cleared')).toBe('1');
  });

  it('visitor: clicking "Retour" calls onBack', async () => {
    mockAccount.current = null;
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<AgeGate onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('Escape key calls onBack', async () => {
    mockAccount.current = null;
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<AgeGate onBack={onBack} />);
    await user.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalled();
  });

  it('logged-in adult: shows continue + "Ne plus me demander" checkbox, no minor refusal text', () => {
    mockAccount.current = adult;
    render(<AgeGate onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /j'ai 18 ans ou plus/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /ne plus me demander/i })).toBeInTheDocument();
    expect(screen.queryByText('Ce contenu est réservé aux adultes.')).not.toBeInTheDocument();
  });

  it('logged-in adult: continuing without checking "remember" clears in-memory only (no localStorage)', async () => {
    mockAccount.current = adult;
    const user = userEvent.setup();
    render(<AgeGate onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /j'ai 18 ans ou plus/i }));
    expect(localStorage.getItem(`ep_age_cleared:${adult.id}`)).toBeNull();
  });

  it('logged-in adult: checking "remember" then continuing persists to localStorage', async () => {
    mockAccount.current = adult;
    const user = userEvent.setup();
    render(<AgeGate onBack={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: /ne plus me demander/i }));
    await user.click(screen.getByRole('button', { name: /j'ai 18 ans ou plus/i }));
    expect(localStorage.getItem(`ep_age_cleared:${adult.id}`)).toBe('1');
  });

  it('logged-in minor: shows refusal text, only "Retour" — no continue button, no bypass', () => {
    mockAccount.current = minor;
    render(<AgeGate onBack={vi.fn()} />);
    expect(screen.getByText('Ce contenu est réservé aux adultes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /j'ai 18 ans ou plus/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
  });

  it('logged-in, no birthdate on file: shows a labelled "Date de naissance" prompt', () => {
    mockAccount.current = noBirthdate;
    render(<AgeGate onBack={vi.fn()} />);
    expect(screen.getByLabelText(/date de naissance/i)).toBeInTheDocument();
  });

  it('logged-in, no birthdate: submitting calls updateMyBirthdate then refreshes the session', async () => {
    mockAccount.current = noBirthdate;
    vi.mocked(api.updateMyBirthdate).mockResolvedValue({ ...adult });
    const user = userEvent.setup();
    render(<AgeGate onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/date de naissance/i), '1990-01-01');
    await user.click(screen.getByRole('button', { name: /continuer/i }));
    await waitFor(() => {
      expect(api.updateMyBirthdate).toHaveBeenCalledWith('1990-01-01');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('logged-in, no birthdate: submitting empty shows "Date invalide"', async () => {
    mockAccount.current = noBirthdate;
    const user = userEvent.setup();
    render(<AgeGate onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /continuer/i }));
    expect(await screen.findByText('Date invalide')).toBeInTheDocument();
    expect(api.updateMyBirthdate).not.toHaveBeenCalled();
  });
});
