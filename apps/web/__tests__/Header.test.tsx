import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import { RoleSimulationProvider } from '../lib/role';
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
  verified: false,
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
      <RoleSimulationProvider>
        <Header />
      </RoleSimulationProvider>
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

describe('Header — role-gated links', () => {
  beforeEach(() => vi.clearAllMocks());

  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
  }

  it('shows "Espace éditeur" link only for editor role', async () => {
    const user = userEvent.setup();
    renderHeader({ account: { ...mockAccount, role: 'editor' } });
    await openMenu(user);
    expect(await screen.findByRole('menuitem', { name: /espace éditeur/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /espace rédaction/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /panneau admin/i })).not.toBeInTheDocument();
  });

  it('shows "Espace rédaction" link only for maintainer role', async () => {
    const user = userEvent.setup();
    renderHeader({ account: { ...mockAccount, role: 'maintainer' } });
    await openMenu(user);
    expect(await screen.findByRole('menuitem', { name: /espace rédaction/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /espace éditeur/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /panneau admin/i })).not.toBeInTheDocument();
  });

  it('shows "Panneau admin" link only for admin role', async () => {
    const user = userEvent.setup();
    renderHeader({ account: { ...mockAccount, role: 'admin' } });
    await openMenu(user);
    expect(await screen.findByRole('menuitem', { name: /panneau admin/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /espace éditeur/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /espace rédaction/i })).not.toBeInTheDocument();
  });

  it('shows no role-gated links for utilisateur', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    expect(screen.queryByRole('menuitem', { name: /espace éditeur/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /espace rédaction/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /panneau admin/i })).not.toBeInTheDocument();
  });
});

describe('Header — demo role switcher', () => {
  beforeEach(() => vi.clearAllMocks());

  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
  }

  it('shows demo switcher section in dropdown', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    expect(screen.getByText(/mode démo/i)).toBeInTheDocument();
  });

  it('clicking "Admin" switcher reveals "Panneau admin" link', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    await user.click(screen.getByRole('button', { name: /^admin$/i }));
    expect(await screen.findByRole('menuitem', { name: /panneau admin/i })).toBeInTheDocument();
  });

  it('clicking "Lecteur" switcher hides all gated links', async () => {
    const user = userEvent.setup();
    renderHeader({ account: { ...mockAccount, role: 'admin' } });
    await openMenu(user);
    // Start as admin → "Panneau admin" visible
    expect(await screen.findByRole('menuitem', { name: /panneau admin/i })).toBeInTheDocument();
    // Switch to Lecteur
    await user.click(screen.getByRole('button', { name: /^lecteur$/i }));
    expect(screen.queryByRole('menuitem', { name: /panneau admin/i })).not.toBeInTheDocument();
  });

  it('demo switcher buttons are labelled and keyboard-accessible', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);

    const group = screen.getByRole('group', { name: /changer de rôle/i });
    expect(group).toBeInTheDocument();

    // All four switcher buttons are present and focusable
    const lecteur = screen.getByRole('button', { name: /^lecteur$/i });
    const redacteur = screen.getByRole('button', { name: /^rédacteur$/i });
    const editeur = screen.getByRole('button', { name: /^éditeur$/i });
    const admin = screen.getByRole('button', { name: /^admin$/i });

    expect(lecteur).toBeInTheDocument();
    expect(redacteur).toBeInTheDocument();
    expect(editeur).toBeInTheDocument();
    expect(admin).toBeInTheDocument();

    // Keyboard: focus admin button and press Enter — should reveal "Panneau admin"
    lecteur.focus();
    await user.keyboard('{Tab}'); // to rédacteur
    await user.keyboard('{Tab}'); // to éditeur
    await user.keyboard('{Tab}'); // to admin
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: /panneau admin/i })).toBeInTheDocument();
  });
});
