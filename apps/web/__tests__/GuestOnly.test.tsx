import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';
import GuestOnly from '../components/GuestOnly';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const account = { id: 'a1', displayName: 'Moi' } as unknown as AccountSummary;

function renderGuard(ctx: { account: AccountSummary | null; loading: boolean }) {
  render(
    <SessionContext.Provider
      value={{ account: ctx.account, loading: ctx.loading, refresh: vi.fn(), logout: vi.fn() }}
    >
      <GuestOnly>
        <p>Connexion</p>
      </GuestOnly>
    </SessionContext.Provider>,
  );
}

describe('GuestOnly', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the page for a signed-out visitor', () => {
    renderGuard({ account: null, loading: false });
    expect(screen.getByText('Connexion')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  // The reported bug: /connexion stayed reachable while signed in.
  it('redirects a signed-in visitor away and renders nothing', async () => {
    renderGuard({ account, loading: false });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('Connexion')).not.toBeInTheDocument();
  });

  // Guests are the common visitor here — blanking the form during every /auth/me round-trip would be
  // a worse regression than the brief flash a signed-in visitor sees.
  it('still renders while the session is resolving, and does not redirect yet', () => {
    renderGuard({ account: null, loading: true });
    expect(screen.getByText('Connexion')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
