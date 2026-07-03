/**
 * DR-2 Catalog "Découvrir" — e2e acceptance suite.
 *
 * Hermetic: mocks /catalog*, /catalog/trending, /contests/active, /catalog/editor-pick and
 * /auth/me via page.route (same pattern as home.spec.ts) so the suite doesn't depend on the
 * shared dev DB's seed data or ordering.
 *
 * Round 2 (2026-07-03, user-revised sidebar + QA tap-target blocker): the sidebar auto-applies
 * every change (no "Appliquer les filtres" button), GENRE is driven via the full-vocabulary
 * searchbar-to-add-tags picker, and chip tap targets are re-measured at 375px (the round-1
 * blocking finding).
 * Round 2b: PUBLIC reverted to multi-select ("Mature"/"+18" toggle independently, "Tous public"
 * clears both) — supersedes round 2's single-select PUBLIC test.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const allWorks = [
  { id: '1', slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen', chapterCount: 12, likeCount: 3400, complete: true, format: 'Manga', cover: null },
  { id: '2', slug: 'neon-sutra', title: 'Néon Sutra', genre: 'Shōnen', chapterCount: 20, likeCount: 8100, complete: false, format: 'Manga', cover: null },
];
const seinenOnly = [allWorks[0]];

const trending = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, growthPct: 24 },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, genre: 'Seinen', likeCount: 5700, growthPct: 18 },
  { id: '3', slug: 'encre-blanche', rank: 3, title: 'Encre Blanche', cover: null, genre: 'Josei', likeCount: 2200, growthPct: 12 },
];
const contest = {
  id: 'c1',
  category: 'CONCOURS',
  title: 'Prix du jeune mangaka 2026',
  subtitle: 'Doté par un éditeur · clôture 30 j',
  ctaLabel: 'Participer',
  href: '/concours',
};
const editorPicks = [{ id: 'p1', workSlug: 'encre-blanche', blurb: '« Encre Blanche » repéré par une maison partenaire' }];

async function mockCatalogFeeds(page: Page) {
  await page.route(`${API}/catalog/trending`, (route) => route.fulfill({ json: trending }));
  await page.route(`${API}/contests/active`, (route) => route.fulfill({ json: contest }));
  await page.route(`${API}/catalog/editor-pick`, (route) => route.fulfill({ json: editorPicks }));
  await page.route(`${API}/catalog?**`, (route) => {
    const url = new URL(route.request().url());
    const genres = url.searchParams.getAll('genre');
    const q = url.searchParams.get('q');
    let items = genres.includes('seinen') ? seinenOnly : allWorks;
    if (q) items = items.filter((w) => w.title.toLowerCase().includes(q.toLowerCase()));
    route.fulfill({
      json: { items, total: items.length, page: 1, pageSize: 12, totalPages: 1 },
    });
  });
  await page.route(`${API}/catalog`, (route) =>
    route.fulfill({ json: { items: allWorks, total: allWorks.length, page: 1, pageSize: 12, totalPages: 1 } }),
  );
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

test.describe('Découvrir catalog', () => {
  test.beforeEach(async ({ page }) => {
    await mockCatalogFeeds(page);
  });

  test('renders the catalog with filter sidebar, results and rail', async ({ page }) => {
    await page.goto('/decouvrir');
    await expect(page.getByText('Filtrer')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
    await expect(page.locator('.ep-catalog-grid').getByText('Lames de Brume')).toBeVisible();
    // "Actualités" also appears as a top-nav link — scope to the rail heading.
    await expect(page.locator('.ep-catalog-rail').getByText('Actualités')).toBeVisible();
    await expect(page.getByText('Prix du jeune mangaka 2026')).toBeVisible();
  });

  test('no "Appliquer les filtres" button — the sidebar auto-applies (round 2)', async ({ page }) => {
    await page.goto('/decouvrir');
    await expect(page.getByRole('button', { name: /appliquer/i })).toHaveCount(0);
  });

  test('adding a genre via the picker narrows the grid and updates the URL immediately (F17)', async ({ page }) => {
    await page.goto('/decouvrir');
    // "Néon Sutra" also appears in the "En vogue" rail — scope assertions to the results grid.
    const grid = page.locator('.ep-catalog-grid');
    await expect(grid.getByText('Néon Sutra')).toBeVisible();

    await page.getByRole('combobox', { name: 'Ajouter un genre' }).fill('Seinen');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/genre=seinen/);
    await expect(grid.getByText('Lames de Brume')).toBeVisible();
    await expect(grid.getByText('Néon Sutra')).not.toBeVisible();
  });

  test('PUBLIC is multi-select — "Mature" and "+18" toggle independently, "Tous public" clears both (round 2b)', async ({ page }) => {
    await page.goto('/decouvrir');
    // Once active, "Mature"/"+18" also appear in the active-filter chips' aria-labels
    // ("Retirer le filtre Mature") — use exact match on the sidebar chip itself.
    const matureChip = page.getByRole('button', { name: 'Mature', exact: true });
    const eighteenChip = page.getByRole('button', { name: '+18', exact: true });

    await matureChip.click();
    await expect(page).toHaveURL(/public=mature/);
    await expect(matureChip).toHaveAttribute('aria-pressed', 'true');

    await eighteenChip.click();
    await expect(page).toHaveURL(/public=mature/);
    await expect(page).toHaveURL(/public=18plus/);
    await expect(matureChip).toHaveAttribute('aria-pressed', 'true');
    await expect(eighteenChip).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Tous public', exact: true }).click();
    await expect(page).not.toHaveURL(/public=/);
  });

  test('typing in the search box auto-applies after a debounce (no submit)', async ({ page }) => {
    await page.goto('/decouvrir');
    const grid = page.locator('.ep-catalog-grid');
    await expect(grid.getByText('Néon Sutra')).toBeVisible();

    await page.getByLabel('Titre, auteur…').fill('Néon');

    await expect(page).toHaveURL(/q=N/, { timeout: 2000 });
    await expect(grid.getByText('Lames de Brume')).not.toBeVisible();
    await expect(grid.getByText('Néon Sutra')).toBeVisible();
  });

  test('result count is announced in an aria-live region', async ({ page }) => {
    await page.goto('/decouvrir');
    const region = page.locator('[aria-live="polite"]', { hasText: 'résultats' });
    await expect(region).toBeVisible();
    await expect(region).toHaveText(`${allWorks.length} résultats`);
  });

  test('removing an active-filter chip updates the URL and grid (F13)', async ({ page }) => {
    await page.goto('/decouvrir?genre=seinen');
    // "Néon Sutra" also appears in the "En vogue" rail — scope assertions to the results grid.
    const grid = page.locator('.ep-catalog-grid');
    await expect(grid.getByText('Lames de Brume')).toBeVisible();
    await expect(grid.getByText('Néon Sutra')).not.toBeVisible();
    await page.getByRole('button', { name: 'Retirer le filtre Seinen' }).click();
    await expect(page).not.toHaveURL(/genre=seinen/);
    await expect(grid.getByText('Néon Sutra')).toBeVisible();
  });

  test('"Tout effacer" clears every active filter', async ({ page }) => {
    await page.goto('/decouvrir?genre=seinen');
    await page.getByRole('button', { name: 'Tout effacer' }).click();
    await expect(page).not.toHaveURL(/genre=seinen/);
  });

  test('empty state shows a "Réinitialiser" affordance', async ({ page }) => {
    await page.route(`${API}/catalog?**`, (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 } }),
    );
    await page.goto('/decouvrir?genre=seinen');
    await expect(page.getByText(/aucun résultat/i)).toBeVisible();
    // The sidebar also has its own "Réinitialiser" affordance (F1) — the empty-state one is the
    // second in DOM order (grid column renders after the sidebar).
    await expect(page.getByRole('button', { name: 'Réinitialiser' }).last()).toBeVisible();
  });

  test('a card links to /oeuvre/[slug]', async ({ page }) => {
    await page.goto('/decouvrir');
    const link = page.getByRole('link', { name: /lames de brume/i });
    await expect(link).toHaveAttribute('href', '/oeuvre/lames-de-brume');
  });

  test('375px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/decouvrir');
    await expect(page.getByText('Filtrer')).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('375px viewport — FORMAT/PUBLIC/LANGUE/genre chip tap targets are >=44px tall (QA blocker re-check)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/decouvrir?genre=seinen');
    for (const name of ['Manga', 'One-shot', 'Roman', 'Tous public', 'Mature', '+18', 'Français', 'English', '日本語']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, `chip "${name}" should have a bounding box`).not.toBeNull();
      expect(box!.height, `chip "${name}" tap target`).toBeGreaterThanOrEqual(44);
    }
  });

  test('768px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/decouvrir');
    await expect(page.getByText('Filtrer')).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('1280px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/decouvrir');
    await expect(page.getByText('Filtrer')).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });
});
