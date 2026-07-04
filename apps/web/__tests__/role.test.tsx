import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary, UserRole } from '@encre-et-plume/shared';
import { RoleSimulationProvider, useEffectiveRole } from '../lib/role';

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

// Minimal consumer to expose context values in tests
function RoleConsumer() {
  const { effectiveRole, setSimulatedRole } = useEffectiveRole();
  return (
    <div>
      <span data-testid="role">{effectiveRole}</span>
      <button onClick={() => setSimulatedRole('admin')}>set admin</button>
      <button onClick={() => setSimulatedRole('editor')}>set editor</button>
      <button onClick={() => setSimulatedRole(null)}>reset</button>
    </div>
  );
}

function wrap(account: AccountSummary | null) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <RoleSimulationProvider>
        <RoleConsumer />
      </RoleSimulationProvider>
    </SessionContext.Provider>
  );
}

describe('useEffectiveRole', () => {
  it('defaults to utilisateur when account is null', () => {
    wrap(null);
    expect(screen.getByTestId('role')).toHaveTextContent('utilisateur');
  });

  it('returns account.role when no simulation is active', () => {
    wrap({ ...base, role: 'maintainer' });
    expect(screen.getByTestId('role')).toHaveTextContent('maintainer');
  });

  it('overrides account.role when a simulated role is set', async () => {
    const user = userEvent.setup();
    wrap({ ...base, role: 'utilisateur' });
    await user.click(screen.getByText('set admin'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
  });

  it('falls back to account.role when simulation is reset to null', async () => {
    const user = userEvent.setup();
    wrap({ ...base, role: 'maintainer' });
    await user.click(screen.getByText('set admin'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    await user.click(screen.getByText('reset'));
    expect(screen.getByTestId('role')).toHaveTextContent('maintainer');
  });

  it('setSimulatedRole can switch between different roles', async () => {
    const user = userEvent.setup();
    wrap(base);
    await user.click(screen.getByText('set admin'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    await user.click(screen.getByText('set editor'));
    expect(screen.getByTestId('role')).toHaveTextContent('editor');
  });
});
