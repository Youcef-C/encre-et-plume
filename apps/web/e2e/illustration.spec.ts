/**
 * DR-6 Illustration detail — e2e acceptance suite.
 *
 * Hermetic: mocks /illustrations/:id, /illustrations/:id/more, /illustrations/:id/preview,
 * /illustrations/trending, /illustrations* and /auth/me via page.route (same pattern as
 * gallery.spec.ts) so the suite doesn't depend on the shared dev DB's seed data or ordering.
 *
 * F-24 amendment: the route is now server-rendered — `app/illustration/[id]/page.tsx` fetches the
 * illustration in Node (for the metadata + the SSR seed) and calls `notFound()` on a 404. `page.route`
 * only intercepts BROWSER traffic, so a fabricated id like `i1` now 404s in the server before the
 * mocks can ever apply. The fixtures therefore borrow ONE real seeded id (resolved once, below) and
 * stay hermetic in every other respect: the client refetch is still mocked and still wins.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

/** A real published illustration id, so the server-side fetch resolves instead of 404ing (F-24). */
let ID = '';
async function ensureId(request: APIRequestContext): Promise<string> {
  if (!ID) {
    const res = await request.get(`${API}/illustrations?page=1`);
    ID = (await res.json()).items[0].id as string;
    galleryItems[0].id = ID;
    preview.id = ID;
    detail.id = ID;
  }
  return ID;
}

const galleryItems = [
  { id: 'i1', title: 'Lames de Brume — Ch.2', artistName: 'Yuki Moreau', artistSlug: 'dr1-yuki-moreau', category: 'process', categoryLabel: 'Process', likeCount: 3400, thumbnail: null },
];
const summary = { illustrationCount: 14, artistCount: 7 };

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

const detail = {
  id: 'i1',
  title: 'Lames de Brume — Ch.2',
  description: 'Encrage traditionnel rehaussé de trames numériques.',
  category: 'process',
  categoryLabel: 'Process',
  // F-22: IllustrationDetail gained `genres` (clickable genre chips, above the hashtag row) —
  // regression fixture keeps this suite's DR-6 fixtures aligned with the real contract.
  genres: [],
  hashtags: ['encre', 'noir', 'néon', 'pluie'],
  image: null,
  dimensionsLabel: '2480 × 3508',
  tools: 'Encre · CSP',
  license: '© Tous droits réservés',
  likeCount: 3400,
  publishedAt: '2026-06-12T00:00:00.000Z',
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'Dessinateur·rice', city: 'Lyon', avatar: null },
};

const more = [
  { id: 'i2', title: 'Étude d’encre #7', artistName: 'Yuki Moreau', artistSlug: 'dr1-yuki-moreau', category: 'process', categoryLabel: 'Process', likeCount: 1300, thumbnail: null },
];

async function mockFeeds(page: Page) {
  await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/illustrations/*/preview`, (route) => route.fulfill({ json: preview }));
  await page.route(`${API}/illustrations/*/more`, (route) => route.fulfill({ json: more }));
  await page.route(`${API}/illustrations/${ID}`, (route) => route.fulfill({ json: detail }));
  await page.route(`${API}/illustrations?**`, (route) =>
    route.fulfill({ json: { items: galleryItems, total: galleryItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
  );
  await page.route(`${API}/illustrations`, (route) =>
    route.fulfill({ json: { items: galleryItems, total: galleryItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
  );
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

test.describe('Illustration detail', () => {
  test.beforeEach(async ({ page, request }) => {
    await ensureId(request);
    await mockFeeds(page);
  });

  test('enters from a Galerie quick-preview "Voir l\'illustration →" link (FE-1)', async ({ page }) => {
    await page.goto('/galerie');
    await page.getByRole('button', { name: /Aperçu rapide de Lames de Brume/ }).click();
    await page.getByRole('link', { name: /Voir l.illustration/ }).click();
    await expect(page).toHaveURL(`/illustration/${ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume — Ch.2' })).toBeVisible();
  });

  test('renders title/byline/Détails/more-grid; "‹ Galerie" returns to /galerie (FE-1)', async ({ page }) => {
    await page.goto(`/illustration/${ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume — Ch.2' })).toBeVisible();
    await expect(page.getByText('Yuki Moreau').first()).toBeVisible();
    await expect(page.getByText('Détails')).toBeVisible();
    await expect(page.getByText('2480 × 3508')).toBeVisible();
    await expect(page.getByText('Plus de cet·te artiste')).toBeVisible();
    await expect(page.getByRole('link', { name: /Étude d.encre #7/ })).toBeVisible();
    await page.getByRole('link', { name: '‹ Galerie' }).click();
    await expect(page).toHaveURL('/galerie');
  });

  test('"Plein écran" opens the fullscreen overlay, Esc closes it (FE-2)', async ({ page }) => {
    await page.goto(`/illustration/${ID}`);
    await page.getByRole('button', { name: 'Voir en plein écran' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('anonymous "J\'aime" routes to sign-in (FE-10)', async ({ page }) => {
    await page.goto(`/illustration/${ID}`);
    await page.getByRole('button', { name: /J'aime/ }).click();
    await expect(page).toHaveURL('/connexion');
  });

  // F-24: an unknown id is a real HTTP 404 now — the server 404s before the client component mounts,
  // so the page rendered is « Page introuvable », not the client's « Illustration introuvable » (which
  // stays covered by `__tests__/IllustrationClient.test.tsx`).
  test('an unknown id returns HTTP 404 and renders « Page introuvable » (FE-10)', async ({ page }) => {
    const response = await page.goto('/illustration/00000000-0000-0000-0000-000000000000');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
  });

  test('DR-9: signed-in J\'aime/Enregistrer toggle aria-pressed and the like count', async ({ page }) => {
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({
        json: {
          id: 'mock-reader-1', slug: 'camille', displayName: 'Camille', role: 'utilisateur',
          verified: true, emailVerified: true, avatar: null, createdAt: new Date().toISOString(),
          preferences: { theme: 'system', dmPolicy: 'requests' },
        },
      }),
    );
    await page.route(`${API}/reactions/state**`, (route) => route.fulfill({ json: { [ID]: { liked: false, saved: false } } }));
    await page.route(`${API}/reactions/like`, (route) => route.fulfill({ json: { active: true, count: 3401 } }));
    await page.route(`${API}/reactions/save`, (route) => route.fulfill({ json: { active: true, count: 1 } }));
    await page.goto(`/illustration/${ID}`);

    const likeBtn = page.getByRole('button', { name: "J'aime" });
    await likeBtn.click();
    const likedBtn = page.getByRole('button', { name: 'Retirer le j\'aime' });
    await expect(likedBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(likedBtn).toContainText('3,4k');

    const saveBtn = page.getByRole('button', { name: 'Ajouter à ma liste' });
    await saveBtn.click();
    const savedBtn = page.getByRole('button', { name: 'Retirer de ma liste' });
    await expect(savedBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(savedBtn).toContainText('Enregistré');
  });

  test('responsive: no horizontal overflow at 375 / 768 / 1280', async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/illustration/${ID}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume — Ch.2' })).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    }
  });
});

/**
 * DR-10 Age verification & 18+ gating — hermetic, route-mocked. NOT run this session — for
 * QA/CI to execute.
 */
test.describe('Illustration detail — 18+ age gate (DR-10)', () => {
  test('a visitor opening an 18+ illustration sees the interstitial before the artwork', async ({ page, request }) => {
    await ensureId(request);
    await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/illustrations/*/preview`, (route) => route.fulfill({ json: preview }));
    await page.route(`${API}/illustrations/*/more`, (route) => route.fulfill({ json: more }));
    await page.route(`${API}/illustrations/${ID}`, (route) => route.fulfill({ json: { ...detail, is18plus: true } }));
    await page.route(`${API}/illustrations?**`, (route) =>
      route.fulfill({ json: { items: galleryItems, total: galleryItems.length, page: 1, pageSize: 12, totalPages: 1, summary } }),
    );
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
    );

    await page.goto(`/illustration/${ID}`);
    await expect(page.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeVisible();

    // Presentation update (user-specified 2026-07-05): the artwork is present in the DOM (blurred
    // behind the interstitial), not absent — the server let it load (visitor/self-declaration).
    const heading = page.locator('h1', { hasText: 'Lames de Brume — Ch.2' });
    await expect(heading).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Lames de Brume — Ch.2' })).toHaveCount(0);
    const wrapper = page.locator('[aria-hidden="true"]').filter({ has: heading });
    await expect(wrapper).toHaveCSS('filter', /blur/);
    await expect(wrapper).toHaveCSS('pointer-events', 'none');

    // User-specified 2026-07-05: fullscreen fixed backdrop below the navbar, page scroll locked.
    const dialog = page.getByRole('dialog', { name: /contenu réservé aux adultes/i });
    const backdrop = page.getByTestId('age-gate-backdrop');
    await expect(backdrop).toHaveCSS('position', 'fixed');
    await expect(backdrop).toHaveCSS('top', '69px');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  });

  test('a logged-in minor gets a refusal (no bypass) on a 403 AGE_RESTRICTED response', async ({ page }) => {
    await page.route(`${API}/illustrations/trending`, (route) => route.fulfill({ json: [] }));
    await page.route(`${API}/illustrations/*/more`, (route) => route.fulfill({ json: more }));
    await page.route(`${API}/illustrations/${ID}`, (route) =>
      route.fulfill({ status: 403, json: { statusCode: 403, message: 'Ce contenu est réservé aux adultes.', error: 'AGE_RESTRICTED' } }),
    );
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({
        json: {
          id: 'minor-1', slug: 'minor', displayName: 'Minor', role: 'utilisateur', verified: false,
          emailVerified: true, avatar: null, createdAt: new Date().toISOString(),
          preferences: { theme: 'system', dmPolicy: 'requests' }, needsCguReconsent: false, onboarded: true, isAdult: false,
        },
      }),
    );

    await page.goto(`/illustration/${ID}`);
    await expect(page.getByText('Ce contenu est réservé aux adultes.')).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    // Unchanged by the blur presentation update: the server never let this content load (403
    // before the fetch resolves), so there is nothing to blur — no 18+ content in the DOM at all.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  });
});
