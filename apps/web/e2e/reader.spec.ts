/**
 * DR-4 Chapter reader "Lecteur" — e2e acceptance suite.
 *
 * Hermetic: mocks /works/:slug, /works/:slug/chapters, /works/:slug/chapters/:n/pages,
 * /me/favorites and /auth/me via page.route (same pattern as work.spec.ts) so the suite doesn't
 * depend on the shared dev DB's seed data. NOT run as part of this session — written per the
 * plan's §6 acceptance flow for QA/CI to execute.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const mangaWork = {
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
  hashtags: ['fantasy'],
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

const mangaChapters = {
  items: [
    { id: 'ch-1', number: 1, title: 'Sous la pluie', plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 1800, locked: false, lockReason: null },
    { id: 'ch-2', number: 2, title: 'La rencontre', plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 900, locked: false, lockReason: null },
    { id: 'ch-3', number: 3, title: 'Le pacte', plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 400, locked: false, lockReason: null },
    { id: 'ch-4', number: 4, title: null, plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 100, locked: true, lockReason: 'premium' },
  ],
  total: 4,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

const mangaPages = {
  workSlug: 'lames-de-brume',
  chapterNumber: 1,
  readMode: 'pages',
  totalPages: 6,
  pages: Array.from({ length: 6 }, (_, i) => ({ index: i + 1, image: null, caption: i === 2 ? '« Alors prouve-le. »' : null, double: false })),
  prose: [],
};

const romanWork = { ...mangaWork, slug: 'dr2-le-murmure-des-cendres', title: 'Le murmure des cendres', format: 'Roman' };
const romanChapters = {
  items: [{ id: 'ch-r1', number: 1, title: "L'odeur du papier", plancheCount: 0, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 200, locked: false, lockReason: null }],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};
const romanPages = {
  workSlug: 'dr2-le-murmure-des-cendres',
  chapterNumber: 1,
  readMode: 'prose',
  totalPages: 2,
  pages: [],
  prose: Array.from({ length: 10 }, (_, i) => `Paragraphe ${i + 1}.`),
};

async function mockCommon(page: Page) {
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
  await page.route(`${API}/me/favorites`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

async function mockMangaFeeds(page: Page) {
  // Playwright matches the LAST-registered route first (LIFO) — the wildcard "chapters**"
  // must be registered BEFORE the more specific "/chapters/:n/pages" routes, otherwise it
  // swallows them and every fetch (list or pages) resolves to the chapters-list payload.
  await page.route(`${API}/works/lames-de-brume/chapters**`, (route) => route.fulfill({ json: mangaChapters }));
  await page.route(`${API}/works/lames-de-brume/chapters/1/pages`, (route) => route.fulfill({ json: mangaPages }));
  await page.route(`${API}/works/lames-de-brume/chapters/4/pages`, (route) =>
    route.fulfill({ status: 403, json: { statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' } }),
  );
  await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: mangaWork }));
}

async function mockRomanFeeds(page: Page) {
  await page.route(`${API}/works/dr2-le-murmure-des-cendres/chapters**`, (route) => route.fulfill({ json: romanChapters }));
  await page.route(`${API}/works/dr2-le-murmure-des-cendres/chapters/1/pages`, (route) => route.fulfill({ json: romanPages }));
  await page.route(`${API}/works/dr2-le-murmure-des-cendres`, (route) => route.fulfill({ json: romanWork }));
}

test.describe('Lecteur — manga reader', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommon(page);
    await mockMangaFeeds(page);
  });

  test('dark stage renders with Quitter / Plein écran, chapters aside, and reactions aside', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await expect(page.getByRole('link', { name: '✕ Quitter' })).toBeVisible();
    // Accessible name comes from aria-label ("Passer en plein écran"), which takes precedence
    // over the visible "⛶ Plein écran" text per ARIA name computation — match case-insensitively.
    await expect(page.getByRole('button', { name: /plein écran/i })).toBeVisible();
    await expect(page.getByText('Chapitres')).toBeVisible();
    await expect(page.getByText('Réactions')).toBeVisible();
    await expect(page.getByText('1 · Sous la pluie')).toBeVisible();
  });

  test('paging via the "›" button and ArrowRight advances the slider + label', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const slider = page.getByRole('slider');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 1 sur 6');

    await page.getByRole('button', { name: 'Page suivante' }).click();
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 2 sur 6');

    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 3 sur 6');
  });

  test('toggling "2 pages" enables the spread mode', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await page.getByRole('button', { name: '2 pages' }).click();
    await expect(page.getByRole('button', { name: '2 pages' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('opening a locked chapter shows the paywall prompt and no page content loads', async ({ page }) => {
    let lockedPagesFetched = false;
    await page.route(`${API}/works/lames-de-brume/chapters/4/pages`, (route) => {
      lockedPagesFetched = true;
      return route.fulfill({ status: 403, json: { statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' } });
    });
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await page.getByText('4 · — verrouillé ★').click();
    await expect(page.getByRole('dialog', { name: /Chapitre verrouillé/ })).toBeVisible();
    // Clicking a locked aside entry must not attempt to fetch its pages (F8: paywall instead of
    // loading pages) — the reader stays on chapter 1's already-loaded content underneath the modal.
    expect(lockedPagesFetched).toBe(false);
    await expect(page.getByRole('button', { name: 'Fermer' })).toBeVisible();
  });

  test('no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });

  // QA F1 regression, round 2: a coordinate-based fix (position:absolute inside the stage) only
  // moved the collision around - the pill then landed on top of "Plein écran" at 1280px and the
  // chapter-title dropdown at 375px. Structural fix: "✕ Quitter" is now a normal flex child of
  // Topbar's tool row (rightmost, next to "Plein écran"), so it is laid out side by side with its
  // siblings instead of floating over them - overlap is impossible by construction, not just by
  // coordinate luck. Verify pairwise non-intersection of all three controls at the widths QA used.
  function boxesIntersect(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  for (const width of [375, 1280]) {
    test(`"✕ Quitter", "Plein écran", and the chapter dropdown never overlap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/lecteur/lames-de-brume?chapitre=1');

      const quitter = page.getByRole('link', { name: '✕ Quitter' });
      const fullscreenBtn = page.getByRole('button', { name: /plein écran/i });
      const chapterDropdown = page.getByRole('button', { name: 'Lames de Brume · Ch. 1' });
      await expect(quitter).toBeVisible();
      await expect(fullscreenBtn).toBeVisible();
      await expect(chapterDropdown).toBeVisible();

      const [quitterBox, fullscreenBox, dropdownBox] = await Promise.all([
        quitter.boundingBox(),
        fullscreenBtn.boundingBox(),
        chapterDropdown.boundingBox(),
      ]);
      expect(quitterBox).not.toBeNull();
      expect(fullscreenBox).not.toBeNull();
      expect(dropdownBox).not.toBeNull();

      expect(boxesIntersect(quitterBox!, fullscreenBox!)).toBe(false);
      expect(boxesIntersect(quitterBox!, dropdownBox!)).toBe(false);
      expect(boxesIntersect(fullscreenBox!, dropdownBox!)).toBe(false);

      // Also still true: "✕ Quitter" never sits on top of the persistent site header, and the
      // header's own sign-in control stays genuinely clickable (actionability fails if covered).
      const header = page.getByRole('banner');
      const headerBox = await header.boundingBox();
      expect(headerBox).not.toBeNull();
      expect(boxesIntersect(quitterBox!, headerBox!)).toBe(false);
      await page.getByRole('link', { name: 'Se connecter' }).click();
      await expect(page).toHaveURL('/connexion');
    });
  }
});

// Story update (2026-07-04): "Plein écran" is a real immersive mode (topbar + both asides
// unmounted, minimal bottom bar with page nav + favorites switch + chapter switch), not just a
// native Fullscreen API call. Assertions below check the resulting DOM/ARIA state rather than
// `document.fullscreenElement` — the component drives its layout off React state either way
// (real Fullscreen API engaged, or the "unavailable" degraded path), so the behavior under test
// is identical regardless of whether the browser actually grants native fullscreen in CI.
test.describe('Lecteur — Plein écran (immersive) mode', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommon(page);
    await mockMangaFeeds(page);
  });

  test('hides the topbar/asides, shows the minimal bottom bar, switches page/chapter from it, and exiting restores the chrome', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await expect(page.getByText('Chapitres')).toBeVisible();

    await page.getByRole('button', { name: 'Passer en plein écran' }).click();
    // Auto-hide (story update, 2026-07-04): the bar starts visible and only idles out after
    // ~2.8s of no pointer movement, but a defensive nudge keeps this test's own assertion
    // sequence (several awaits) safely inside that window regardless of CI slowness.
    await page.mouse.move(640, 420);

    await expect(page.getByText('Chapitres')).not.toBeVisible();
    await expect(page.getByText('Réactions')).not.toBeVisible();
    await expect(page.getByRole('link', { name: '✕ Quitter' })).not.toBeVisible();

    const bar = page.getByRole('toolbar', { name: /plein écran/i });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 6');
    await expect(bar.getByRole('button', { name: /Favoris/ })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Ch\. 1/ })).toBeVisible();

    // Page switch, from the bar's own nav.
    await bar.getByRole('button', { name: 'Page suivante' }).click();
    await expect(bar.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 2 sur 6');

    // Favorites quick-switch opens (signed-out hint, per mockCommon's 401 /me/favorites).
    await bar.getByRole('button', { name: /Favoris/ }).click();
    await expect(page.getByText(/pour voir vos favoris/)).toBeVisible();

    // Chapter switch, from the bar's own compact popover (selecting the locked chapter proves
    // the switch reaches real chapters, not just a static label).
    await bar.getByRole('button', { name: /Ch\. 1/ }).click();
    await page.getByText('4 · — verrouillé ★').click();
    await expect(page.getByRole('dialog', { name: /Chapitre verrouillé/ })).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).click();

    await bar.getByRole('button', { name: 'Quitter le plein écran' }).click();
    await expect(page.getByText('Chapitres')).toBeVisible();
    await expect(page.getByText('Réactions')).toBeVisible();
    await expect(page.getByRole('link', { name: '✕ Quitter' })).toBeVisible();
  });

  test('the bottom bar auto-hides after ~2.8s idle and re-reveals on pointer move', async ({ page }) => {
    // Playwright's Clock API (deterministic, no real wall-clock wait) - installed before
    // navigation so it governs the idle timer from the moment ImmersiveBar mounts.
    await page.clock.install();
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await page.getByRole('button', { name: 'Passer en plein écran' }).click();

    const bar = page.getByRole('toolbar', { name: /plein écran/i });
    await expect(bar).toHaveAttribute('data-hidden', 'false');

    await page.clock.fastForward(3000);
    await expect(bar).toHaveAttribute('data-hidden', 'true');

    await page.mouse.move(400, 300);
    await expect(bar).toHaveAttribute('data-hidden', 'false');
  });

  // QA (round 2): the bar previously RESERVED its own layout height as a flex sibling, so the
  // stage only filled ~91% desktop / ~77% mobile of the viewport, and hiding the bar didn't grow
  // the stage back - the whole point of auto-hide (manga fills the screen uninterrupted) never
  // actually happened. Fixed by overlaying the bar instead of reserving space for it; verify the
  // stage now fills ~100% of the viewport at both the desktop and mobile widths QA measured,
  // and that the bar overlays the stage's bottom edge rather than sitting below a shorter box.
  for (const width of [375, 1280]) {
    test(`the stage fills ~100% of the viewport in fullscreen at ${width}px (bar overlaid, not reserving height)`, async ({ page }) => {
      const height = 900;
      await page.setViewportSize({ width, height });
      await page.goto('/lecteur/lames-de-brume?chapitre=1');
      await page.getByRole('button', { name: 'Passer en plein écran' }).click();

      const stage = page.getByTestId('fullscreen-stage');
      const stageBox = await stage.boundingBox();
      expect(stageBox).not.toBeNull();
      expect(stageBox!.height / height).toBeGreaterThanOrEqual(0.95);

      // The bar overlays the stage's bottom edge (doesn't push the stage's own box shorter).
      const bar = page.getByRole('toolbar', { name: /plein écran/i });
      const barBox = await bar.boundingBox();
      expect(barBox).not.toBeNull();
      expect(barBox!.y + barBox!.height).toBeGreaterThanOrEqual(height - 2);
    });
  }
});

test.describe('Lecteur — roman (prose) reader', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommon(page);
    await mockRomanFeeds(page);
  });

  test('renders paginated prose with the spread toggle disabled', async ({ page }) => {
    await page.goto('/lecteur/dr2-le-murmure-des-cendres?chapitre=1');
    await expect(page.getByText('Paragraphe 1.')).toBeVisible();
    await expect(page.getByRole('button', { name: '1 page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '2 pages' })).toBeDisabled();
    await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 2');
  });
});
