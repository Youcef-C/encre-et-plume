/**
 * DR-3 Work page "Œuvre" — e2e acceptance suite.
 *
 * Hermetic: mocks /works/:slug, /works/:slug/chapters, /works/:slug/planches, /catalog (for the
 * "click a card" flow) and /auth/me via page.route (same pattern as home.spec.ts/catalog.spec.ts)
 * so the suite doesn't depend on the shared dev DB's seed data or ordering.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const work = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: null,
  genre: 'Seinen',
  format: 'Manga',
  complete: true,
  audienceRating: '16+',
  meta: 'Camille R. × Yuki M. · 20 ch.',
  publishedAt: '2024-03-14T00:00:00.000Z',
  synopsis: "L'histoire d'un duo de mangakas.",
  hashtags: ['fantasy', 'duo'],
  proseExcerpt: null,
  likeCount: 3400,
  readCount: 128000,
  favoriteCount: 340,
  ratingAvg: 4.5,
  ratingStoryAvg: 4.5,
  ratingArtAvg: 4.5,
  reviewCount: 2,
  chapterCount: 12,
  team: [
    { id: 'c1', name: 'Camille Roux', slug: 'dr1-camille-roux', role: 'scenariste', city: 'Lyon', avatar: null },
    { id: 'c2', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'dessinateur', city: 'Lyon', avatar: null },
  ],
  fundingGoals: [{ id: 'g1', title: 'Impression papier', currentCents: 45000, targetCents: 60000, pct: 75 }],
  reviews: [{ id: 'r1', authorName: 'Léa B.', storyRating: 5, artRating: 4, text: 'Superbe.', hidden: false }],
};

const chaptersPage1 = {
  items: Array.from({ length: 10 }, (_, i) => ({
    id: `ch-${i + 1}`,
    number: i + 1,
    title: i === 0 ? 'Sous la pluie' : null,
    plancheCount: 22,
    publishedAt: '2024-03-14T00:00:00.000Z',
    likeCount: 1800,
  })),
  total: 12,
  page: 1,
  pageSize: 10,
  totalPages: 2,
};
const chaptersPage2 = {
  items: [11, 12].map((n) => ({ id: `ch-${n}`, number: n, title: null, plancheCount: 15, publishedAt: '2024-11-01T00:00:00.000Z', likeCount: 400 })),
  total: 12,
  page: 2,
  pageSize: 10,
  totalPages: 2,
};

const catalogCard = {
  id: 'w1', slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen',
  chapterCount: 12, likeCount: 3400, complete: true, format: 'Manga', cover: null,
};

async function mockWorkFeeds(page: Page) {
  await page.route(`${API}/works/lames-de-brume/chapters**`, (route) => {
    const url = new URL(route.request().url());
    const p = url.searchParams.get('page');
    route.fulfill({ json: p === '2' ? chaptersPage2 : chaptersPage1 });
  });
  await page.route(`${API}/works/lames-de-brume/planches`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: work }));
  await page.route(`${API}/works/inconnu-xyz`, (route) =>
    route.fulfill({ status: 404, json: { statusCode: 404, message: 'Œuvre introuvable' } }),
  );
  await page.route(`${API}/works/inconnu-xyz/**`, (route) =>
    route.fulfill({ status: 404, json: { statusCode: 404, message: 'Œuvre introuvable' } }),
  );
  await page.route(`${API}/catalog**`, (route) =>
    route.fulfill({ json: { items: [catalogCard], total: 1, page: 1, pageSize: 12, totalPages: 1 } }),
  );
  await page.route(`${API}/catalog/trending`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/contests/active`, (route) => route.fulfill({ json: null }));
  await page.route(`${API}/catalog/editor-pick`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

test.describe('Œuvre work page', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkFeeds(page);
  });

  test('catalog card links to the work page, which renders hero, synopsis, chapters, team', async ({ page }) => {
    await page.goto('/decouvrir');
    await page.getByRole('link', { name: /lames de brume/i }).click();
    await expect(page).toHaveURL('/oeuvre/lames-de-brume');

    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeVisible();
    await expect(page.getByText("L'histoire d'un duo de mangakas.")).toBeVisible();
    await expect(page.getByText('Ch. 1 — Sous la pluie')).toBeVisible();
    await expect(page.getByText('ÉQUIPE CRÉATIVE')).toBeVisible();
    await expect(page.getByText('Camille Roux')).toBeVisible();
  });

  test('expanding "Voir les 12 chapitres" reveals more rows', async ({ page }) => {
    await page.goto('/oeuvre/lames-de-brume');
    await expect(page.getByText('Ch. 1 — Sous la pluie')).toBeVisible();
    await expect(page.getByText('Ch. 4')).not.toBeVisible();

    await page.getByRole('button', { name: 'Voir les 12 chapitres ▾' }).click();
    await expect(page.getByText('Ch. 12')).toBeVisible();
  });

  test('anonymous clicking "Ma liste" redirects to /connexion', async ({ page }) => {
    await page.goto('/oeuvre/lames-de-brume');
    await page.getByRole('button', { name: /Ma liste/ }).click();
    await expect(page).toHaveURL('/connexion');
  });

  test('unknown slug shows a 404 view', async ({ page }) => {
    await page.goto('/oeuvre/inconnu-xyz');
    await expect(page.getByText('Œuvre introuvable')).toBeVisible();
  });

  test('"Lire" links at the reader route (DR-4 stub)', async ({ page }) => {
    await page.goto('/oeuvre/lames-de-brume');
    // Scoped to <main>: the global top-nav also has a "Lire" link (to /lire), so an
    // unscoped getByRole('link', { name: 'Lire' }) matches both and violates strict mode.
    await expect(page.getByRole('main').getByRole('link', { name: 'Lire', exact: true })).toHaveAttribute(
      'href',
      '/lecteur/lames-de-brume',
    );
  });

  test('375px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/oeuvre/lames-de-brume');
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('768px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/oeuvre/lames-de-brume');
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('1280px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/oeuvre/lames-de-brume');
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });
});
