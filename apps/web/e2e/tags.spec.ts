/**
 * F-22 Clickable genre tags & freetext illustration hashtags — e2e acceptance suite.
 *
 * Hermetic: mocks /works/:slug, /catalog*, /illustrations*, /auth/me via page.route (same pattern
 * as work.spec.ts / illustration.spec.ts / gallery.spec.ts) so the suite doesn't depend on the
 * shared dev DB's seed data or ordering.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

// ── Fixtures — Œuvre (genre chip -> Découvrir) ────────────────────────────────
const work = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: null,
  genre: 'Seinen',
  themes: ['Aventure'],
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
  team: [],
  fundingGoals: [],
  reviews: [],
};

const chaptersPage1 = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };

const allWorks = [
  { id: 'w1', slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen', chapterCount: 12, likeCount: 3400, complete: true, format: 'Manga', cover: null },
  { id: 'w2', slug: 'neon-sutra', title: 'Néon Sutra', genre: 'Shōnen', chapterCount: 20, likeCount: 8100, complete: false, format: 'Manga', cover: null },
];
const seinenOnly = [allWorks[0]];

async function mockWorkAndCatalogFeeds(page: Page) {
  await page.route(`${API}/works/lames-de-brume/chapters**`, (route) => route.fulfill({ json: chaptersPage1 }));
  await page.route(`${API}/works/lames-de-brume/planches`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: work }));
  await page.route(`${API}/catalog/trending`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/contests/active`, (route) => route.fulfill({ json: null }));
  await page.route(`${API}/catalog/editor-pick`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/catalog?**`, (route) => {
    const url = new URL(route.request().url());
    const genres = url.searchParams.getAll('genre');
    const items = genres.includes('seinen') ? seinenOnly : allWorks;
    route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 12, totalPages: 1 } });
  });
  await page.route(`${API}/catalog`, (route) =>
    route.fulfill({ json: { items: allWorks, total: allWorks.length, page: 1, pageSize: 12, totalPages: 1 } }),
  );
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

// ── Fixtures — Illustration (genre + hashtag chips -> Galerie) ────────────────
const detail = {
  id: 'i1',
  title: 'Lames de Brume — Ch.2',
  description: 'Encrage traditionnel rehaussé de trames numériques.',
  category: 'process',
  categoryLabel: 'Process',
  genres: ['Yōkai'],
  hashtags: ['encre', 'néon'],
  image: null,
  dimensionsLabel: '2480 × 3508',
  tools: 'Encre · CSP',
  license: '© Tous droits réservés',
  likeCount: 3400,
  publishedAt: '2026-06-12T00:00:00.000Z',
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'Dessinateur·rice', city: 'Lyon', avatar: null },
};

const onibiOnly = [
  { id: 'i5', title: 'Onibi · Esprit du feu', artistName: 'Inès Khelifi', artistSlug: null, category: 'personnages', categoryLabel: 'Personnages', likeCount: 9700, thumbnail: null },
];
const encreOnly = [
  { id: 'i1', title: 'Lames de Brume — Ch.2', artistName: 'Yuki Moreau', artistSlug: 'dr1-yuki-moreau', category: 'process', categoryLabel: 'Process', likeCount: 3400, thumbnail: null },
];
const allGalleryItems = [
  ...encreOnly,
  { id: 'i2', title: 'Couverture · Néon Sutra', artistName: 'Léa B.', artistSlug: null, category: 'couvertures', categoryLabel: 'Couvertures', likeCount: 8100, thumbnail: null },
];
const summary = { illustrationCount: 14, artistCount: 7 };

async function mockIllustrationAndGalleryFeeds(page: Page) {
  await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/illustrations/*/preview`, (route) => route.fulfill({ json: detail }));
  await page.route(`${API}/illustrations/*/more`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/illustrations/i1`, (route) => route.fulfill({ json: detail }));
  await page.route(`${API}/illustrations?**`, (route) => {
    const url = new URL(route.request().url());
    const genre = url.searchParams.getAll('genre');
    const tag = url.searchParams.get('tag');
    let items = allGalleryItems;
    if (genre.includes('yokai')) items = onibiOnly;
    if (tag === 'encre') items = encreOnly;
    route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 12, totalPages: 1, summary } });
  });
  await page.route(`${API}/illustrations`, (route) =>
    route.fulfill({ json: { items: allGalleryItems, total: allGalleryItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
  );
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

test.describe('F-22 — clickable genre tags & freetext hashtags', () => {
  test('1. clicking a genre chip on an œuvre opens Découvrir filtered to that genre', async ({ page }) => {
    await mockWorkAndCatalogFeeds(page);
    await page.goto('/oeuvre/lames-de-brume');

    await page.getByRole('link', { name: 'Filtrer par Seinen' }).first().click();

    await expect(page).toHaveURL('/decouvrir?genre=seinen');
    await expect(page.getByRole('button', { name: 'Retirer le filtre Seinen' })).toBeVisible();
    await expect(page.locator('.ep-catalog-grid').getByText('Lames de Brume')).toBeVisible();
    await expect(page.locator('.ep-catalog-grid').getByText('Néon Sutra')).not.toBeVisible();
  });

  test('2. clicking a genre chip on an illustration opens Galerie filtered to that genre', async ({ page }) => {
    await mockIllustrationAndGalleryFeeds(page);
    await page.goto('/illustration/i1');

    await page.getByRole('link', { name: 'Filtrer par Yōkai' }).click();

    await expect(page).toHaveURL('/galerie?genre=yokai');
    await expect(page.getByRole('button', { name: 'Retirer Yōkai' })).toBeVisible();
    await expect(page.getByText('Onibi · Esprit du feu')).toBeVisible();
    await expect(page.getByText('Lames de Brume — Ch.2')).not.toBeVisible();
  });

  test('3. clicking a hashtag chip on an illustration opens Galerie filtered to that exact tag; the active #tag chip is removable', async ({ page }) => {
    await mockIllustrationAndGalleryFeeds(page);
    await page.goto('/illustration/i1');

    await page.getByRole('link', { name: 'Rechercher le hashtag #encre' }).click();

    await expect(page).toHaveURL('/galerie?tag=encre');
    await expect(page.getByText('Lames de Brume — Ch.2')).toBeVisible();
    await expect(page.getByText('Couverture · Néon Sutra')).not.toBeVisible();

    const removeChip = page.getByRole('button', { name: 'Retirer #encre' });
    await expect(removeChip).toBeVisible();
    await removeChip.click();
    await expect(page).not.toHaveURL(/tag=/);
    await expect(page.getByText('Couverture · Néon Sutra')).toBeVisible();
  });

  test('4. typing a hashtag in the Galerie tag filter narrows the grid (auto-applied, debounced)', async ({ page }) => {
    await mockIllustrationAndGalleryFeeds(page);
    await page.goto('/galerie');
    await expect(page.getByText('Couverture · Néon Sutra')).toBeVisible();

    await page.getByLabel('#hashtag…').fill('encre');

    await expect(page).toHaveURL(/tag=encre/, { timeout: 2000 });
    await expect(page.getByText('Couverture · Néon Sutra')).not.toBeVisible();
    await expect(page.getByText('Lames de Brume — Ch.2')).toBeVisible();
  });

  test('3b. at 375px, the hashtag chip is clickable and wraps without overflow', async ({ page }) => {
    await mockIllustrationAndGalleryFeeds(page);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/illustration/i1');

    await page.getByRole('link', { name: 'Rechercher le hashtag #encre' }).click();
    await expect(page).toHaveURL('/galerie?tag=encre');
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  // ── Regression: DR-10 mature/18+ signals stay intact when the tag rows change ──
  // Vocabulary note (2026-07-05): Yaoi/Yuri/Ecchi flipped from mature-only to plus18 — an
  // illustration whose genre resolves to one of these must still hard-gate (blur + badge) in the
  // Galerie grid, even with an unrelated `tag` facet active (F-22 additive, DR-10 untouched).
  test('regression: a Yaoi-genre illustration is still blurred + "18+" badged in Galerie with a tag filter active', async ({ page }) => {
    const gatedItems = [
      { ...encreOnly[0], is18plus: false },
      { id: 'i9', title: 'Nuit close', artistName: 'Yuki Moreau', artistSlug: 'dr1-yuki-moreau', category: 'process', categoryLabel: 'Process', likeCount: 200, thumbnail: null, is18plus: true },
    ];
    await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/illustrations?**`, (route) =>
      route.fulfill({ json: { items: gatedItems, total: gatedItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
    );
    await page.route(`${API}/illustrations`, (route) =>
      route.fulfill({ json: { items: gatedItems, total: gatedItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
    );
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
    );

    await page.goto('/galerie?tag=encre');
    await expect(page.getByRole('img', { name: 'Illustration 18+' })).toBeVisible();
  });

  test('regression: the illustration detail "Contenu mature"/18+ interstitial is unaffected by the new genres chip row', async ({ page }) => {
    await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/illustrations/*/more`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/illustrations/i1`, (route) => route.fulfill({ json: { ...detail, genres: ['Yaoi'], is18plus: true } }));
    await page.route(`${API}/illustrations?**`, (route) =>
      route.fulfill({ json: { items: allGalleryItems, total: allGalleryItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
    );
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
    );

    await page.goto('/illustration/i1');
    await expect(page.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeVisible();
  });
});
