import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import { RoleSimulationProvider } from '../lib/role';
import { UnreadContext } from '../lib/unread';
import Header from '../components/Header';
import { usePathname } from 'next/navigation';

// next/link renders as an anchor in test env (jsdom)
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// next/navigation: usePathname defaults to '/'
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
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
  },
  unreadCount = 0
) {
  const mockLogout = opts.logout ?? vi.fn().mockResolvedValue(undefined);
  return render(
    <UnreadContext.Provider value={unreadCount}>
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
    </UnreadContext.Provider>
  );
}

// Reset pathname mock before each test so test isolation is maintained
beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/');
});

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

describe('Header — primary nav', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a nav landmark', () => {
    renderHeader({ account: null });
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
  });

  it('renders all six nav links with correct hrefs', () => {
    renderHeader({ account: null });
    const expected = [
      { label: /accueil/i, href: '/' },
      { label: /découvrir/i, href: '/decouvrir' },
      { label: /lire/i, href: '/lire' },
      { label: /écrire/i, href: '/ecrire' },
      { label: /projets/i, href: '/tableau-de-bord' },
      { label: /messages/i, href: '/contacts' },
    ];
    for (const { label, href } of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('marks the active route with aria-current="page" and others without it', () => {
    vi.mocked(usePathname).mockReturnValue('/decouvrir');
    renderHeader({ account: null });
    expect(screen.getByRole('link', { name: /découvrir/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /accueil/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /lire/i })).not.toHaveAttribute('aria-current');
  });
});

describe('Header — search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders search control when logged out', () => {
    renderHeader({ account: null });
    expect(screen.getByRole('button', { name: /rechercher/i })).toBeInTheDocument();
  });

  it('renders search control when logged in', () => {
    renderHeader({ account: mockAccount });
    expect(screen.getByRole('button', { name: /rechercher/i })).toBeInTheDocument();
  });
});

describe('Header — dropdown entries', () => {
  beforeEach(() => vi.clearAllMocks());

  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
  }

  it('shows Mon profil link to user slug', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    const item = await screen.findByRole('menuitem', { name: /mon profil/i });
    expect(item).toHaveAttribute('href', '/yuki-moreau');
  });

  it('shows Likes & ma liste link', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    const item = await screen.findByRole('menuitem', { name: /likes & ma liste/i });
    expect(item).toHaveAttribute('href', '/ma-liste');
  });

  it('shows Notifications link', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    const item = await screen.findByRole('menuitem', { name: /notifications/i });
    expect(item).toHaveAttribute('href', '/notifications');
  });

  it('shows Mes candidatures link', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    const item = await screen.findByRole('menuitem', { name: /mes candidatures/i });
    expect(item).toHaveAttribute('href', '/mes-candidatures');
  });

  it('shows Candidatures reçues link', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    const item = await screen.findByRole('menuitem', { name: /candidatures reçues/i });
    expect(item).toHaveAttribute('href', '/candidatures-recues');
  });

  it('closes menu when a dropdown item is clicked', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /mon profil/i }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Header — unread badge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows no badge text when count is 0', () => {
    renderHeader({ account: mockAccount }, 0);
    expect(screen.queryByRole('button', { name: /notifications non lues/i })).not.toBeInTheDocument();
  });

  it('includes unread count in avatar button label when count > 0', () => {
    renderHeader({ account: mockAccount }, 5);
    expect(screen.getByRole('button', { name: /5 notifications non lues/i })).toBeInTheDocument();
  });

  it('shows count badge on Notifications dropdown item when count > 0', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount }, 5);
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    const notifItem = await screen.findByRole('menuitem', { name: /notifications/i });
    expect(within(notifItem).getByText('5')).toBeInTheDocument();
  });
});

describe('Header — contextual Poster button', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows poster button on /decouvrir', () => {
    vi.mocked(usePathname).mockReturnValue('/decouvrir');
    renderHeader({ account: mockAccount });
    expect(screen.getByRole('link', { name: /poster/i })).toBeInTheDocument();
  });

  it('does not show poster button on /', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    renderHeader({ account: mockAccount });
    expect(screen.queryByRole('link', { name: /poster/i })).not.toBeInTheDocument();
  });
});

describe('Header — keyboard a11y', () => {
  beforeEach(() => vi.clearAllMocks());

  it('closes menu on Escape and returns focus to avatar button', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    const avatarBtn = screen.getByRole('button', { name: /menu de yuki moreau/i });
    await user.click(avatarBtn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(avatarBtn).toHaveFocus();
  });

  it('moves focus with ArrowDown among menuitems', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    await user.keyboard('{ArrowDown}');
    const menuitems = screen.getAllByRole('menuitem');
    expect(menuitems[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(menuitems[1]).toHaveFocus();
  });

  it('moves focus with ArrowUp among menuitems', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    const menuitems = screen.getAllByRole('menuitem');
    expect(menuitems[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(menuitems[0]).toHaveFocus();
  });
});
