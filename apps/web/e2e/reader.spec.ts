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

  test('DR-9: signed-in ♥ (chapter like) and ★ (work save) toggle aria-pressed and counts in Réactions', async ({ page }) => {
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({
        json: {
          id: 'mock-reader-1', slug: 'camille', displayName: 'Camille', role: 'utilisateur',
          verified: true, emailVerified: true, avatar: null, createdAt: new Date().toISOString(),
          preferences: { theme: 'system', dmPolicy: 'requests' },
        },
      }),
    );
    await page.route(`${API}/me/favorites`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/reactions/state**`, (route) => {
      const url = new URL(route.request().url());
      const key = url.searchParams.get('targetType') === 'chapter' ? 'ch-1' : 'lames-de-brume';
      route.fulfill({ json: { [key]: { liked: false, saved: false } } });
    });
    await page.route(`${API}/reactions/like`, (route) => route.fulfill({ json: { active: true, count: 1801 } }));
    await page.route(`${API}/reactions/save`, (route) => route.fulfill({ json: { active: true, count: 341 } }));
    await page.goto('/lecteur/lames-de-brume?chapitre=1');

    const likeBtn = page.getByRole('button', { name: "J'aime" });
    await likeBtn.click();
    await expect(page.getByRole('button', { name: 'Retirer le j\'aime' })).toHaveAttribute('aria-pressed', 'true');

    const saveBtn = page.getByRole('button', { name: 'Ajouter à ma liste' });
    await saveBtn.click();
    await expect(page.getByRole('button', { name: 'Retirer de ma liste' })).toHaveAttribute('aria-pressed', 'true');
  });

  // DR-4 sens-de-lecture delta: `lames-de-brume` is a Manga-format work, which now defaults to RTL
  // (AC1/AC6) — the arrow-key mapping inverts accordingly (AC4: → = précédente, ← = suivante in
  // RTL). This test's original assertion ("ArrowRight advances") predates that delta and silently
  // broke (QA re-verification, real e2e run): "Page suivante" still advances regardless of
  // direction (glyph/handler swap, not the button itself), so that half is untouched; the arrow-key
  // half is updated to ArrowLeft to match the new default. The "DR-4 sens de lecture" describe block
  // below covers the inversion itself in full; this is just the pre-existing paging smoke test kept
  // accurate to the shipped default.
  test('paging via the "›" button and ArrowLeft advances the slider + label (RTL default for Manga)', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const slider = page.getByRole('slider');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 1 sur 6');

    await page.getByRole('button', { name: 'Page suivante' }).click();
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 2 sur 6');

    await page.keyboard.press('ArrowLeft');
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

  // Story update (2026-07-04): back returns to the current work's page, not the catalogue -
  // overrides the prototype's "‹ Catalogue" link ("✕ Quitter" already covers the same
  // destination as a distinct "quit reading" action, verified by the AABB tests below).
  test('the back link returns to the current work\'s page, not the catalogue', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await page.getByRole('link', { name: "‹ Retour à l'œuvre" }).click();
    await expect(page).toHaveURL('/oeuvre/lames-de-brume');
  });

  // Story update (2026-07-04): "Fixed page aspect ratio" - manga pages are forced to a fixed
  // manga page ratio (~2:3 portrait) so they never stretch to fill the stage.
  test('manga pages are constrained to the manga page ratio (~2:3)', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const pageCard = page.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' }).locator('xpath=..');
    const ratio = await pageCard.evaluate((el) => getComputedStyle(el).aspectRatio);
    expect(ratio).toBe('2 / 3');
  });

  // QA BLOCKER regression: the ratio assertion above passed even while the page rendered as a
  // ~34x51px stamp (a correct-ratio-but-tiny box) - `getComputedStyle().aspectRatio` never checks
  // rendered pixel size. This asserts the REAL bounding box the browser lays out, at the exact
  // viewport QA used, so a collapse-to-min-content regression fails here even if a future change
  // preserves the CSS ratio property. The locator targets the PageCard element itself (`xpath=..`
  // from the halftone placeholder's own `role="img"` div walks up exactly one level, to its direct
  // parent - the page card, not the outer 100%-sized `MangaPages` wrapper one level further up).
  test('BLOCKER: the manga page renders large, not collapsed to min-content', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const pageCard = page.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' }).locator('xpath=..');
    const box = await pageCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(300);
    expect(box!.width).toBeGreaterThan(200);
  });

  // QA Finding A (user-reported: "Réactions gets squished to the bottom" with a 2-page spread
  // open): `.ep-reader-columns`' unconditional flex-wrap + the middle column's old `flex:'1 1
  // auto'` let the column's own (large, double-page) content size force the row to wrap into 3
  // stacked lines instead of a 3-column row. Verify the row stays a single line: Réactions sits to
  // the RIGHT of the stage (not below it), and both asides sit near the same vertical position.
  test('with a 2-page manga spread open, "Chapitres" and "Réactions" stay docked left/right of the stage (not wrapped below it)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await page.getByRole('button', { name: '2 pages' }).click();

    const chapitres = page.getByText('Chapitres', { exact: true });
    const reactions = page.getByText('Réactions', { exact: true });
    const stage = page.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' }).locator('xpath=..');
    const [chapitresBox, reactionsBox, stageBox] = await Promise.all([
      chapitres.boundingBox(),
      reactions.boundingBox(),
      stage.boundingBox(),
    ]);
    expect(chapitresBox).not.toBeNull();
    expect(reactionsBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(reactionsBox!.x).toBeGreaterThan(stageBox!.x);
    expect(Math.abs(reactionsBox!.y - chapitresBox!.y)).toBeLessThan(40);
  });

  // Same acceptance criterion, but with the Studio "Vue dégagée" clear-view ALSO active (both
  // asides collapsed to mini-rails) - the collapsed rails must still dock left/right, not wrap.
  test('with a 2-page manga spread AND "Vue dégagée" both active, the collapsed asides stay docked left/right', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await page.getByRole('button', { name: '2 pages' }).click();
    await page.getByRole('button', { name: 'Vue dégagée' }).click();

    const chapitres = page.getByText('Chapitres', { exact: true });
    const reactions = page.getByText('Réactions', { exact: true });
    const stage = page.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' }).locator('xpath=..');
    const [chapitresBox, reactionsBox, stageBox] = await Promise.all([
      chapitres.boundingBox(),
      reactions.boundingBox(),
      stage.boundingBox(),
    ]);
    expect(chapitresBox).not.toBeNull();
    expect(reactionsBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(reactionsBox!.x).toBeGreaterThan(stageBox!.x);
    expect(Math.abs(reactionsBox!.y - chapitresBox!.y)).toBeLessThan(40);
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

  // Story update: "◳ Studio" is repurposed into a "Vue dégagée" clear-view toggle - collapses
  // both side asides for a bigger reading panel, distinct from full immersive fullscreen (the
  // topbar itself, including the back link and "Plein écran" button, stays visible).
  test('"Vue dégagée" collapses both asides for a bigger panel, and restores them on a second click', async ({ page }) => {
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await expect(page.getByText('1 · Sous la pluie')).toBeVisible();

    const studioBtn = page.getByRole('button', { name: 'Vue dégagée' });
    await expect(studioBtn).toHaveAttribute('aria-pressed', 'false');

    await studioBtn.click();
    await expect(studioBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 · Sous la pluie')).not.toBeVisible();
    // Distinct from immersive fullscreen: the topbar chrome stays visible.
    await expect(page.getByRole('link', { name: "‹ Retour à l'œuvre" })).toBeVisible();
    await expect(page.getByRole('button', { name: /plein écran/i })).toBeVisible();

    await studioBtn.click();
    await expect(studioBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('1 · Sous la pluie')).toBeVisible();
  });

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

  // QA Finding A, roman variant: the same wrap regression reproduces with a roman 2-page spread
  // (two wide A4 surfaces), independent of read mode - verify it's fixed here too.
  test('with a 2-page roman spread open, "Chapitres" and "Réactions" stay docked left/right of the stage', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/lecteur/dr2-le-murmure-des-cendres?chapitre=1');
    await page.getByRole('button', { name: '2 pages' }).click();

    const chapitres = page.getByText('Chapitres', { exact: true });
    const reactions = page.getByText('Réactions', { exact: true });
    const stage = page.getByText('Paragraphe 1.').locator('xpath=..');
    const [chapitresBox, reactionsBox, stageBox] = await Promise.all([
      chapitres.boundingBox(),
      reactions.boundingBox(),
      stage.boundingBox(),
    ]);
    expect(chapitresBox).not.toBeNull();
    expect(reactionsBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(reactionsBox!.x).toBeGreaterThan(stageBox!.x);
    expect(Math.abs(reactionsBox!.y - chapitresBox!.y)).toBeLessThan(40);
  });

  test('renders paginated prose with the spread toggle enabled', async ({ page }) => {
    await page.goto('/lecteur/dr2-le-murmure-des-cendres?chapitre=1');
    await expect(page.getByText('Paragraphe 1.')).toBeVisible();
    await expect(page.getByRole('button', { name: '1 page' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '2 pages' })).toBeEnabled();
    await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 2');
  });

  // NEW (story States update): the "2 pages" spread is now enabled for roman too - two A4 page
  // surfaces side by side, same toggle/behavior as the manga spread.
  test('toggling "2 pages" renders a 2-page roman spread', async ({ page }) => {
    await page.goto('/lecteur/dr2-le-murmure-des-cendres?chapitre=1');
    await page.getByRole('button', { name: '2 pages' }).click();
    await expect(page.getByRole('button', { name: '2 pages' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Paragraphe 1.')).toBeVisible();
    await expect(page.getByText('Paragraphe 6.')).toBeVisible();
  });

  // Story update (2026-07-04): "Fixed page aspect ratio" - roman prose pages are constrained to
  // an A4-proportioned page surface (1:√2 ≈ 1:1.414) so they read like a real page, not a stretched box.
  test('roman prose pages are constrained to the A4 ratio (1:1.414)', async ({ page }) => {
    await page.goto('/lecteur/dr2-le-murmure-des-cendres?chapitre=1');
    const pageSurface = page.getByText('Paragraphe 1.').locator('xpath=..');
    const ratio = await pageSurface.evaluate((el) => getComputedStyle(el).aspectRatio);
    expect(ratio).toBe('1 / 1.414');
  });

  // Consistency fix (same round as the manga BLOCKER): the roman A4 surface now also fills the
  // stage (height:100%, not just a maxHeight percentage) - verify the rendered box, not just the
  // CSS aspect-ratio property.
  test('roman prose pages render large, filling the stage height', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/lecteur/dr2-le-murmure-des-cendres?chapitre=1');
    const pageSurface = page.getByText('Paragraphe 1.').locator('xpath=..');
    const box = await pageSurface.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(300);
  });
});

/**
 * DR-10 Age verification & 18+ gating — hermetic, route-mocked. NOT run this session — for
 * QA/CI to execute.
 */
test.describe('Lecteur — 18+ age gate (DR-10)', () => {
  test('a visitor opening an 18+ work sees the interstitial before the pages', async ({ page }) => {
    await mockCommon(page);
    await page.route(`${API}/works/lames-de-brume/chapters**`, (route) => route.fulfill({ json: mangaChapters }));
    await page.route(`${API}/works/lames-de-brume/chapters/1/pages`, (route) => route.fulfill({ json: mangaPages }));
    await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: { ...mangaWork, audienceRating: '18+' } }));

    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await expect(page.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeVisible();
    // The real chapter pages/slider still never mount underneath the gate (server-side content is
    // still force-suppressed via displayPagesState/Data — no leak of premium/adult page images).
    await expect(page.getByRole('slider')).not.toBeVisible();

    // Presentation update (user-specified 2026-07-05): the surrounding reader chrome (topbar/
    // asides) is present in the DOM, blurred behind the interstitial, not absent.
    const chrome = page.getByText('Chapitres');
    await expect(chrome).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Vue dégagée' })).toHaveCount(0);
    const wrapper = page.locator('[aria-hidden="true"]').filter({ has: chrome });
    await expect(wrapper).toHaveCSS('filter', /blur/);
    await expect(wrapper).toHaveCSS('pointer-events', 'none');

    // User-specified 2026-07-05: fullscreen fixed backdrop below the navbar, page scroll locked.
    const dialog = page.getByRole('dialog', { name: /contenu réservé aux adultes/i });
    const backdrop = page.getByTestId('age-gate-backdrop');
    await expect(backdrop).toHaveCSS('position', 'fixed');
    await expect(backdrop).toHaveCSS('top', '69px');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  });

  test('a logged-in minor gets a refusal (no bypass) via the interstitial, not the Paywall', async ({ page }) => {
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({
        json: {
          id: 'minor-1', slug: 'minor', displayName: 'Minor', role: 'utilisateur', verified: false,
          emailVerified: true, avatar: null, createdAt: new Date().toISOString(),
          preferences: { theme: 'system', dmPolicy: 'requests' }, needsCguReconsent: false, onboarded: true, isAdult: false,
        },
      }),
    );
    await page.route(`${API}/me/favorites`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/works/lames-de-brume/chapters**`, (route) => route.fulfill({ json: mangaChapters }));
    await page.route(`${API}/works/lames-de-brume/chapters/1/pages`, (route) =>
      route.fulfill({ status: 403, json: { statusCode: 403, message: 'Ce contenu est réservé aux adultes.', error: 'AGE_RESTRICTED' } }),
    );
    await page.route(`${API}/works/lames-de-brume`, (route) =>
      route.fulfill({ status: 403, json: { statusCode: 403, message: 'Ce contenu est réservé aux adultes.', error: 'AGE_RESTRICTED' } }),
    );

    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await expect(page.getByText('Ce contenu est réservé aux adultes.')).toBeVisible();
    await expect(page.getByRole('dialog', { name: /chapitre verrouillé/i })).not.toBeVisible();
    await expect(page.getByRole('slider')).not.toBeVisible();
    // Unchanged by the blur presentation update: the server 403s before the work/pages fetch
    // resolves, so there is nothing to blur — no reader chrome mounts for a blocked minor either.
    await expect(page.getByText('Chapitres')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DR-4 delta — « Sens de lecture » (reading direction). Hermetic, same route-mock pattern as
// above. Each Playwright test gets an isolated browser context (fresh localStorage), so no
// explicit clearing is needed between tests. Manga (`lames-de-brume`) defaults RTL; Roman
// (`dr2-le-murmure-des-cendres`) defaults LTR. AC map: AC1/AC4/AC6 (arrow inversion + default),
// AC3/AC10 (slider dir + stable aria-valuetext), AC2 (2-page spread order), AC5 (Roman stays
// LTR), AC7/AC8/AC9 (toggle + persistence + labelled group).
// ─────────────────────────────────────────────────────────────────────────────
test.describe('DR-4 sens de lecture (reading direction)', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommon(page);
  });

  test('manga defaults RTL: ArrowLeft pages forward (suivante), ArrowRight pages back (précédente); slider dir=rtl; aria-valuetext stable (AC1/AC3/AC4/AC6/AC10)', async ({ page }) => {
    await mockMangaFeeds(page);
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const slider = page.getByRole('slider');
    await expect(slider).toHaveAttribute('dir', 'rtl');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 1 sur 6');

    // ← = page suivante in RTL.
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 2 sur 6');

    // → = page précédente in RTL.
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 1 sur 6');

    // Button/label swap: the LEFT circle is "Page suivante" (accent), the RIGHT is "Page
    // précédente" and disabled at page 1.
    const navBar = page.locator('.ep-reader-navbtn');
    const buttons = navBar.getByRole('button');
    await expect(buttons.first()).toHaveAccessibleName('Page suivante');
    await expect(buttons.last()).toHaveAccessibleName('Page précédente');
    await expect(buttons.last()).toBeDisabled();
  });

  test('the "Sens de lecture" switch is labelled and announces the active direction (AC9)', async ({ page }) => {
    await mockMangaFeeds(page);
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const dirSwitch = page.getByRole('button', { name: /Sens de lecture/ });
    await expect(dirSwitch).toBeVisible();
    await expect(dirSwitch).toHaveAttribute('aria-pressed', 'true');
    await expect(dirSwitch).toHaveAccessibleName(/droite à gauche/);
  });

  test('a 2-page manga spread orders pages right-then-left in RTL (AC2)', async ({ page }) => {
    await mockMangaFeeds(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    await page.getByRole('button', { name: '2 pages' }).click();

    const pageCard1 = page.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' }).locator('xpath=..');
    const pageCard2 = page.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 2' }).locator('xpath=..');
    const [box1, box2] = await Promise.all([pageCard1.boundingBox(), pageCard2.boundingBox()]);
    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    // Page 1 (the current reading page) sits visually to the RIGHT of page 2 in RTL.
    expect(box1!.x).toBeGreaterThan(box2!.x);
  });

  test('the ⇄ switch flips to LTR and the choice persists on reload (AC7/AC8)', async ({ page }) => {
    await mockMangaFeeds(page);
    await page.goto('/lecteur/lames-de-brume?chapitre=1');
    const dirSwitch = page.getByRole('button', { name: /Sens de lecture/ });

    await dirSwitch.click();
    await expect(dirSwitch).toHaveAttribute('aria-pressed', 'false');
    await expect(dirSwitch).toHaveAccessibleName(/gauche à droite/);
    const slider = page.getByRole('slider');
    await expect(slider).toHaveAttribute('dir', 'ltr');

    // Now advances normally (LTR): ArrowRight = suivante.
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 2 sur 6');

    await page.reload();
    await expect(page.getByRole('button', { name: /Sens de lecture/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('slider')).toHaveAttribute('dir', 'ltr');
    // QA finding (flaky, ~1/5 runs): a key press sent immediately after page.reload() can race the
    // document keydown listener's post-reload (re-)attachment and get dropped — retry the press
    // rather than sleep-and-hope; AC8 itself (pressed state + dir persisting) is already proven above.
    await expect(async () => {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 2 sur 6', { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  });

  test('Roman stays LTR by default (per-work default, no cross-work leak) (AC5)', async ({ page }) => {
    await mockRomanFeeds(page);
    await page.goto('/lecteur/dr2-le-murmure-des-cendres?chapitre=1');
    const dirSwitch = page.getByRole('button', { name: /Sens de lecture/ });
    await expect(dirSwitch).toHaveAttribute('aria-pressed', 'false');
    await expect(dirSwitch).toHaveAccessibleName(/gauche à droite/);
    const slider = page.getByRole('slider');
    await expect(slider).toHaveAttribute('dir', 'ltr');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', 'page 2 sur 2');
  });

  test('responsive: the "Sens de lecture" switch wraps without overflow at 375/768/1280 (regression: reader flex-wrap)', async ({ page }) => {
    await mockMangaFeeds(page);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/lecteur/lames-de-brume?chapitre=1');
      await expect(page.getByRole('button', { name: /Sens de lecture/ })).toBeVisible();
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasOverflow).toBe(false);
    }
  });
});
