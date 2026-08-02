/**
 * F-7 Global search — e2e acceptance suite
 *
 * Acceptance criteria covered:
 *   API: GET /search 401 when logged out; 200 empty when q < 2 chars; 200 creators match
 *        by name/specialty; works match by title AND by author name; illustrations match by title
 *        and artist; scope param narrows; invalid scope → 400.
 *   UI:  header button opens overlay; single-char stays idle; query ≥ 2 → Créateur·rices group;
 *        click result → navigates to /<slug>; no-match → "Aucun résultat"; logged-out →
 *        "Connectez-vous"; Escape closes + returns focus; ArrowDown roving focus;
 *        Œuvres + Illustrations groups render (seed-coherence pass 2026-08-02: the two providers
 *        `SEARCH_RESULT_TYPES` declared from day one are now registered).
 *
 * Accounts seeded by global-setup.ts (e2e-seed.js). Profile data seeded in beforeAll via API.
 * Uses existing e2e accounts: UTILISATEUR (searcher) and TARGET (search subject).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';

const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

async function loginApi(ctx: APIRequestContext, email: string) {
  const res = await ctx.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (res.status() !== 200) {
    throw new Error(`loginApi failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}

// Seed TARGET's profile with a known specialty so search-by-specialty can be asserted.
test.beforeAll(async ({ request }) => {
  await loginApi(request, ACCOUNTS.TARGET.email);
  const res = await request.patch(`${API}/profiles/me`, {
    data: {
      specialty: 'f7-dessin-manga',
      city: 'Kyoto, JP',
      tags: ['Shonen'],
    },
  });
  if (res.status() !== 200) {
    throw new Error(`TARGET profile seed failed: ${res.status()} ${await res.text()}`);
  }
});

// ---------------------------------------------------------------------------
// API: authentication gate
// ---------------------------------------------------------------------------

test('F7-API-1: GET /search without session → 401', async ({ request }) => {
  // No loginApi → no session cookie → SessionGuard blocks
  const res = await request.get(`${API}/search?q=manga`);
  expect(res.status()).toBe(401);
});

// ---------------------------------------------------------------------------
// API: min-length gate
// ---------------------------------------------------------------------------

test('F7-API-2: GET /search?q=a (1 char) → 200 all-empty (below min length)', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=a`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.works).toEqual([]);
  expect(body.creators).toEqual([]);
  expect(body.illustrations).toEqual([]);
});

// ---------------------------------------------------------------------------
// API: creator matching — displayName contains
// ---------------------------------------------------------------------------

test('F7-API-3: GET /search?q=E2E+TARGET → creators contains TARGET', async ({ request }) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=E2E+TARGET`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const found = body.creators.find((c: { title: string }) => c.title === 'E2E TARGET');
  expect(found).toBeDefined();
  expect(found.route).toBe('/e2e-target');
  expect(found.type).toBe('creators');
  expect(found).toHaveProperty('id');
  expect(found).toHaveProperty('thumbnail');
});

// ---------------------------------------------------------------------------
// API: creator matching — specialty contains (case-insensitive)
// ---------------------------------------------------------------------------

test('F7-API-4: GET /search?q=f7-dessin-manga → matches TARGET by specialty', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=f7-dessin-manga`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.creators.length).toBeGreaterThan(0);
  const found = body.creators.find((c: { title: string }) => c.title === 'E2E TARGET');
  expect(found).toBeDefined();
});

// ---------------------------------------------------------------------------
// API: no results
// ---------------------------------------------------------------------------

test('F7-API-5: GET /search?q=zzz-no-match-f7 → 200 all-empty', async ({ request }) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=zzz-no-match-f7xyz`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.works).toEqual([]);
  expect(body.creators).toEqual([]);
  expect(body.illustrations).toEqual([]);
});

// ---------------------------------------------------------------------------
// API: scope narrowing
// ---------------------------------------------------------------------------

test('F7-API-6: GET /search?q=E2E+TARGET&scope=creators → only creators filled', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=E2E+TARGET&scope=creators`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.works).toEqual([]);
  expect(body.illustrations).toEqual([]);
  expect(body.creators.length).toBeGreaterThan(0);
});

test('F7-API-7: GET /search?q=E2E+MC10&scope=works → only the works group is filled', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=E2E+MC10&scope=works`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.creators).toEqual([]);
  expect(body.illustrations).toEqual([]);
  expect(body.works.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// API: works + illustrations corpora (seed-coherence pass — the two providers
// SEARCH_RESULT_TYPES declared and nothing ever backed)
// ---------------------------------------------------------------------------

test('F7-API-9: GET /search?q=MC10+Œuvre → works contains the published work, routed to /oeuvre/:slug', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=${encodeURIComponent('MC10 Œuvre')}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const found = body.works.find((w: { title: string }) => w.title === 'E2E MC10 Œuvre A');
  expect(found).toBeDefined();
  expect(found.type).toBe('works');
  expect(found.route).toBe('/oeuvre/e2e-mc10-oeuvre-a');
  expect(found).toHaveProperty('thumbnail');
});

// THE regression guard for the dropped `Work.meta` column: searching an AUTHOR's name used to work
// only because that name was baked into the stored meta string. It now matches through WorkCreator.
test('F7-API-10: GET /search?q=E2E+MC10_A → the work is found by its AUTHOR name, not just its title', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=E2E+MC10_A`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  // "E2E MC10_A" appears nowhere in the work's title — only in its creator's displayName.
  expect(body.works.map((w: { title: string }) => w.title)).toContain('E2E MC10 Œuvre A');
});

test('F7-API-11: GET /search?q=MC10+Illustration → illustrations contains the published piece', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=MC10+Illustration`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const found = body.illustrations.find((i: { title: string }) => i.title === 'E2E MC10 Illustration A');
  expect(found).toBeDefined();
  expect(found.type).toBe('illustrations');
  expect(found.route).toBe(`/illustration/${found.id}`);
});

test('F7-API-8: GET /search?q=foo&scope=invalid → 400', async ({ request }) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.get(`${API}/search?q=foo&scope=invalid`);
  expect(res.status()).toBe(400);
});

// ---------------------------------------------------------------------------
// UI: header button + overlay opens
// ---------------------------------------------------------------------------

test('F7-UI-1: header "Rechercher…" button opens overlay with focused input', async ({ page }) => {
  await page.goto('/');
  const searchBtn = page.getByRole('button', { name: /rechercher/i });
  await expect(searchBtn).toBeVisible({ timeout: 10_000 });
  await searchBtn.click();

  const dialog = page.getByRole('dialog', { name: /rechercher/i });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const input = page.getByRole('combobox', { name: /rechercher/i });
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
});

// ---------------------------------------------------------------------------
// UI: single-char query stays idle
// ---------------------------------------------------------------------------

test('F7-UI-2: single-char query → stays idle, no results rendered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /rechercher/i }).click();
  const input = page.getByRole('combobox', { name: /rechercher/i });
  await input.fill('a');

  // Idle prompt must still be visible
  await expect(page.getByText(/recherchez une œuvre/i)).toBeVisible({ timeout: 3_000 });
  // No listbox (results) yet
  await expect(page.getByRole('listbox')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// UI: logged-in search → grouped results → click navigates
// ---------------------------------------------------------------------------

test('F7-UI-3: logged-in, type "E2E TARGET" → Créateur·rices group appears', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  await page.getByRole('button', { name: /rechercher/i }).click();
  await expect(page.getByRole('dialog', { name: /rechercher/i })).toBeVisible();

  const input = page.getByRole('combobox', { name: /rechercher/i });
  await input.fill('E2E TARGET');

  await expect(page.getByText('Créateur·rices')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('option', { name: /E2E TARGET/i })).toBeVisible({ timeout: 5_000 });
});

test('F7-UI-4: clicking a result navigates to /<slug>', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  await page.getByRole('button', { name: /rechercher/i }).click();
  const input = page.getByRole('combobox', { name: /rechercher/i });
  await input.fill('E2E TARGET');

  const option = page.getByRole('option', { name: /E2E TARGET/i });
  await expect(option).toBeVisible({ timeout: 8_000 });
  await option.click();

  await expect(page).toHaveURL('/e2e-target', { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// UI: no-match state
// ---------------------------------------------------------------------------

test('F7-UI-5: query with no matches → "Aucun résultat"', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  await page.getByRole('button', { name: /rechercher/i }).click();
  const input = page.getByRole('combobox', { name: /rechercher/i });
  await input.fill('zzz-no-match-xyz-f7');

  await expect(page.getByText(/aucun résultat/i)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// UI: logged-out → "Connectez-vous" prompt
// ---------------------------------------------------------------------------

test('F7-UI-6: logged-out query ≥ 2 chars → "Connectez-vous" link shown', async ({ page }) => {
  // No login — fresh page (unauthenticated)
  await page.goto('/');

  await page.getByRole('button', { name: /rechercher/i }).click();
  await expect(page.getByRole('dialog', { name: /rechercher/i })).toBeVisible();

  const input = page.getByRole('combobox', { name: /rechercher/i });
  await input.fill('manga');

  // API returns 401 → overlay shows sign-in link
  await expect(page.getByRole('link', { name: /connectez-vous/i })).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// UI: keyboard a11y — Escape closes + returns focus
// ---------------------------------------------------------------------------

test('F7-UI-7: Escape closes the overlay and returns focus to search button', async ({ page }) => {
  await page.goto('/');
  const searchBtn = page.getByRole('button', { name: /rechercher/i });
  await searchBtn.click();
  await expect(page.getByRole('dialog', { name: /rechercher/i })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: /rechercher/i })).not.toBeVisible({
    timeout: 3_000,
  });
  // Focus must return to the header search button
  await expect(searchBtn).toBeFocused({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// UI: keyboard a11y — ArrowDown roving focus to first result
// ---------------------------------------------------------------------------

test('F7-UI-8: ArrowDown from input moves focus to first result option', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  await page.getByRole('button', { name: /rechercher/i }).click();
  const input = page.getByRole('combobox', { name: /rechercher/i });
  await input.fill('E2E TARGET');

  // Wait for results
  await expect(page.getByText('Créateur·rices')).toBeVisible({ timeout: 8_000 });

  await page.keyboard.press('ArrowDown');

  // First option acquires focus
  const firstOption = page.getByRole('option').first();
  await expect(firstOption).toBeFocused({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// UI: works & illustrations groups now render (providers registered)
// ---------------------------------------------------------------------------

test('F7-UI-9: Œuvres and Illustrations groups render when the corpora match', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  await page.getByRole('button', { name: /rechercher/i }).click();
  const input = page.getByRole('combobox', { name: /rechercher/i });
  await input.fill('E2E MC10');

  await expect(page.getByText('Œuvres')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('option', { name: /E2E MC10 Œuvre A/i })).toBeVisible();
  await expect(page.getByText('Illustrations', { exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /E2E MC10 Illustration A/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// UI: F-4/F-5 regression — header nav and dropdown still intact
// (theme toggle removed: picker disabled, light mode forced)
// ---------------------------------------------------------------------------

test('F7-REGR-1: header nav links and dropdown still present after search wiring', async ({
  page,
}) => {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Nav links (F-4)
  await expect(page.getByRole('navigation', { name: /navigation principale/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Accueil' })).toBeVisible();

  // Avatar button and dropdown (F-4) — open it and check the menu renders
  const avatarBtn = page.getByRole('button', { name: /menu de/i });
  await expect(avatarBtn).toBeVisible();
  await avatarBtn.click();
  await expect(page.getByRole('menu')).toBeVisible({ timeout: 3_000 });
  await expect(page.getByRole('menuitem', { name: /déconnexion/i })).toBeVisible();
});
