/**
 * F-3 Creator profile & portfolio — e2e acceptance suite
 *
 * Covers all plan acceptance criteria:
 *   API: GET /profiles/:slug (200, 404), PATCH /profiles/me (401, 200, 400, tag-dedup),
 *        GET /profiles/:slug/portfolio (items, empty, 404)
 *   UI:  /<slug> — cover, name, roleLine, seeking banner, stats, tags section, tablist,
 *        portfolio empty state, portfolio grid (with items), action buttons
 *   Owner edit: login → see edit button, update specialty → roleLine reflected on save
 *   404: unknown slug shows "Profil introuvable"
 *
 * Accounts seeded by global-setup.ts. Profile data and portfolio items set up in beforeAll.
 * Teardown (global-teardown.ts) cleans portfolio items → profiles → accounts in order.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';

const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

const ADD_PORTFOLIO_SCRIPT = path.join(
  __dirname,
  '../../api/prisma/e2e-add-portfolio.js',
);

/** Login via the API. Subsequent calls on the same context carry the session cookie. */
async function loginApi(ctx: APIRequestContext, email: string) {
  const res = await ctx.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (res.status() !== 200) {
    throw new Error(`loginApi failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Per-file setup: seed profile data for the accounts used in this suite.
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  // Set up a rich profile for e2e-utilisateur (slug: 'e2e-utilisateur')
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const profileSetup = await request.patch(`${API}/profiles/me`, {
    data: {
      specialty: 'encre & screentone',
      city: 'Lyon, FR',
      bio: 'Un mangaka passionné.',
      tags: ['Seinen', 'Thriller'],
      seeking: {
        active: true,
        targetRole: 'scénariste',
        genres: ['Seinen', 'Thriller'],
        projectLength: 'projet long',
      },
    },
  });
  if (profileSetup.status() !== 200) {
    throw new Error(
      `Profile setup PATCH /profiles/me failed: ${profileSetup.status()} ${await profileSetup.text()}`,
    );
  }

  // Add 3 portfolio items to e2e-target (idempotent — clears existing before inserting)
  execFileSync('node', [ADD_PORTFOLIO_SCRIPT, 'e2e-target', '3'], {
    env: { ...process.env },
    stdio: 'pipe',
  });
});

// ---------------------------------------------------------------------------
// API: GET /profiles/:slug
// ---------------------------------------------------------------------------

test('F3-API-1: GET /profiles/e2e-utilisateur → 200 with correct composed shape', async ({
  request,
}) => {
  const res = await request.get(`${API}/profiles/e2e-utilisateur`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  // Identity from Account
  expect(body.slug).toBe('e2e-utilisateur');
  expect(typeof body.displayName).toBe('string');

  // roleLine composed from specialty + city (plan D2)
  expect(body.roleLine).toBe('encre & screentone · Lyon, FR');
  expect(body.specialty).toBe('encre & screentone');
  expect(body.city).toBe('Lyon, FR');
  expect(body.bio).toBe('Un mangaka passionné.');

  // seeking composed (plan D3)
  expect(body.seeking.active).toBe(true);
  expect(body.seeking.targetRole).toBe('scénariste');
  expect(body.seeking.genres).toContain('Seinen');
  expect(body.seeking.projectLength).toBe('projet long');
  expect(body.seeking.text).toMatch(/Cherche actuellement un·e scénariste/);

  // tags
  expect(body.tags).toContain('Seinen');
  expect(body.tags).toContain('Thriller');

  // counters always 0 (plan D4)
  expect(body.counters).toMatchObject({ followers: 0, likes: 0, works: 0, supporters: 0 });
});

test('F3-API-2: GET /profiles/nonexistent-slug-f3test → 404', async ({ request }) => {
  const res = await request.get(`${API}/profiles/nonexistent-slug-f3test`);
  expect(res.status()).toBe(404);
});

// ---------------------------------------------------------------------------
// API: PATCH /profiles/me
// ---------------------------------------------------------------------------

test('F3-API-3: PATCH /profiles/me without auth → 401', async ({ request }) => {
  // Fresh request context — no session cookie; no loginApi call
  const res = await request.patch(`${API}/profiles/me`, {
    data: { bio: 'intruder' },
  });
  expect(res.status()).toBe(401);
});

test('F3-API-4: PATCH /profiles/me authenticated → 200, bio updated', async ({ request }) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.patch(`${API}/profiles/me`, {
    data: { bio: 'Bio e2e mise à jour.' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.bio).toBe('Bio e2e mise à jour.');
  expect(body.slug).toBe('e2e-utilisateur');
});

test('F3-API-5: PATCH /profiles/me invalid seeking.targetRole → 400', async ({ request }) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.patch(`${API}/profiles/me`, {
    data: { seeking: { active: true, targetRole: 'chef cuisinier' } },
  });
  expect(res.status()).toBe(400);
});

test('F3-API-6: PATCH /profiles/me duplicate + empty tags → deduplicated in response', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.patch(`${API}/profiles/me`, {
    data: { tags: ['Action', '', 'action', 'Action', 'Thriller'] },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  // '' dropped; 'action' / 'Action' are same key (case-insensitive); second 'Action' dropped
  expect(body.tags).toEqual(['Action', 'Thriller']);
});

// ---------------------------------------------------------------------------
// API: GET /profiles/:slug/portfolio
// ---------------------------------------------------------------------------

test('F3-API-7: GET /profiles/e2e-target/portfolio → 3 ordered items', async ({ request }) => {
  const res = await request.get(`${API}/profiles/e2e-target/portfolio`);
  expect(res.status()).toBe(200);
  const items = await res.json();
  expect(Array.isArray(items)).toBe(true);
  expect(items.length).toBe(3);
  expect(items[0].order).toBeLessThanOrEqual(items[1].order);
  expect(items[1].order).toBeLessThanOrEqual(items[2].order);
  expect(typeof items[0].image).toBe('string');
  expect(items[0].caption).toMatch(/Œuvre/);
});

test('F3-API-8: GET /profiles/e2e-utilisateur/portfolio → empty array (no items seeded)', async ({
  request,
}) => {
  // Re-setup profile so bio reset doesn't affect portfolio test
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  await request.patch(`${API}/profiles/me`, {
    data: {
      specialty: 'encre & screentone',
      city: 'Lyon, FR',
      bio: 'Un mangaka passionné.',
      tags: ['Seinen', 'Thriller'],
      seeking: { active: true, targetRole: 'scénariste', genres: ['Seinen', 'Thriller'], projectLength: 'projet long' },
    },
  });

  const res = await request.get(`${API}/profiles/e2e-utilisateur/portfolio`);
  expect(res.status()).toBe(200);
  const items = await res.json();
  expect(items).toEqual([]);
});

test('F3-API-9: GET /profiles/unknown-xyz/portfolio → 404', async ({ request }) => {
  const res = await request.get(`${API}/profiles/unknown-xyz-f3test/portfolio`);
  expect(res.status()).toBe(404);
});

// ---------------------------------------------------------------------------
// UI: /<slug> — public profile rendering
// ---------------------------------------------------------------------------

test('F3-UI-1: /e2e-utilisateur renders name, roleLine, seeking banner, stats', async ({
  page,
}) => {
  await page.goto('/e2e-utilisateur');

  // Name heading renders
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  // roleLine: specialty · city
  await expect(page.getByText('encre & screentone · Lyon, FR')).toBeVisible();

  // Seeking banner (dashed-red) shows composed text
  await expect(page.getByText(/Cherche actuellement un·e scénariste/)).toBeVisible();

  // Stats row — all four French labels present (exact match to avoid clashing with tab names)
  await expect(page.getByText('abonnés', { exact: true })).toBeVisible();
  await expect(page.getByText("J'aime", { exact: true })).toBeVisible();
  await expect(page.getByText('œuvres', { exact: true })).toBeVisible();
  await expect(page.getByText('soutiens', { exact: true })).toBeVisible();

  // Tags section header
  await expect(page.getByText('Genres & affinités')).toBeVisible();
});

test('F3-UI-2: /e2e-utilisateur tablist has 4 tabs, Portfolio selected by default', async ({
  page,
}) => {
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  // Accessible tablist
  const tablist = page.getByRole('tablist', { name: 'Sections du profil' });
  await expect(tablist).toBeVisible();

  // All 4 tab labels
  await expect(page.getByRole('tab', { name: 'Portfolio' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Œuvres publiées' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'À propos' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Avis' })).toBeVisible();

  // Portfolio is selected by default
  await expect(page.getByRole('tab', { name: 'Portfolio' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Œuvres publiées' })).toHaveAttribute('aria-selected', 'false');
});

test('F3-UI-3: /e2e-utilisateur portfolio tab shows empty state', async ({ page }) => {
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  // e2e-utilisateur has no portfolio items → empty state message
  await expect(page.getByText("Aucune œuvre pour l'instant.")).toBeVisible({ timeout: 10_000 });
});

test('F3-UI-4: /e2e-utilisateur shows 4 action buttons for visitor', async ({ page }) => {
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByRole('button', { name: 'Suivre' })).toBeVisible();
  // fullwidth ＋ before text — match by partial name
  await expect(page.getByRole('button', { name: /Se connecter/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Soutenir/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Proposer une collab' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// UI: /e2e-target — portfolio grid with items
// ---------------------------------------------------------------------------

test('F3-UI-5: /e2e-target portfolio grid renders 3 items', async ({ page }) => {
  await page.goto('/e2e-target');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  // Items have captions "Œuvre 1", "Œuvre 2", "Œuvre 3" from e2e-add-portfolio.js
  await expect(page.getByText('Œuvre 1')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Œuvre 2')).toBeVisible();
  await expect(page.getByText('Œuvre 3')).toBeVisible();

  // Grid container (div, not tabpanel) has aria-label="Portfolio"
  await expect(page.locator('div[aria-label="Portfolio"]')).toBeVisible();
});

// ---------------------------------------------------------------------------
// UI: 404 unknown slug
// ---------------------------------------------------------------------------

test('F3-UI-6: /nonexistent-slug-xyz shows "Profil introuvable"', async ({ page }) => {
  await page.goto('/nonexistent-slug-xyz-f3');
  await expect(page.getByText('Profil introuvable')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Ce profil n'existe pas ou a été supprimé.")).toBeVisible();
});

// ---------------------------------------------------------------------------
// UI: Owner edit mode
// ---------------------------------------------------------------------------

test('F3-UI-7: owner sees "Modifier le profil", action buttons absent', async ({ page }) => {
  // Log in as the profile owner via UI
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Navigate to own profile
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  // Owner: edit button visible
  await expect(page.getByRole('button', { name: /Modifier le profil/i })).toBeVisible({ timeout: 8_000 });

  // Action buttons NOT shown to owner
  await expect(page.getByRole('button', { name: 'Suivre' })).not.toBeVisible();
});

test('F3-UI-8: owner edit mode updates specialty → roleLine reflected on save', async ({
  page,
}) => {
  // Login
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Go to own profile
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  // Enter edit mode
  await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });

  // The edit form should appear
  const specialtyInput = page.getByLabel('Spécialité');
  await expect(specialtyInput).toBeVisible({ timeout: 5_000 });

  // Update specialty
  await specialtyInput.clear();
  await specialtyInput.fill('mangaka indépendant');

  // Save
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  // After save, edit mode closes and edit button reappears
  await expect(page.getByRole('button', { name: /Modifier le profil/i })).toBeVisible({ timeout: 8_000 });

  // roleLine updates: 'mangaka indépendant · Lyon, FR'
  await expect(page.getByText('mangaka indépendant · Lyon, FR')).toBeVisible();
});
