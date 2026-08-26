/**
 * DR-14 — Chargement résilient : squelette + réessai + toast.
 *
 * Hermetic (page.route only, no DB): a transient failure must keep the catalogue's skeleton, raise
 * the single merged toast and never draw the red block; once the request succeeds the grid appears
 * and the toast goes away. The terminal path (a 404 on an œuvre) must still be immediate.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const works = [
  { id: '1', slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen', chapterCount: 12, likeCount: 3400, complete: true, format: 'Manga', cover: null },
];
const trending = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, growthPct: 24 },
];

const TOAST = 'Connexion instable — nouvelle tentative…';
/** The red block DR-14 must never show for a transient failure (byte-identical to CatalogGrid). */
const RED_BLOCK = 'Impossible de charger le catalogue. Veuillez réessayer.';

async function mockRailFeeds(page: Page) {
  await page.route(`${API}/catalog/trending`, (route) => route.fulfill({ json: trending }));
  await page.route(`${API}/contests/active`, (route) => route.fulfill({ json: null }));
  await page.route(`${API}/catalog/editor-pick`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

const catalogPage = { items: works, total: works.length, page: 1, pageSize: 12, totalPages: 1 };

/**
 * Route ONLY the catalogue list (`/catalog` and `/catalog?…`) — not `/catalog/trending` or
 * `/catalog/editor-pick`, which a `/catalog**` glob would also swallow (and it wins over the rail
 * routes, being registered later).
 */
async function mockCatalogList(page: Page, failing: { value: boolean }) {
  const handler = (route: Parameters<Parameters<Page['route']>[1]>[0]) =>
    failing.value ? route.abort() : route.fulfill({ json: catalogPage });
  await page.route(`${API}/catalog`, handler);
  await page.route(`${API}/catalog?**`, handler);
}

test.describe('DR-14 — chargement résilient', () => {
  test.beforeEach(async ({ page }) => {
    await mockRailFeeds(page);
  });

  test('a transient failure keeps the skeleton, raises the toast, and never shows a red block', async ({ page }) => {
    // Fail every catalogue request until the test lets one through.
    const failing = { value: true };
    await mockCatalogList(page, failing);

    await page.goto('/decouvrir');

    // The skeleton stays — announced as a loading status, not an alert.
    await expect(page.getByLabel('Chargement du catalogue…')).toBeVisible();
    await expect(page.getByText(RED_BLOCK)).toHaveCount(0);

    // The toast appears only once the first RE-try has also failed (~0,5 s later).
    await expect(page.getByText(TOAST)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TOAST)).toHaveCount(1); // merged, never a stack
    await expect(page.getByText(RED_BLOCK)).toHaveCount(0);

    // Let the request through: the grid renders and the toast disappears.
    failing.value = false;
    await expect(page.locator('.ep-catalog-grid').getByText('Lames de Brume')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(TOAST)).toHaveCount(0);
    await expect(page.getByText(RED_BLOCK)).toHaveCount(0);
  });

  test('« Réessayer maintenant » retries immediately and clears the toast', async ({ page }) => {
    const failing = { value: true };
    await mockCatalogList(page, failing);

    await page.goto('/decouvrir');
    const action = page.getByRole('button', { name: 'Réessayer maintenant' });
    await expect(action).toBeVisible({ timeout: 15_000 });

    failing.value = false;
    await action.click();
    await expect(page.locator('.ep-catalog-grid').getByText('Lames de Brume')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(TOAST)).toHaveCount(0);
  });

  test('the terminal 404 path does not regress: « Œuvre introuvable » is immediate', async ({ page }) => {
    let calls = 0;
    await page.route(`${API}/works/inconnu-xyz**`, (route) => {
      calls += 1;
      return route.fulfill({ status: 404, json: { statusCode: 404, message: 'Œuvre introuvable', error: 'NOT_FOUND' } });
    });

    await page.goto('/oeuvre/inconnu-xyz');
    await expect(page.getByText('Œuvre introuvable')).toBeVisible();
    await expect(page.getByText(TOAST)).toHaveCount(0);

    // No retry loop on a terminal failure.
    await page.waitForTimeout(1500);
    expect(calls).toBe(1);
  });

  test('the toast stays readable and tappable at 375 / 768 / 1280', async ({ page }) => {
    await mockCatalogList(page, { value: true });

    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/decouvrir');

      const toast = page.getByText(TOAST);
      await expect(toast).toBeVisible({ timeout: 15_000 });

      const box = (await toast.locator('xpath=ancestor-or-self::*[@role="status"]').first().boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);

      const action = page.getByRole('button', { name: 'Réessayer maintenant' });
      const actionBox = (await action.boundingBox())!;
      expect(actionBox.height).toBeGreaterThanOrEqual(44);

      // No horizontal overflow on the page itself.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
});
