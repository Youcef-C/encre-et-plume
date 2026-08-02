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

// ── DR-10: 18+ blur + badge on catalog cards ──────────────────────────────────
test.describe('Découvrir catalog — 18+ listing treatment (DR-10)', () => {
  test('an is18plus card is blurred with an "18+" badge until the viewer is age-cleared', async ({ page }) => {
    const gatedWorks = [
      { ...allWorks[0], is18plus: false },
      { id: '3', slug: 'le-dernier-ronin', title: 'Le Dernier Ronin', genre: 'Seinen', chapterCount: 8, likeCount: 5700, complete: false, format: 'Manga', cover: null, is18plus: true },
    ];
    await page.route(`${API}/catalog/trending`, (route) => route.fulfill({ json: trending }));
    await page.route(`${API}/contests/active`, (route) => route.fulfill({ json: contest }));
    await page.route(`${API}/catalog/editor-pick`, (route) => route.fulfill({ json: editorPicks }));
    await page.route(`${API}/catalog?**`, (route) =>
      route.fulfill({ json: { items: gatedWorks, total: gatedWorks.length, page: 1, pageSize: 12, totalPages: 1 } }),
    );
    await page.route(`${API}/catalog`, (route) =>
      route.fulfill({ json: { items: gatedWorks, total: gatedWorks.length, page: 1, pageSize: 12, totalPages: 1 } }),
    );
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
    );

    await page.goto('/decouvrir');
    await expect(page.getByRole('img', { name: 'Œuvre 18+' })).toBeVisible();
    // The non-18+ card next to it is never blurred/badged.
    await expect(page.getByRole('link', { name: /lames de brume/i }).getByRole('img', { name: 'Œuvre 18+' })).toHaveCount(0);
  });

  // QA round-1 regression: Cover18Overlay's old height:'100%' wrapper stretched to the full
  // CSS-grid row-track height (align-items:stretch), pushing every card's title ~53px into the
  // next row. This grid is 3 columns, so 6 items force 2 rows — the minimal fixture that can
  // reproduce the overlap (the earlier 2-item fixture above never had a "next row" to spill into).
  test('QA round-1 regression: an 18+ card does not stretch its row, pushing row-1 titles into row-2 (>=2 rows)', async ({ page }) => {
    const gridWorks = Array.from({ length: 6 }, (_, i) => ({
      id: String(i + 1),
      slug: `work-${i + 1}`,
      title: `Work ${i + 1}`,
      genre: 'Seinen',
      chapterCount: 10,
      likeCount: 100,
      complete: false,
      format: 'Manga',
      cover: null,
      is18plus: i === 1, // second card of row 1 is 18+
    }));
    await page.route(`${API}/catalog/trending`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/contests/active`, (route) => route.fulfill({ json: null }));
    await page.route(`${API}/catalog/editor-pick`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/catalog?**`, (route) =>
      route.fulfill({ json: { items: gridWorks, total: gridWorks.length, page: 1, pageSize: 12, totalPages: 1 } }),
    );
    await page.route(`${API}/catalog`, (route) =>
      route.fulfill({ json: { items: gridWorks, total: gridWorks.length, page: 1, pageSize: 12, totalPages: 1 } }),
    );
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
    );

    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto('/decouvrir');
    await expect(page.getByRole('img', { name: 'Œuvre 18+' })).toBeVisible();

    const row1Title = page.getByText('Work 1', { exact: true });
    const row2FirstCard = page.getByRole('link', { name: /^Work 4/ });
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

// ---------------------------------------------------------------------------
// API (live seed, NOT mocked): search-by-author-name.
//
// Seed-coherence pass (2026-08-02). The `q` facet used to match the stored `Work.meta` string, and
// searching an author worked only because the author's name happened to be baked into it. The
// column is gone; `q` now matches the WorkCreator relation. Nothing else in this suite would notice
// if that capability silently disappeared, which is exactly why it is pinned here against real data.
// ---------------------------------------------------------------------------

test.describe('DR-2 API · q matches the author, not a denormalized string', () => {
  test('CAT-API-1: GET /catalog?q=<creator displayName> returns that creator\'s work', async ({ request }) => {
    // « Camille Roux » is a WorkCreator of `lames-de-brume` and appears nowhere in its title.
    const res = await request.get(`${API}/catalog?q=${encodeURIComponent('Camille Roux')}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items.map((w: { slug: string }) => w.slug)).toContain('lames-de-brume');
  });

  test('CAT-API-2: GET /catalog?q=<title> still matches the title', async ({ request }) => {
    const res = await request.get(`${API}/catalog?q=brume`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items.map((w: { slug: string }) => w.slug)).toContain('lames-de-brume');
  });

  test('CAT-API-3: every catalog card advertises the chapter count it really owns', async ({ request }) => {
    const res = await request.get(`${API}/catalog?q=brume`);
    const card = (await res.json()).items.find((w: { slug: string }) => w.slug === 'lames-de-brume');
    const work = await (await request.get(`${API}/works/lames-de-brume`)).json();
    const chapters = await (await request.get(`${API}/works/lames-de-brume/chapters`)).json();
    expect(card.chapterCount).toBe(work.chapterCount);
    expect(work.chapterCount).toBe(chapters.total);
    // …and the hero line is derived from the same two facts, never from a stored string.
    expect(work.meta).toBe(`${work.team.map((c: { name: string }) => c.name).join(' × ')} · ${work.chapterCount} ch.`);
  });
});
