/**
 * DR-7 "Classement" all-time ranking — e2e acceptance suite.
 *
 * Category tabs (user-requested 2026-07-05 — replaces the genre-filter chips): Mangas, Romans,
 * Illustrations, Dessinateurs & Scénaristes, each backed by GET /ranking?category=. The row
 * action verb also depends on the category (polish fix, 2026-07-05): "Lire" for mangas/romans,
 * "Voir" for illustrations, "Voir le profil" for créateurs.
 *
 * Hermetic: mocks /ranking** and /home/* + /auth/me via page.route (same pattern as
 * home.spec.ts/work.spec.ts) so the suite doesn't depend on the shared dev DB's seed data.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const mangas = [
  { id: '1', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 8,1k ♥', href: '/oeuvre/neon-sutra', is18plus: false },
  { id: '2', rank: 2, title: 'Le Dernier Ronin', cover: null, meta: 'Camille R. · 5,7k ♥', href: '/oeuvre/le-dernier-ronin', is18plus: false },
  { id: '3', rank: 3, title: 'Lames de Brume', cover: null, meta: 'Yuki M. · 3,4k ♥', href: '/oeuvre/lames-de-brume', is18plus: false },
];
const createurs = [
  { id: '4', rank: 1, title: 'Yuki Moreau', cover: null, meta: 'Dessinateur·rice', href: '/dr1-yuki-moreau', is18plus: false },
];
const illustrations = [
  { id: '5', rank: 1, title: 'Pluie de Néons', cover: null, meta: 'Yuki Moreau · Couvertures · 12401 ♥', href: '/illustration/abc', is18plus: false },
];

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
  await page.route(`${API}/ranking**`, (route) => {
    const url = new URL(route.request().url());
    const category = url.searchParams.get('category');
    if (category === 'createurs') return route.fulfill({ json: createurs });
    if (category === 'illustrations') return route.fulfill({ json: illustrations });
    // DR-14: a 500 is TRANSIENT now (skeleton + silent retry), so the fixture that must reach the
    // red block is a terminal 4xx. The transient path has its own test below.
    if (category === 'romans') return route.fulfill({ status: 403, json: { statusCode: 403, message: 'boom', error: 'FORBIDDEN' } });
    return route.fulfill({ json: mangas });
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

  test('default (Mangas) renders the ranked rows in order with rank 1 badge and "Mangas" pressed', async ({ page }) => {
    await page.goto('/classement');
    await expect(page.getByRole('heading', { level: 1, name: 'Classement' })).toBeVisible();
    const rows = page.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Néon Sutra');
    await expect(page.getByRole('button', { name: 'Mangas' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking "Dessinateurs & Scénaristes" filters the list and updates the URL + pressed tab', async ({ page }) => {
    await page.goto('/classement');
    await expect(page.getByText('Néon Sutra')).toBeVisible();
    await page.getByRole('button', { name: 'Dessinateurs & Scénaristes' }).click();
    await expect(page).toHaveURL(/category=createurs/);
    await expect(page.getByRole('button', { name: 'Dessinateurs & Scénaristes' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Yuki Moreau')).toBeVisible();
    await expect(page.getByText('Néon Sutra')).not.toBeVisible();
  });

  test('clicking a row title navigates to the row href', async ({ page }) => {
    await page.goto('/classement');
    await page.getByRole('link', { name: 'Néon Sutra', exact: true }).click();
    await expect(page).toHaveURL('/oeuvre/neon-sutra');
  });

  test('clicking "Lire" navigates to the row href', async ({ page }) => {
    await page.goto('/classement');
    await page.getByRole('link', { name: 'Lire — Néon Sutra' }).click();
    await expect(page).toHaveURL('/oeuvre/neon-sutra');
  });

  test('the row action reads "Voir" for illustrations and "Voir le profil" for créateurs', async ({ page }) => {
    await page.goto('/classement?category=illustrations');
    await expect(page.getByRole('link', { name: 'Voir — Pluie de Néons' })).toBeVisible();

    await page.goto('/classement?category=createurs');
    await expect(page.getByRole('link', { name: 'Voir le profil — Yuki Moreau' })).toBeVisible();
  });

  test('a category with no ranked entries shows the empty-state message', async ({ page }) => {
    await page.route(`${API}/ranking**`, (route) => route.fulfill({ json: [] }));
    await page.goto('/classement?category=illustrations');
    await expect(page.getByText("Aucune entrée dans ce classement pour l'instant.")).toBeVisible();
  });

  test('a terminal failed fetch shows the error state, and "Réessayer" retries', async ({ page }) => {
    await page.goto('/classement?category=romans');
    await expect(page.getByText(/impossible de charger le classement/i)).toBeVisible();

    await page.route(`${API}/ranking**`, (route) => route.fulfill({ json: mangas }));
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('Néon Sutra')).toBeVisible();
  });

  // DR-14 F1 — a 5xx keeps the skeleton and retries behind the toast; the red block never appears.
  test('a transient failed fetch keeps the skeleton and retries behind the toast', async ({ page }) => {
    let failing = true;
    await page.route(`${API}/ranking**`, (route) =>
      failing
        ? route.fulfill({ status: 503, json: { statusCode: 503, message: 'boom', error: 'UNAVAILABLE' } })
        : route.fulfill({ json: mangas }),
    );
    await page.goto('/classement');

    await expect(page.getByText(/impossible de charger le classement/i)).toHaveCount(0);
    await expect(page.getByText('Connexion instable — nouvelle tentative…')).toBeVisible({ timeout: 15_000 });

    failing = false;
    await expect(page.getByText('Néon Sutra')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(/impossible de charger le classement/i)).toHaveCount(0);
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
