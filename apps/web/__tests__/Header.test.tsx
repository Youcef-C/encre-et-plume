import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import Header from '../components/Header';

// next/link renders as an anchor in test env (jsdom)
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockAccount: AccountSummary = {
  id: 'c1',
  displayName: 'Yuki Moreau',
  email: 'yuki@example.com',
  role: 'utilisateur',
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
};

function renderHeader(
  opts: { account: AccountSummary | null; loading?: boolean; logout?: () => Promise<void> } = {
    account: null,
  }
) {
  const mockLogout = opts.logout ?? vi.fn().mockResolvedValue(undefined);
  return render(
    <SessionContext.Provider
      value={{
        account: opts.account,
        loading: opts.loading ?? false,
        refresh: vi.fn(),
        logout: mockLogout,
      }}
    >
      <Header />
    </SessionContext.Provider>
  );
}

describe('Header', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows "Se connecter" link when logged out', () => {
    renderHeader({ account: null });
    const link = screen.getByRole('link', { name: /se connecter/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/connexion');
  });

  it('does not show "Se connecter" when logged in', () => {
    renderHeader({ account: mockAccount });
    expect(screen.queryByRole('link', { name: /se connecter/i })).not.toBeInTheDocument();
  });

  it('shows avatar button with display name label when logged in', () => {
    renderHeader({ account: mockAccount });
    expect(
      screen.getByRole('button', { name: /menu de yuki moreau/i })
    ).toBeInTheDocument();
  });

  it('opens dropdown with "Se déconnecter" button when avatar clicked', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });

    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));

    expect(await screen.findByRole('menuitem', { name: /se déconnecter/i })).toBeInTheDocument();
  });

  it('calls logout and closes menu when "Se déconnecter" clicked', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderHeader({ account: mockAccount, logout: mockLogout });

    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    await user.click(await screen.findByRole('menuitem', { name: /se déconnecter/i }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledOnce());
    // Menu should be closed
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows logo link to home', () => {
    renderHeader({ account: null });
    const logo = screen.getByRole('link', { name: /encre & plume/i });
    expect(logo).toHaveAttribute('href', '/');
  });
});
