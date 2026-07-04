/**
 * DR-7 "Classement" all-time ranking — e2e acceptance suite.
 *
 * Hermetic: mocks /ranking/all-time** and /home/* + /auth/me via page.route (same pattern as
 * home.spec.ts/work.spec.ts) so the suite doesn't depend on the shared dev DB's seed data.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const allTime = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 8,1k ♥' },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, meta: 'Camille R. · 5,7k ♥' },
  { id: '3', slug: 'lames-de-brume', rank: 3, title: 'Lames de Brume', cover: null, meta: 'Yuki M. · 3,4k ♥' },
];
const seinenOnly = [{ id: '3', slug: 'lames-de-brume', rank: 1, title: 'Lames de Brume', cover: null, meta: 'Yuki M. · 3,4k ♥' }];

// Minimal home feeds so "Accueil" (and its ranking sidebar link) render.
const rankingSidebar = [{ id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Shōnen · 8,1k ♥' }];

async function mockHomeFeeds(page: Page) {
  await page.route(`${API}/home/featured`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/home/trending-this-week`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/home/top-creators`, (route) =>
    route.fulfill({ json: { artist: null, scenarist: null } }),
  );
  await page.route(`${API}/home/scheduled-releases`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/home/ranking/all-time`, (route) => route.fulfill({ json: rankingSidebar }));
  await page.route(`${API}/home/announcements`, (route) => route.fulfill({ json: [] }));
}

async function mockRanking(page: Page) {
  await page.route(`${API}/ranking/all-time**`, (route) => {
    const url = new URL(route.request().url());
    const genre = url.searchParams.get('genre');
    if (genre === 'Seinen') return route.fulfill({ json: seinenOnly });
    if (genre === 'Josei') return route.fulfill({ json: [] });
    if (genre === 'Fantastique') return route.fulfill({ status: 500, json: { statusCode: 500, message: 'boom' } });
    return route.fulfill({ json: allTime });
  });
}

test.describe('Classement all-time ranking', () => {
  test.beforeEach(async ({ page }) => {
    await mockHomeFeeds(page);
    await mockRanking(page);
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
    );
  });

  test('"Voir le classement complet" from home navigates to /classement', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /voir le classement complet/i }).click();
    await expect(page).toHaveURL('/classement');
  });

  test('default (Tout) renders the ranked rows in order with rank 1 badge and "Tout" pressed', async ({ page }) => {
    await page.goto('/classement');
    await expect(page.getByRole('heading', { level: 1, name: 'Classement' })).toBeVisible();
    const rows = page.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Néon Sutra');
    await expect(page.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking "Seinen" filters the list and updates the URL + pressed chip', async ({ page }) => {
    await page.goto('/classement');
    await expect(page.getByText('Néon Sutra')).toBeVisible();
    await page.getByRole('button', { name: 'Seinen' }).click();
    await expect(page).toHaveURL(/genre=Seinen/);
    await expect(page.getByRole('button', { name: 'Seinen' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Lames de Brume')).toBeVisible();
    await expect(page.getByText('Néon Sutra')).not.toBeVisible();
  });

  test('clicking a row title navigates to the work page', async ({ page }) => {
    await page.goto('/classement');
    await page.getByRole('link', { name: 'Néon Sutra', exact: true }).click();
    await expect(page).toHaveURL('/oeuvre/neon-sutra');
  });

  test('clicking "Lire" navigates to the work page', async ({ page }) => {
    await page.goto('/classement');
    await page.getByRole('link', { name: 'Lire — Néon Sutra' }).click();
    await expect(page).toHaveURL('/oeuvre/neon-sutra');
  });

  test('a genre with no ranked entries shows the empty-state message', async ({ page }) => {
    await page.goto('/classement?genre=Josei');
    await expect(page.getByText("Aucune œuvre dans ce genre pour l'instant.")).toBeVisible();
  });

  test('a failed fetch shows the error state, and "Réessayer" retries', async ({ page }) => {
    await page.goto('/classement?genre=Fantastique');
    await expect(page.getByText(/impossible de charger le classement/i)).toBeVisible();

    await page.route(`${API}/ranking/all-time**`, (route) => route.fulfill({ json: allTime }));
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('Néon Sutra')).toBeVisible();
  });

  for (const width of [375, 768, 1280]) {
    test(`${width}px viewport has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/classement');
      await expect(page.getByText('Néon Sutra')).toBeVisible();
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
    });
  }
});
