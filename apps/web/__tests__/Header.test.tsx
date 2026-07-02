import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary, ThemePreference } from '@encre-et-plume/shared';
import type { UnreadCounts } from '@encre-et-plume/shared';
import { RoleSimulationProvider } from '../lib/role';
import { UnreadContext, UnreadCountsContext } from '../lib/unread';
import { ThemeContext } from '../lib/theme';
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
  emailVerified: true,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  needsCguReconsent: false,
};

function renderHeader(
  opts: { account: AccountSummary | null; loading?: boolean; logout?: () => Promise<void> } = {
    account: null,
  },
  unreadCount = 0,
  themeCtx?: { theme: ThemePreference; setTheme: (t: ThemePreference) => void }
) {
  const mockLogout = opts.logout ?? vi.fn().mockResolvedValue(undefined);
  const ctx = themeCtx ?? { theme: 'system' as ThemePreference, setTheme: vi.fn() };
  return render(
    <ThemeContext.Provider value={ctx}>
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
    </ThemeContext.Provider>
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

  it('opens dropdown with "Déconnexion" button when avatar clicked', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });

    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));

    expect(await screen.findByRole('menuitem', { name: /déconnexion/i })).toBeInTheDocument();
  });

  it('calls logout and closes menu when "Déconnexion" clicked', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderHeader({ account: mockAccount, logout: mockLogout });

    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    await user.click(await screen.findByRole('menuitem', { name: /déconnexion/i }));

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

  it('renders seven prototype nav links with correct hrefs', () => {
    renderHeader({ account: null });
    const expected = [
      { label: /accueil/i,    href: '/'           },
      { label: /découvrir/i,  href: '/decouvrir'  },
      { label: /galerie/i,    href: '/galerie'     },
      { label: /actualités/i, href: '/actualites'  },
      { label: /lire/i,       href: '/lire'        },
      { label: /trouver/i,    href: '/trouver'     },
      { label: /calendrier/i, href: '/calendrier'  },
    ];
    for (const { label, href } of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    // Projets and Ma liste are auth-gated — must not appear when logged out
    expect(screen.queryByRole('link', { name: /^projets$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^ma liste$/i })).not.toBeInTheDocument();
  });

  it('marks the active route with aria-current="page" and others without it', () => {
    vi.mocked(usePathname).mockReturnValue('/decouvrir');
    renderHeader({ account: null });
    expect(screen.getByRole('link', { name: /découvrir/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /accueil/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /lire/i })).not.toHaveAttribute('aria-current');
  });
});

describe('Header — auth-gated nav items (Projets + Ma liste)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows Projets link when logged in', () => {
    renderHeader({ account: mockAccount });
    const link = screen.getByRole('link', { name: /^projets$/i });
    expect(link).toHaveAttribute('href', '/tableau-de-bord');
  });

  it('does not show Projets link when logged out', () => {
    renderHeader({ account: null });
    expect(screen.queryByRole('link', { name: /^projets$/i })).not.toBeInTheDocument();
  });

  it('shows Ma liste button when logged in', () => {
    renderHeader({ account: mockAccount });
    const link = screen.getByRole('link', { name: /ma liste/i });
    expect(link).toHaveAttribute('href', '/ma-liste');
  });

  it('does not show Ma liste button when logged out', () => {
    renderHeader({ account: null });
    expect(screen.queryByRole('link', { name: /ma liste/i })).not.toBeInTheDocument();
  });

  it('Projets link has aria-current="page" on /tableau-de-bord', () => {
    vi.mocked(usePathname).mockReturnValue('/tableau-de-bord');
    renderHeader({ account: mockAccount });
    expect(screen.getByRole('link', { name: /^projets$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('Ma liste link has aria-current="page" on /ma-liste', () => {
    vi.mocked(usePathname).mockReturnValue('/ma-liste');
    renderHeader({ account: mockAccount });
    expect(screen.getByRole('link', { name: /ma liste/i })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Header — hover/design class hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('header element has ep-header class (constant height hook)', () => {
    renderHeader({ account: null });
    expect(screen.getByRole('banner')).toHaveClass('ep-header');
  });

  it('nav links have ep-nav-link class (accent hover hook)', () => {
    renderHeader({ account: null });
    expect(screen.getByRole('link', { name: /accueil/i })).toHaveClass('ep-nav-link');
    expect(screen.getByRole('link', { name: /découvrir/i })).toHaveClass('ep-nav-link');
  });

  it('logout button has ep-menu-item class (hover hook)', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    const logoutBtn = await screen.findByRole('menuitem', { name: /déconnexion/i });
    expect(logoutBtn).toHaveClass('ep-menu-item');
  });

  it('auth-gated pill buttons have ep-pill-btn class', () => {
    renderHeader({ account: mockAccount });
    expect(screen.getByRole('link', { name: /ma liste/i })).toHaveClass('ep-pill-btn');
    expect(screen.getByRole('link', { name: /^projets$/i })).toHaveClass('ep-pill-btn');
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

// PosterButton removed from nav per user request — no poster button on any page

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

// ─── F-5: Area badges (Messages, Demandes, Signalements) ────────────────────

const mockCounts: UnreadCounts = {
  total: 7,
  messages: 3,
  demandes: 2,
  signalements: 4,
};

function renderHeaderWithCounts(
  account: AccountSummary | null,
  counts: Partial<UnreadCounts> = {}
) {
  const fullCounts: UnreadCounts = { total: 0, messages: 0, demandes: 0, signalements: 0, ...counts };
  return render(
    <UnreadCountsContext.Provider value={{ counts: fullCounts, refresh: vi.fn() }}>
      <UnreadContext.Provider value={fullCounts.total}>
        <SessionContext.Provider
          value={{
            account,
            loading: false,
            refresh: vi.fn(),
            logout: vi.fn().mockResolvedValue(undefined),
          }}
        >
          <RoleSimulationProvider>
            <Header />
          </RoleSimulationProvider>
        </SessionContext.Provider>
      </UnreadContext.Provider>
    </UnreadCountsContext.Provider>
  );
}

describe('Header — F-5 area badges', () => {
  beforeEach(() => vi.clearAllMocks());

  // Messages link removed from primary nav per prototype TOP NAV replica.
  // Messages count is surfaced via the avatar total-unread badge (counts.total).
  it('messages count contributes to avatar unread badge', () => {
    renderHeaderWithCounts(mockAccount, { messages: 3, total: 3 });
    // Total unread shows on avatar aria-label
    expect(screen.getByRole('button', { name: /3 notifications non lues/i })).toBeInTheDocument();
  });

  it('shows Demandes badge on Candidatures reçues dropdown entry', async () => {
    const user = userEvent.setup();
    renderHeaderWithCounts(mockAccount, { demandes: 2 });
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    expect(await screen.findByRole('img', { name: /2 demandes en attente/i })).toBeInTheDocument();
  });

  it('Demandes badge not shown when demandes count is 0', async () => {
    const user = userEvent.setup();
    renderHeaderWithCounts(mockAccount, { demandes: 0 });
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
    expect(screen.queryByRole('img', { name: /demandes en attente/i })).not.toBeInTheDocument();
  });

  it('shows Signalements badge for admin role', async () => {
    const user = userEvent.setup();
    renderHeaderWithCounts({ ...mockAccount, role: 'admin' }, { signalements: 4 });
    await user.click(screen.getByRole('button', { name: /menu de/i }));
    expect(await screen.findByRole('img', { name: /4 signalements/i })).toBeInTheDocument();
  });

  it('Signalements badge hidden for utilisateur even if count > 0', () => {
    renderHeaderWithCounts(mockAccount, { signalements: 4 });
    expect(screen.queryByRole('img', { name: /signalements/i })).not.toBeInTheDocument();
  });

  it('Signalements badge not shown for maintainer (no "Panneau admin" link host)', async () => {
    // Maintainer has "Espace rédaction" link, not "Panneau admin".
    // The signalements badge lives on the admin link, so no badge surface exists for maintainer.
    // The backend already gates signalements=0 for non-admin/maintainer; the nav badge
    // upgrade path is to add a dedicated signalements entry when the admin surface expands.
    const user = userEvent.setup();
    renderHeaderWithCounts({ ...mockAccount, role: 'maintainer' }, { signalements: 2 });
    await user.click(screen.getByRole('button', { name: /menu de/i }));
    await screen.findByRole('menuitem', { name: /espace rédaction/i });
    expect(screen.queryByRole('img', { name: /signalements/i })).not.toBeInTheDocument();
  });
});

// ─── F-14: Paramètres menu item ──────────────────────────────────────────────

describe('Header — F-14 Paramètres entry', () => {
  beforeEach(() => vi.clearAllMocks());

  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
  }

  it('shows "Paramètres" menuitem in dropdown when logged in', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    const item = await screen.findByRole('menuitem', { name: /paramètres/i });
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute('href', '/parametres');
  });

  it('closes menu when Paramètres is clicked', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /paramètres/i }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

// ─── F-7: Search overlay ─────────────────────────────────────────────────────

// Mock SearchOverlay so Header tests don't need to stub useSearch / fetchSearch
vi.mock('../components/SearchOverlay', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Rechercher" aria-modal="true">
        <input aria-label="Rechercher" role="combobox" readOnly />
        <button onClick={onClose} aria-label="Fermer la recherche">Échap</button>
      </div>
    ) : null,
}));

describe('Header — F-7 search overlay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clicking the search button opens the overlay', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await user.click(screen.getByRole('button', { name: /rechercher/i }));
    expect(screen.getByRole('dialog', { name: /rechercher/i })).toBeInTheDocument();
  });

  it('search button has aria-expanded=false when overlay is closed', () => {
    renderHeader({ account: mockAccount });
    const btn = screen.getByRole('button', { name: /rechercher/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('search button shows when logged out', () => {
    renderHeader({ account: null });
    expect(screen.getByRole('button', { name: /rechercher/i })).toBeInTheDocument();
  });
});

// ─── F-6: Theme toggle ───────────────────────────────────────────────────────

describe('Header — F-6 theme toggle', () => {
  beforeEach(() => vi.clearAllMocks());

  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /menu de yuki moreau/i }));
  }

  it('renders Clair and Sombre buttons in the dropdown', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    expect(await screen.findByRole('button', { name: /clair/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sombre/i })).toBeInTheDocument();
  });

  it('toggle group has accessible label "Thème"', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });
    await openMenu(user);
    await screen.findByRole('group', { name: /thème/i });
    expect(screen.getByRole('group', { name: /thème/i })).toBeInTheDocument();
  });

  it('Clair button is aria-pressed when theme is light', async () => {
    const user = userEvent.setup();
    renderHeader(
      { account: mockAccount },
      0,
      { theme: 'light', setTheme: vi.fn() }
    );
    await openMenu(user);
    const clairBtn = await screen.findByRole('button', { name: /clair/i });
    expect(clairBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('Sombre button is aria-pressed when theme is dark', async () => {
    const user = userEvent.setup();
    renderHeader(
      { account: mockAccount },
      0,
      { theme: 'dark', setTheme: vi.fn() }
    );
    await openMenu(user);
    const sombreBtn = await screen.findByRole('button', { name: /sombre/i });
    expect(sombreBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('neither button is aria-pressed when theme is system', async () => {
    const user = userEvent.setup();
    renderHeader(
      { account: mockAccount },
      0,
      { theme: 'system', setTheme: vi.fn() }
    );
    await openMenu(user);
    const clairBtn = await screen.findByRole('button', { name: /clair/i });
    const sombreBtn = screen.getByRole('button', { name: /sombre/i });
    expect(clairBtn).toHaveAttribute('aria-pressed', 'false');
    expect(sombreBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking Clair calls setTheme("light")', async () => {
    const mockSetTheme = vi.fn();
    const user = userEvent.setup();
    renderHeader(
      { account: mockAccount },
      0,
      { theme: 'system', setTheme: mockSetTheme }
    );
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: /clair/i }));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('clicking Sombre calls setTheme("dark")', async () => {
    const mockSetTheme = vi.fn();
    const user = userEvent.setup();
    renderHeader(
      { account: mockAccount },
      0,
      { theme: 'system', setTheme: mockSetTheme }
    );
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: /sombre/i }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('theme toggle buttons are keyboard-operable (focus + Enter)', async () => {
    const mockSetTheme = vi.fn();
    const user = userEvent.setup();
    renderHeader(
      { account: mockAccount },
      0,
      { theme: 'system', setTheme: mockSetTheme }
    );
    await openMenu(user);
    const clairBtn = await screen.findByRole('button', { name: /clair/i });
    clairBtn.focus();
    await user.keyboard('{Enter}');
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});

describe('Header — responsive mobile nav', () => {
  beforeEach(() => vi.clearAllMocks());

  const NAV = ['Accueil', 'Découvrir', 'Galerie', 'Actualités', 'Lire', 'Trouver', 'Calendrier'];

  it('hamburger toggle opens a mobile nav with the 7 prototype links and closes on selection', async () => {
    const user = userEvent.setup();
    renderHeader({ account: mockAccount });

    const burger = screen.getByRole('button', { name: /ouvrir la navigation/i });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('navigation', { name: /navigation principale \(mobile\)/i })
    ).toBeNull();

    await user.click(burger);
    const mobileNav = screen.getByRole('navigation', {
      name: /navigation principale \(mobile\)/i,
    });
    for (const label of NAV) {
      expect(within(mobileNav).getByRole('link', { name: label })).toBeInTheDocument();
    }

    await user.click(within(mobileNav).getByRole('link', { name: 'Accueil' }));
    expect(
      screen.queryByRole('navigation', { name: /navigation principale \(mobile\)/i })
    ).toBeNull();
  });
});
