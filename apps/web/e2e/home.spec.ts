/**
 * DR-1 Accueil showroom — e2e acceptance suite.
 *
 * Hermetic: mocks the six public /home/* feeds via page.route (same pattern as
 * header.spec.ts / roles.spec.ts) so the suite doesn't depend on the shared dev
 * DB's seed data or ordering.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const featured = [
  { id: '1', slug: 'neon-sutra', title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 20 ch.', genre: 'Shōnen' },
  { id: '2', slug: 'lames-de-brume', title: 'Lames de Brume', cover: null, meta: 'Camille R. · 12 ch.', genre: 'Seinen' },
];
const trending = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, growthPct: 24 },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, genre: 'Seinen', likeCount: 5700, growthPct: 18 },
  { id: '3', slug: 'spectres-davril', rank: 3, title: "Spectres d'Avril", cover: null, genre: 'Fantastique', likeCount: 4000, growthPct: 12 },
  { id: '4', slug: 'lames-de-brume', rank: 4, title: 'Lames de Brume', cover: null, genre: 'Seinen', likeCount: 3400, growthPct: 9 },
];
const topCreators = {
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', avatar: null, role: 'dessinateur' },
  scenarist: { id: 's1', name: 'Camille Roux', slug: 'dr1-camille-roux', avatar: null, role: 'scenariste' },
};
const scheduled = [
  { id: 'c1', workId: 'w1', workSlug: 'lames-de-brume', workTitle: 'Lames de Brume', chapterNumber: 2, genre: 'Seinen', releaseAt: new Date(Date.now() + 86_400_000).toISOString() },
];
const ranking = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Shōnen · 8,1k ♥' },
];
const announcements = [
  { id: 'a1', type: 'concours', label: '« Prix du jeune mangaka 2026 » — clôture dans 30 j', href: '/concours' },
];

async function mockHomeFeeds(page: Page) {
  await page.route(`${API}/home/featured`, (route) => route.fulfill({ json: featured }));
  await page.route(`${API}/home/trending-this-week`, (route) => route.fulfill({ json: trending }));
  await page.route(`${API}/home/top-creators`, (route) => route.fulfill({ json: topCreators }));
  await page.route(`${API}/home/scheduled-releases`, (route) => route.fulfill({ json: scheduled }));
  await page.route(`${API}/home/ranking/all-time`, (route) => route.fulfill({ json: ranking }));
  await page.route(`${API}/home/announcements`, (route) => route.fulfill({ json: announcements }));
  await page.route(`${API}/auth/me`, (route) => route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }));
}

test.describe('Accueil showroom', () => {
  test.beforeEach(async ({ page }) => {
    await mockHomeFeeds(page);
  });

  test('renders every section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('À LA UNE')).toBeVisible();
    await expect(page.getByText('Populaires à chaud')).toBeVisible();
    await expect(page.getByText('Sorties programmées')).toBeVisible();
    await expect(page.getByText('Populaire').first()).toBeVisible();
  });

  test('community CTA band renders verbatim copy and links to /partenaires', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Une histoire à raconter,')).toBeVisible();
    const link = page.getByRole('link', { name: /trouver un·e partenaire/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/partenaires');
  });

  test('ranking sidebar renders rows and links to /classement', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside').filter({ hasText: 'Classement de tous les temps' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /néon sutra/i })).toHaveAttribute('href', '/oeuvre/neon-sutra');
    await expect(sidebar.getByRole('link', { name: /voir le classement complet/i })).toHaveAttribute('href', '/classement');
  });

  test('carousel next arrow advances the active slide', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('hero-slide-title')).toHaveText('Néon Sutra');
    await page.getByRole('button', { name: /diapositive suivante/i }).click();
    await expect(page.getByTestId('hero-slide-title')).toHaveText('Lames de Brume');
  });

  test('anonymous "＋ Ma liste" click navigates to /connexion', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /ma liste/i }).click();
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('375px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await expect(page.getByText('À LA UNE')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.scrollingElement!.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
  });
});
