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
    await page.getByRole('button', { name: 'Ajouter à ma liste' }).click();
    await expect(page).toHaveURL('/connexion');
  });

  test('DR-9: anonymous clicking ♥ "j\'aime" redirects to /connexion', async ({ page }) => {
    await page.goto('/oeuvre/lames-de-brume');
    await page.getByRole('button', { name: "J'aime" }).click();
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

/**
 * DR-10 Age verification & 18+ gating — hermetic, route-mocked (anon visitor via /auth/me 401,
 * same pattern as mockWorkFeeds). NOT run this session — for QA/CI to execute.
 */
const workAdult = { ...work, audienceRating: '18+' as const };
const workMature = { ...work, genre: 'Gore' };

async function mock18PlusWorkFeeds(page: Page) {
  await page.route(`${API}/works/lames-de-brume/chapters**`, (route) => route.fulfill({ json: chaptersPage1 }));
  await page.route(`${API}/works/lames-de-brume/planches`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

test.describe('Œuvre work page — 18+ age gate (DR-10)', () => {
  // Presentation update (user-specified 2026-07-05): the interstitial shows the page BLURRED
  // behind it (not a flat backdrop) — the work content is now present in the DOM while gated
  // (previously it never mounted at all), just visually blurred, non-interactive
  // (pointer-events: none) and aria-hidden so it's unreachable by mouse, keyboard or AT. This
  // only applies here (visitor/self-declaration, content the server let load) — the logged-in
  // minor 403 case below never fetches content, so there is nothing to blur.
  test('a visitor opening an 18+ work sees the page content blurred + non-interactive behind the interstitial', async ({ page }) => {
    await mock18PlusWorkFeeds(page);
    await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: workAdult }));

    await page.goto('/oeuvre/lames-de-brume');
    await expect(page.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeVisible();

    // Present in the DOM (not suppressed)...
    const heading = page.locator('h1', { hasText: 'Lames de Brume' });
    await expect(heading).toHaveCount(1);
    // ...but not exposed to the accessibility tree...
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toHaveCount(0);
    // ...wrapped in the blurred, non-interactive, aria-hidden container.
    const wrapper = page.locator('[aria-hidden="true"]').filter({ has: heading });
    await expect(wrapper).toHaveCSS('filter', /blur/);
    await expect(wrapper).toHaveCSS('pointer-events', 'none');
  });

  // User-specified 2026-07-05: the dark backdrop is a fullscreen fixed overlay that stops below
  // the sticky navbar (never overlays it), and the page behind cannot be scrolled while it's up.
  test('the backdrop is a fullscreen fixed overlay below the navbar, and locks page scroll', async ({ page }) => {
    await mock18PlusWorkFeeds(page);
    await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: workAdult }));

    await page.goto('/oeuvre/lames-de-brume');
    const dialog = page.getByRole('dialog', { name: /contenu réservé aux adultes/i });
    await expect(dialog).toBeVisible();

    const backdrop = page.getByTestId('age-gate-backdrop');
    await expect(backdrop).toHaveCSS('position', 'fixed');
    await expect(backdrop).toHaveCSS('top', '69px');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    // The sticky navbar stays above/unaffected — still visible and clickable.
    await expect(page.getByRole('link', { name: 'Accueil' })).toBeVisible();
  });

  test('a visitor opening an 18+ work sees the interstitial; self-declaring reveals the content and is not re-prompted this session', async ({ page }) => {
    await mock18PlusWorkFeeds(page);
    await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: workAdult }));

    await page.goto('/oeuvre/lames-de-brume');
    const dialog = page.getByRole('dialog', { name: /contenu réservé aux adultes/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /j'ai 18 ans ou plus/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeVisible();

    // Refresh within the same session — not re-prompted (sessionStorage self-declaration).
    await page.reload();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeVisible();
  });

  test('a mature-but-not-18+ work is never blurred and shows no interstitial, only a "Contenu mature" tag', async ({ page }) => {
    await mock18PlusWorkFeeds(page);
    await page.route(`${API}/works/lames-de-brume`, (route) => route.fulfill({ json: workMature }));

    await page.goto('/oeuvre/lames-de-brume');
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Contenu mature')).toBeVisible();
  });
});

/**
 * DR-11 Reading history & resume — hermetic, route-mocked. Overrides /auth/me (signed-in) and
 * /me/reading-history/:slug from mockWorkFeeds's anon default. NOT run this session — for
 * QA/CI to execute per the plan's §6 acceptance flow.
 */
const signedInAccount = {
  id: 'mock-reader-1',
  slug: 'camille',
  displayName: 'Camille',
  role: 'utilisateur',
  verified: true,
  emailVerified: true,
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
};

const resumeEntry = {
  workSlug: 'lames-de-brume',
  workTitle: 'Lames de Brume',
  chapterNumber: 4,
  chapterTitle: null,
  page: 12,
  totalPages: 28,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

test.describe('Œuvre work page — resume (DR-11)', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkFeeds(page);
    await page.route(`${API}/auth/me`, (route) => route.fulfill({ json: signedInAccount }));
  });

  test('signed-in reader with history: CTA becomes "Reprendre la lecture" and deep-links to the saved chapter/page', async ({ page }) => {
    await page.route(`${API}/me/reading-history/lames-de-brume`, (route) => route.fulfill({ json: resumeEntry }));
    await page.goto('/oeuvre/lames-de-brume');

    const cta = page.getByRole('main').getByRole('link', { name: 'Reprendre la lecture' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/lecteur/lames-de-brume?chapitre=4&page=12');
    // Scoped by aria-label: the page also renders an unrelated "Impression papier" funding-goal
    // progressbar (Sidebar) — a bare getByRole('progressbar') is ambiguous (strict-mode violation).
    await expect(page.getByRole('progressbar', { name: /^Progression/ })).toBeVisible();
    await expect(page.getByText('Ch. 4 · Lames de Brume — page 12/28')).toBeVisible();
  });

  test('signed-in reader with no history (404): unchanged "Lire" CTA, no progress bar', async ({ page }) => {
    await page.route(`${API}/me/reading-history/lames-de-brume`, (route) =>
      route.fulfill({ status: 404, json: { statusCode: 404, message: 'Aucune progression' } }),
    );
    await page.goto('/oeuvre/lames-de-brume');

    await expect(page.getByRole('main').getByRole('link', { name: 'Lire', exact: true })).toHaveAttribute(
      'href',
      '/lecteur/lames-de-brume',
    );
    await expect(page.getByRole('progressbar', { name: /^Progression/ })).toHaveCount(0);
  });

  for (const width of [375, 768, 1280]) {
    test(`resume bar + indicator have no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.route(`${API}/me/reading-history/lames-de-brume`, (route) => route.fulfill({ json: resumeEntry }));
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/oeuvre/lames-de-brume');
      await expect(page.getByRole('progressbar', { name: /^Progression/ })).toBeVisible();
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
    });
  }

  test('DR-9: signed-in ♥/★ toggles update aria-pressed and count, and persist through reload via hydration', async ({ page }) => {
    let liked = false;
    let saved = false;
    await page.route(`${API}/reactions/state**`, (route) =>
      route.fulfill({ json: { 'lames-de-brume': { liked, saved } } }),
    );
    await page.route(`${API}/reactions/like`, (route) => {
      liked = route.request().method() === 'POST';
      route.fulfill({ json: { active: liked, count: liked ? 3401 : 3400 } });
    });
    await page.route(`${API}/reactions/save`, (route) => {
      saved = route.request().method() === 'POST';
      route.fulfill({ json: { active: saved, count: saved ? 341 : 340 } });
    });
    await page.goto('/oeuvre/lames-de-brume');

    const likeBtn = page.getByRole('button', { name: "J'aime" });
    await likeBtn.click();
    await expect(page.getByRole('button', { name: 'Retirer le j\'aime' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('3,4k')).toBeVisible();

    const saveBtn = page.getByRole('button', { name: 'Ajouter à ma liste' });
    await saveBtn.click();
    const savedBtn = page.getByRole('button', { name: 'Retirer de ma liste' });
    await expect(savedBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(savedBtn).toContainText('Dans ma liste');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Retirer le j\'aime' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Retirer de ma liste' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking "Reprendre la lecture" opens the reader at the saved chapter and page', async ({ page }) => {
    await page.route(`${API}/me/reading-history/lames-de-brume`, (route) => route.fulfill({ json: resumeEntry }));
    await page.route(`${API}/me/favorites`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/works/lames-de-brume/chapters/4/pages`, (route) =>
      route.fulfill({
        json: {
          workSlug: 'lames-de-brume',
          chapterNumber: 4,
          readMode: 'pages',
          totalPages: 28,
          pages: Array.from({ length: 28 }, (_, i) => ({ index: i + 1, image: null, caption: null, double: false })),
          prose: [],
        },
      }),
    );
    await page.goto('/oeuvre/lames-de-brume');
    await page.getByRole('main').getByRole('link', { name: 'Reprendre la lecture' }).click();

    await expect(page).toHaveURL('/lecteur/lames-de-brume?chapitre=4&page=12');
    await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 12 sur 28');
  });
});
