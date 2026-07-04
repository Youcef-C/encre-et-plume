import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import { RoleSimulationProvider } from '../lib/role';
import RoleBanner from '../components/RoleBanner';

const base: AccountSummary = {
  id: 'a1',
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
  onboarded: false,
  isAdult: true,
};

function wrap(account: AccountSummary | null) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <RoleSimulationProvider>
        <RoleBanner />
      </RoleSimulationProvider>
    </SessionContext.Provider>
  );
}

describe('RoleBanner', () => {
  it('renders banner when effectiveRole is editor', () => {
    wrap({ ...base, role: 'editor', verified: false });
    expect(screen.getByText(/Connecté·e en tant qu'Éditeur/)).toBeInTheDocument();
  });

  it('shows verified pill when editor is verified', () => {
    wrap({ ...base, role: 'editor', verified: true });
    expect(screen.getByText(/compte vérifié/)).toBeInTheDocument();
  });

  it('hides verified pill when editor is not verified', () => {
    wrap({ ...base, role: 'editor', verified: false });
    expect(screen.queryByText(/compte vérifié/)).not.toBeInTheDocument();
  });

  it('does not render banner for utilisateur role', () => {
    wrap({ ...base, role: 'utilisateur', verified: false });
    expect(screen.queryByText(/Connecté·e en tant qu'Éditeur/)).not.toBeInTheDocument();
  });

  it('does not render banner for maintainer role', () => {
    wrap({ ...base, role: 'maintainer', verified: false });
    expect(screen.queryByText(/Connecté·e en tant qu'Éditeur/)).not.toBeInTheDocument();
  });

  it('does not render banner when account is null', () => {
    wrap(null);
    expect(screen.queryByText(/Connecté·e en tant qu'Éditeur/)).not.toBeInTheDocument();
  });
});
