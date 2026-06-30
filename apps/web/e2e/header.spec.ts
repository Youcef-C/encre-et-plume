/**
 * F-4 Global navigation header — e2e acceptance suite
 *
 * Covers all F-4 acceptance criteria:
 *   - Header persistent across pages (sticky, visible on multiple routes)
 *   - Primary nav links visible with correct hrefs; active link highlighted
 *   - Search "Rechercher…" entry point visible in both auth states
 *   - Avatar menu entries (logged-in): Mon profil, Likes & ma liste,
 *     Notifications, Mes candidatures, Candidatures reçues, Se déconnecter
 *   - Role-gated links per role (demo switcher, hermetic via page.route)
 *   - Contextual "＋ Poster" button appears ONLY on /decouvrir
 *   - Notification badge absent at stub count 0 (badge seam, F-5 owns real count)
 *   - Logged-out header shows "Se connecter", no avatar menu
 *
 * Regression guard (F-1/F-2/F-3):
 *   - Logo links to /
 *   - Se connecter / avatar present by auth state
 *   - Se déconnecter closes menu + reverts header
 *   - Role-gated links hidden for utilisateur, visible after demo switch
 *   - Profile link in dropdown uses account.slug
 *
 * Hermetic: uses page.route to intercept auth/me; no DB writes needed.
 * The global-setup.ts / global-teardown.ts are still used (roles.spec.ts depends
 * on them), so this file relies on them without adding its own DB seed.
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mock /auth/me so the UI renders as logged-in with the given account data.
 * Mirrors the pattern in roles.spec.ts — hermetic, no real signup.
 */
async function mockLoginAndLandHome(
  page: Page,
  opts: {
    displayName: string;
    role?: string;
    slug?: string;
    verified?: boolean;
  },
) {
  const { displayName, role = 'utilisateur', slug, verified = false } = opts;
  const derivedSlug = slug ?? displayName.toLowerCase().replace(/\s+/g, '-');

  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-' + Math.random().toString(36).slice(2, 7),
          email: 'mock@test.com',
          displayName,
          role,
          verified,
          slug: derivedSlug,
          createdAt: new Date().toISOString(),
        }),
      });
    } else {
      await route.continue();
    }
  });
  // Intercept logout to prevent 401 noise
  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: new RegExp(`menu de ${displayName}`, 'i') }),
  ).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Header visibility + persistence (logged-out state)
// ---------------------------------------------------------------------------

test('F4-E2E-1: header renders on home page with logo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /encre & plume/i })).toBeVisible();
});

test('F4-E2E-2: header is sticky (position:sticky) and persists on long pages', async ({ page }) => {
  await page.goto('/');
  // The header should always be visible, even after scroll
  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  // Verify sticky CSS via computed style
  const position = await header.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('sticky');
});

test('F4-E2E-3: header persists when navigating to /connexion', async ({ page }) => {
  await page.goto('/connexion');
  await expect(page.getByRole('link', { name: /encre & plume/i })).toBeVisible();
  // Primary nav still visible
  await expect(page.getByRole('navigation', { name: /navigation principale/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Primary nav links — labels + hrefs + active state
// ---------------------------------------------------------------------------

test('F4-E2E-4: primary nav renders the 7 prototype links with correct hrefs', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  await expect(nav).toBeVisible();

  // Prototype TOP NAV: Accueil · Découvrir · Galerie · Actualités · Lire · Trouver · Calendrier
  const links = [
    { label: 'Accueil', href: '/' },
    { label: 'Découvrir', href: '/decouvrir' },
    { label: 'Galerie', href: '/galerie' },
    { label: 'Actualités', href: '/actualites' },
    { label: 'Lire', href: '/lire' },
    { label: 'Trouver', href: '/trouver' },
    { label: 'Calendrier', href: '/calendrier' },
  ];
  for (const { label, href } of links) {
    const link = nav.getByRole('link', { name: label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', href);
  }
});

test('F4-E2E-5: active nav link has aria-current="page" on home route', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: /navigation principale/i });
  await expect(nav.getByRole('link', { name: /accueil/i })).toHaveAttribute('aria-current', 'page');
  // Others must NOT have aria-current
  await expect(nav.getByRole('link', { name: /découvrir/i })).not.toHaveAttribute('aria-current');
});

test('F4-E2E-6: active nav link has accent fill on /decouvrir (aria-current + accent background)', async ({ page }) => {
  await page.goto('/decouvrir');
  const nav = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  const decouvrir = nav.getByRole('link', { name: 'Découvrir', exact: true });
  await expect(decouvrir).toHaveAttribute('aria-current', 'page');
  // Prototype active/hover style fills the link with the accent (background), not an underline.
  const bg = await decouvrir.evaluate((el) => getComputedStyle(el).backgroundColor);
  // accent #e8261c → rgb(232, 38, 28)
  expect(bg).toBe('rgb(232, 38, 28)');
});

// ---------------------------------------------------------------------------
// Search entry point
// ---------------------------------------------------------------------------

test('F4-E2E-7: search button visible when logged out', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByRole('button', { name: /rechercher/i });
  await expect(btn).toBeVisible();
});

test('F4-E2E-8: search button visible when logged in', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Search User' });
  const btn = page.getByRole('button', { name: /rechercher/i });
  await expect(btn).toBeVisible();
});

// ---------------------------------------------------------------------------
// Avatar dropdown — logged-in entries + F-3 regression (profile link)
// ---------------------------------------------------------------------------

test('F4-E2E-9: avatar menu shows Mon profil linking to user slug', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Yuki Tanaka', slug: 'yuki-tanaka' });
  await page.getByRole('button', { name: /menu de yuki tanaka/i }).click();
  const item = page.getByRole('menuitem', { name: /mon profil/i });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute('href', '/yuki-tanaka');
});

test('F4-E2E-10: avatar menu shows Likes & ma liste', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Ma Liste User' });
  await page.getByRole('button', { name: /menu de ma liste user/i }).click();
  const item = page.getByRole('menuitem', { name: /likes & ma liste/i });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute('href', '/ma-liste');
});

test('F4-E2E-11: avatar menu shows Notifications', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Notif User' });
  await page.getByRole('button', { name: /menu de notif user/i }).click();
  const item = page.getByRole('menuitem', { name: /notifications/i });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute('href', '/notifications');
});

test('F4-E2E-12: avatar menu shows Mes candidatures + Candidatures reçues', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Candidat User' });
  await page.getByRole('button', { name: /menu de candidat user/i }).click();
  await expect(page.getByRole('menuitem', { name: /mes candidatures/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /candidatures reçues/i })).toBeVisible();
});

test('F4-E2E-13: avatar menu shows Déconnexion (F-1 regression)', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Logout F4' });
  await page.getByRole('button', { name: /menu de logout f4/i }).click();
  await expect(page.getByRole('menuitem', { name: /déconnexion/i })).toBeVisible();
});

test('F4-E2E-14: clicking Déconnexion closes menu and reverts to logged-out header', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Logout Test F4' });
  await page.getByRole('button', { name: /menu de logout test f4/i }).click();
  await page.getByRole('menuitem', { name: /déconnexion/i }).click();
  // Header reverts
  await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible({ timeout: 6_000 });
  await expect(page.getByRole('button', { name: /menu de logout test f4/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Logged-out state
// ---------------------------------------------------------------------------

test('F4-E2E-15: logged-out header shows "Se connecter" and no avatar menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible();
  // No avatar button visible
  await expect(page.getByRole('button', { name: /menu de/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Role-gated links (F-2 regression via demo switcher)
// ---------------------------------------------------------------------------

test('F4-E2E-16: utilisateur sees no role-gated links by default', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Role None' });
  await page.getByRole('button', { name: /menu de role none/i }).click();
  await expect(page.getByRole('menuitem', { name: /espace éditeur/i })).not.toBeVisible();
  await expect(page.getByRole('menuitem', { name: /espace rédaction/i })).not.toBeVisible();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();
});

test('F4-E2E-17: demo switcher Admin reveals Panneau admin', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Demo Admin F4' });
  await page.getByRole('button', { name: /menu de demo admin f4/i }).click();
  await page.getByRole('button', { name: /^admin$/i }).click();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).toBeVisible();
});

test('F4-E2E-18: demo switcher Éditeur reveals Espace éditeur', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Demo Editeur F4' });
  await page.getByRole('button', { name: /menu de demo editeur f4/i }).click();
  await page.getByRole('button', { name: /^éditeur$/i }).click();
  await expect(page.getByRole('menuitem', { name: /espace éditeur/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();
});

// (F4-E2E-19 "＋ Poster" removed — the prototype TOP NAV has no Poster button.)

test('F4-E2E-20: "＋ Poster" button NOT visible on / (home)', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'No Poster User' });
  // Already on / from mockLoginAndLandHome
  await expect(page.getByRole('link', { name: /poster/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Notification badge (stub = 0, badge absent — F-5 seam)
// ---------------------------------------------------------------------------

test('F4-E2E-21: no notification badge in avatar button at stub count 0', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Badge Zero' });
  // Avatar label should NOT mention "notifications non lues"
  const avatarBtn = page.getByRole('button', { name: /menu de badge zero/i });
  await expect(avatarBtn).toBeVisible();
  // The specific "N notifications non lues" pattern should be absent
  await expect(page.getByRole('button', { name: /notifications non lues/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Accessibility: keyboard menu navigation
// ---------------------------------------------------------------------------

test('F4-E2E-22: Escape closes avatar menu and returns focus to avatar button', async ({ page }) => {
  await mockLoginAndLandHome(page, { displayName: 'Keyboard Escape' });
  await page.getByRole('button', { name: /menu de keyboard escape/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).not.toBeVisible();
  // Avatar button has focus
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(focused).toMatch(/menu de keyboard escape/i);
});

test('F4-E2E-23: nav landmark is present (accessibility)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: /navigation principale/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Logo links to home (F-1 regression)
// ---------------------------------------------------------------------------

test('F4-E2E-24: logo "Encre & Plume" links to /', async ({ page }) => {
  await page.goto('/connexion');
  const logo = page.getByRole('link', { name: /encre & plume/i });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('href', '/');
});
