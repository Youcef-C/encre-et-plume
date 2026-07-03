import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { AccountSummary } from '@encre-et-plume/shared';

const mockReplace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Session mock is mutable per test
const sessionState = vi.hoisted(() => ({ account: null as AccountSummary | null, loading: false }));
vi.mock('../lib/session', () => ({
  useSession: () => sessionState,
}));

// Net-new components under test via real ThemeContext/CookieConsentContext defaults (no network)
vi.mock('../components/PreferencesNotifications', () => ({
  default: () => <div>PreferencesNotifications stub</div>,
}));
vi.mock('../components/security/SecurityIdentifiants', () => ({
  default: () => <div>SecurityIdentifiants stub</div>,
}));
vi.mock('../components/security/SecuritySessions', () => ({
  default: () => <div>SecuritySessions stub</div>,
}));
vi.mock('../components/security/SecurityTwoFactor', () => ({
  default: () => <div>SecurityTwoFactor stub</div>,
}));
vi.mock('../components/MesDonnees', () => ({
  default: () => <div>MesDonnees stub</div>,
}));
vi.mock('../components/SupprimerCompteModal', () => ({
  default: () => <div>SupprimerCompteModal stub</div>,
}));

import ParametresPage from '../app/parametres/page';

const mockAccount: AccountSummary = {
  id: 'c1',
  displayName: 'Yuki Moreau',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  emailVerified: true,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  needsCguReconsent: false,
  onboarded: false,
};

describe('ParametresPage', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    sessionState.account = mockAccount;
    sessionState.loading = false;
  });

  it('renders exactly one h1 "Paramètres"', () => {
    render(<ParametresPage />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Paramètres');
  });

  it('renders the four h2 section headings in order', () => {
    render(<ParametresPage />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual([
      'Préférences de notification',
      'Cookies',
      'Sécurité',
      'Mes données',
    ]);
  });

  it('renders the section nav with its label', () => {
    render(<ParametresPage />);
    expect(screen.getByRole('navigation', { name: 'Sections des paramètres' })).toBeInTheDocument();
  });

  it('renders the four sections as collapsible <details>, expanded by default', () => {
    const { container } = render(<ParametresPage />);
    const sections = container.querySelectorAll('details.ep-settings-section');
    expect(Array.from(sections).map((d) => d.id)).toEqual([
      'notifications',
      'cookies',
      'securite',
      'mes-donnees',
    ]);
    sections.forEach((d) => {
      expect(d).toHaveAttribute('open');
      expect(d.querySelector('summary.ep-settings-summary')).not.toBeNull();
    });
  });

  it('redirects to /connexion when logged out', async () => {
    sessionState.account = null;
    sessionState.loading = false;
    render(<ParametresPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/connexion'));
  });

  it('renders nothing but a skeleton while loading', () => {
    sessionState.account = null;
    sessionState.loading = true;
    render(<ParametresPage />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
