/**
 * DR-5 Illustration gallery "Galerie" — e2e acceptance suite.
 *
 * Hermetic: mocks /illustrations*, /illustrations/trending, /illustrations/:id/preview and
 * /auth/me via page.route (same pattern as catalog.spec.ts) so the suite doesn't depend on the
 * shared dev DB's seed data or ordering. NOT run this session — for QA/CI to execute.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const allItems = [
  { id: 'i1', title: 'Lames de Brume — Ch.2', artistName: 'Yuki Moreau', artistSlug: 'dr1-yuki-moreau', category: 'process', categoryLabel: 'Process', likeCount: 3400, thumbnail: null },
  { id: 'i2', title: 'Couverture · Néon Sutra', artistName: 'Léa B.', artistSlug: null, category: 'couvertures', categoryLabel: 'Couvertures', likeCount: 8100, thumbnail: null },
];
const fanartOnly = [
  { id: 'i3', title: 'Fan-art · Le Dernier Ronin', artistName: 'Sasha N.', artistSlug: null, category: 'fanart', categoryLabel: 'Fan-art', likeCount: 6200, thumbnail: null },
];
const onibiOnly = [
  { id: 'i5', title: 'Onibi · Esprit du feu', artistName: 'Inès Khelifi', artistSlug: null, category: 'personnages', categoryLabel: 'Personnages', likeCount: 9700, thumbnail: null },
];
const summary = { illustrationCount: 14, artistCount: 7 };

const trending = [
  { id: 'i4', title: 'Pluie de Néons', artistName: 'Yuki Moreau', artistSlug: 'dr1-yuki-moreau', category: 'couvertures', categoryLabel: 'Couvertures', likeCount: 12400, thumbnail: null, rank: 1 },
  { id: 'i5', title: 'Onibi · Esprit du feu', artistName: 'Inès Khelifi', artistSlug: null, category: 'personnages', categoryLabel: 'Personnages', likeCount: 9700, thumbnail: null, rank: 2 },
];

const preview = {
  id: 'i1',
  title: 'Lames de Brume — Ch.2',
  artistName: 'Yuki Moreau',
  artistSlug: 'dr1-yuki-moreau',
  category: 'process',
  categoryLabel: 'Process',
  likeCount: 3400,
  image: null,
};

async function mockGalleryFeeds(page: Page) {
  await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: trending }));
  await page.route(`${API}/illustrations/*/preview`, (route) => route.fulfill({ json: preview }));
  await page.route(`${API}/illustrations?**`, (route) => {
    const url = new URL(route.request().url());
    const category = url.searchParams.get('category');
    const tri = url.searchParams.get('tri');
    const q = url.searchParams.get('q');
    const genre = url.searchParams.getAll('genre');
    let items = category === 'fanart' ? fanartOnly : allItems;
    if (q === 'onibi') items = onibiOnly;
    if (genre.includes('yokai')) items = onibiOnly;
    if (tri === 'populaires') items = [...items].sort((a, b) => b.likeCount - a.likeCount);
    route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 12, totalPages: 1, summary } });
  });
  await page.route(`${API}/illustrations`, (route) =>
    route.fulfill({ json: { items: allItems, total: allItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
  );
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

test.describe('Galerie illustration gallery', () => {
  test.beforeEach(async ({ page }) => {
    await mockGalleryFeeds(page);
  });

  test('renders header derived counts, chips, sort, 2 trending cards and the grid', async ({ page }) => {
    await page.goto('/galerie');
    await expect(page.getByRole('heading', { name: 'Galerie' })).toBeVisible();
    await expect(page.getByText('14 illustrations · 7 artistes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Trié par :')).toBeVisible();
    await expect(page.getByText('Pluie de Néons')).toBeVisible();
    await expect(page.getByText('Onibi · Esprit du feu')).toBeVisible();
    await expect(page.getByText('Lames de Brume — Ch.2')).toBeVisible();
  });

  test('clicking a category chip filters the grid and updates the URL + aria-pressed', async ({ page }) => {
    await page.goto('/galerie');
    await page.getByRole('button', { name: 'Fan-art', exact: true }).click();
    await expect(page).toHaveURL(/category=fanart/);
    await expect(page.getByRole('button', { name: 'Fan-art', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Fan-art · Le Dernier Ronin')).toBeVisible();
    await expect(page.getByText('Lames de Brume — Ch.2')).not.toBeVisible();
  });

  test('changing the sort updates the URL', async ({ page }) => {
    await page.goto('/galerie');
    await page.getByLabel('Trié par :').selectOption('populaires');
    await expect(page).toHaveURL(/tri=populaires/);
  });

  test('opening quick-preview (eye) shows the overlay with meta + "Voir" link; Esc closes it', async ({ page }) => {
    await page.goto('/galerie');
    await page.getByRole('button', { name: /Aperçu rapide de Lames de Brume/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Yuki Moreau')).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Voir/ })).toHaveAttribute('href', '/illustration/i1');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  // Round 2 (user note 2026-07-04): rank #1 was missing the preview affordance.
  test('both trending cards (rank #1 and #2) carry the quick-preview eye button', async ({ page }) => {
    await page.goto('/galerie');
    await expect(page.getByRole('button', { name: 'Aperçu rapide de Pluie de Néons' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Aperçu rapide de Onibi/ })).toBeVisible();

    await page.getByRole('button', { name: 'Aperçu rapide de Pluie de Néons' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  // Round 2 (user note 2026-07-04): the ✕ must not disturb the overlay's layout — assert it stays
  // in the same visual corner at both a narrow and a wide viewport (no float-driven reflow).
  test('the preview "✕" closes without disturbing the overlay layout, at 375 and 1280', async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/galerie');
      await page.getByRole('button', { name: /Aperçu rapide de Lames de Brume/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const closeButton = page.getByRole('button', { name: 'Fermer' });
      await expect(closeButton).toBeVisible();
      const dialogBox = await dialog.boundingBox();
      const closeBox = await closeButton.boundingBox();
      expect(dialogBox && closeBox).toBeTruthy();
      // Close button sits inside the dialog's top-right corner, not floated below content.
      expect(closeBox!.y).toBeLessThan(dialogBox!.y + 60);
      expect(closeBox!.x).toBeGreaterThan(dialogBox!.x + dialogBox!.width / 2);
      await closeButton.click();
      await expect(dialog).not.toBeVisible();
    }
  });

  // Round 2 — search bar (`q`, debounced, URL-synced).
  test('typing in the search box auto-applies after a debounce and narrows the grid', async ({ page }) => {
    await page.goto('/galerie');
    await expect(page.getByText('Lames de Brume — Ch.2')).toBeVisible();

    await page.getByLabel('Titre, artiste…').fill('onibi');

    await expect(page).toHaveURL(/q=onibi/, { timeout: 2000 });
    await expect(page.getByText('Lames de Brume — Ch.2')).not.toBeVisible();
  });

  test('clearing the search box cleanly removes the q param', async ({ page }) => {
    await page.goto('/galerie?q=onibi');
    await page.getByLabel('Titre, artiste…').fill('');
    await expect(page).not.toHaveURL(/q=/, { timeout: 2000 });
  });

  // Round 2 — genre facet (F-20 vocabulary, GenreSuggestInput + GenreChip, multi-select).
  test('adding a genre via the picker narrows the grid and updates the URL', async ({ page }) => {
    await page.goto('/galerie');
    await expect(page.getByText('Lames de Brume — Ch.2')).toBeVisible();

    await page.getByRole('combobox', { name: 'Ajouter un genre' }).fill('Yōkai');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/genre=yokai/);
    await expect(page.getByRole('button', { name: 'Retirer Yōkai' })).toBeVisible();
    // "Onibi · Esprit du feu" also renders in the (unaffected, independent-feed) trending pair,
    // whose card link carries an explicit role="img" override — so this grid-card link is unique.
    await expect(page.getByRole('link', { name: /Onibi · Esprit du feu/ })).toBeVisible();
  });

  test('removing a genre chip clears the facet', async ({ page }) => {
    await page.goto('/galerie?genre=yokai');
    await page.getByRole('button', { name: 'Retirer Yōkai' }).click();
    await expect(page).not.toHaveURL(/genre=/);
  });

  test('a card links to /illustration/:id (DR-6 stub, 404 acceptable)', async ({ page }) => {
    await page.goto('/galerie');
    const link = page.getByRole('link', { name: /Lames de Brume/ });
    await expect(link).toHaveAttribute('href', '/illustration/i1');
  });

  test('anonymous "＋ Publier une illustration" CTA routes to /connexion', async ({ page }) => {
    await page.goto('/galerie');
    await page.getByRole('link', { name: '＋ Publier une illustration' }).click();
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('375px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/galerie');
    await expect(page.getByRole('heading', { name: 'Galerie' })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('768px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/galerie');
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('1280px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/galerie');
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });
});

// ── DR-10: 18+ blur + badge on gallery cards ──────────────────────────────────
test.describe('Galerie — 18+ listing treatment (DR-10)', () => {
  test('an is18plus illustration card is blurred with an "18+" badge until the viewer is age-cleared', async ({ page }) => {
    const gatedItems = [
      { ...allItems[0], is18plus: false },
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

    await page.goto('/galerie');
    await expect(page.getByRole('img', { name: 'Illustration 18+' })).toBeVisible();
  });

  // QA round-1 regression: Cover18Overlay's old height:'100%' wrapper stretched to the full
  // CSS-grid row-track height (align-items:stretch), pushing every card's title ~53px into the
  // next row. This grid is `repeat(auto-fill, minmax(210px,1fr))` — a narrow viewport forces a
  // small, predictable column count so 10 items guarantee 2+ rows (the earlier 1-row fixtures
  // above never had a "next row" to spill into).
  test('QA round-1 regression: an 18+ card does not stretch its row, pushing row-1 titles into row-2 (>=2 rows)', async ({ page }) => {
    const gridItems = Array.from({ length: 10 }, (_, i) => ({
      id: `g${i + 1}`,
      title: `Illust ${i + 1}`,
      artistName: 'Yuki Moreau',
      artistSlug: 'dr1-yuki-moreau',
      category: 'process',
      categoryLabel: 'Process',
      likeCount: 100,
      thumbnail: null,
      is18plus: i === 1, // second card of row 1 is 18+
    }));
    await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/illustrations?**`, (route) =>
      route.fulfill({ json: { items: gridItems, total: gridItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
    );
    await page.route(`${API}/illustrations`, (route) =>
      route.fulfill({ json: { items: gridItems, total: gridItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
    );
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
    );

    // Narrow viewport -> minmax(210px,1fr) auto-fill resolves to ~3 columns, guaranteeing >=2 rows.
    await page.setViewportSize({ width: 700, height: 1400 });
    await page.goto('/galerie');
    await expect(page.getByRole('img', { name: 'Illustration 18+' })).toBeVisible();

    const row1Title = page.getByText('Illust 1', { exact: true });
    const row2FirstCard = page.getByRole('link', { name: /^Illust 4/ });
    await expect(row1Title).toBeVisible();
    await expect(row2FirstCard).toBeVisible();

    const row1TitleBox = await row1Title.boundingBox();
    const row2Box = await row2FirstCard.boundingBox();
    expect(row1TitleBox).not.toBeNull();
    expect(row2Box).not.toBeNull();
    // Row 1's title must sit entirely above row 2's box — QA measured a ~53px overlap here.
    expect(row1TitleBox!.y + row1TitleBox!.height).toBeLessThanOrEqual(row2Box!.y + 1);
  });
});
