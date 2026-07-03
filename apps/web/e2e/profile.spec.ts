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

// ---------------------------------------------------------------------------
// F-20: Genre vocabulary & tag picker
//   Bug fixed: the old comma-separated "Recherche active" input round-tripped
//   through join/split on every keystroke, deleting spaces/commas as they were
//   typed — multi-word genres could not be entered. Both genre inputs are now
//   vocabulary-restricted pickers with no join/split anywhere.
// ---------------------------------------------------------------------------

async function loginUi(page: import('@playwright/test').Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

// Round 1b: the "Recherche active" seeking picker and the "Genres & affinités"
// tag cloud now render byte-identical GenreChip markup (both "Retirer <genre>"
// buttons) — an unscoped getByRole lookup is ambiguous once the same genre
// exists in both places. Scope to the seeking picker via its unique
// "Ajouter un genre" input's row (GenreSuggestInput wraps the <input> in its
// own container div, so the chip-holding flex row is two levels up).
function seekingGenresPanel(page: import('@playwright/test').Page) {
  return page.getByRole('combobox', { name: 'Ajouter un genre' }).locator('../..');
}

test('F20-API-1: PATCH /profiles/me canonicalizes multi-word + diacritics tags, drops unknown genres', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.patch(`${API}/profiles/me`, {
    data: { tags: ['dark fantasy', 'shonen', 'PasUnGenreValideXYZ'] },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.tags).toContain('Dark Fantasy'); // multi-word, space preserved
  expect(body.tags).toContain('Shōnen'); // diacritics-insensitive canonicalization
  expect(body.tags).not.toContain('PasUnGenreValideXYZ'); // unknown silently dropped
});

test('F20-API-2: PATCH /profiles/me canonicalizes seeking.genres, drops unknown genres', async ({
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  const res = await request.patch(`${API}/profiles/me`, {
    data: {
      seeking: {
        active: true,
        targetRole: 'scénariste',
        genres: ['dark fantasy', 'thriller', 'zzz-pas-un-genre'],
        projectLength: 'court',
      },
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.seeking.genres).toEqual(['Dark Fantasy', 'Thriller']);
});

test('F20-UI-1: tag cloud "+ Ajouter" accepts a multi-word genre with spaces preserved while typing', async ({
  page,
}) => {
  // Baseline: no 'Dark Fantasy' tag yet.
  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '＋ Ajouter' }).click();
  const input = page.getByRole('combobox', { name: 'Nouveau genre' });
  await expect(input).toBeVisible();
  // Type character-by-character (this is exactly how the old bug manifested:
  // every keystroke re-split on commas/trimmed, deleting the space as it was typed).
  await input.pressSequentially('Dark Fantasy');
  await expect(input).toHaveValue('Dark Fantasy'); // space NOT stripped mid-typing
  await input.press('Enter');

  // Chip created with the canonical multi-word label; input closes back to "+ Ajouter".
  await expect(page.getByRole('button', { name: /Dark Fantasy/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '＋ Ajouter' })).toBeVisible();
});

test('F20-UI-2: tag cloud rejects a non-vocabulary string — no chip is created', async ({
  page,
}) => {
  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '＋ Ajouter' }).click();
  const input = page.getByRole('combobox', { name: 'Nouveau genre' });
  await input.pressSequentially('Pas Un Genre Valide');
  await input.press('Enter');

  // Rejected silently: no new chip, input stays open (does not fall back to "+ Ajouter").
  await expect(page.getByRole('button', { name: /Pas Un Genre Valide/ })).not.toBeVisible();
  await expect(input).toBeVisible();
});

test('F20-UI-3: "Recherche active" genre chip picker — add, remove, and persist across reload', async ({
  page,
  request,
}) => {
  // Deterministic baseline via API: seeking active with a single 'Seinen' genre.
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  await request.patch(`${API}/profiles/me`, {
    data: {
      seeking: {
        active: true,
        targetRole: 'scénariste',
        genres: ['Seinen'],
        projectLength: 'court',
      },
    },
  });

  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });

  const seekingPanel = seekingGenresPanel(page);

  // Existing genre renders as a removable chip.
  await expect(seekingPanel.getByRole('button', { name: 'Retirer Seinen' })).toBeVisible();

  // Add a multi-word genre via the vocabulary-backed picker (label is now "Genres", no
  // "séparés par virgule").
  await expect(page.getByText('Genres', { exact: true })).toBeVisible();
  await expect(page.getByText(/séparés par virgule/)).toHaveCount(0);
  const addGenreInput = page.getByRole('combobox', { name: 'Ajouter un genre' });
  await addGenreInput.pressSequentially('Dark Fantasy');
  await expect(addGenreInput).toHaveValue('Dark Fantasy'); // space preserved (the bug, structurally)
  await addGenreInput.press('Enter');
  await expect(seekingPanel.getByRole('button', { name: 'Retirer Dark Fantasy' })).toBeVisible();

  // Non-vocabulary text is rejected here too (same shared picker).
  await addGenreInput.pressSequentially('Genre Bidon Inexistant');
  await addGenreInput.press('Enter');
  await expect(seekingPanel.getByRole('button', { name: 'Retirer Genre Bidon Inexistant' })).not.toBeVisible();

  // Remove the original 'Seinen' chip.
  await seekingPanel.getByRole('button', { name: 'Retirer Seinen' }).click();
  await expect(seekingPanel.getByRole('button', { name: 'Retirer Seinen' })).not.toBeVisible();

  // Save, then reload the page fresh — the PATCH round-trip persisted only
  // the canonical 'Dark Fantasy' genre.
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: /Modifier le profil/i })).toBeVisible({ timeout: 8_000 });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });
  const seekingPanelAfterReload = seekingGenresPanel(page);
  await expect(seekingPanelAfterReload.getByRole('button', { name: 'Retirer Dark Fantasy' })).toBeVisible();
  await expect(seekingPanelAfterReload.getByRole('button', { name: 'Retirer Seinen' })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// F-20 Round 1b: user UX refinements
//   (1) blur commits a matching typed genre (same path as Enter)
//   (2) chips are always accent-red, removed via a small ✕ (GenreChip) — no
//       more toggle/deselect
//   (3) native <datalist> replaced by a custom on-brand dropdown
//       (listbox/option roles, keyboard nav, outside-click close)
// ---------------------------------------------------------------------------

test('F20b-UI-1: tag cloud — blur commits a matching typed genre (no Enter needed)', async ({
  page,
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  await request.patch(`${API}/profiles/me`, { data: { tags: ['Seinen'] } });

  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '＋ Ajouter' }).click();
  const input = page.getByRole('combobox', { name: 'Nouveau genre' });
  await input.pressSequentially('Josei');
  // Blur (unfocus) instead of Enter — commits exactly like Enter would.
  await input.blur();

  await expect(page.getByRole('button', { name: 'Retirer Josei' })).toBeVisible();
  // Row collapses back to "+ Ajouter" after blur, same as after a successful Enter.
  await expect(page.getByRole('button', { name: '＋ Ajouter' })).toBeVisible();
});

test('F20b-UI-2: tag cloud — blur on a non-vocabulary string clears the input, no chip created', async ({
  page,
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  await request.patch(`${API}/profiles/me`, { data: { tags: ['Seinen'] } });

  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '＋ Ajouter' }).click();
  const input = page.getByRole('combobox', { name: 'Nouveau genre' });
  await input.pressSequentially('Genre Inexistant Blur');
  await input.blur();

  await expect(page.getByRole('button', { name: /Genre Inexistant Blur/ })).not.toBeVisible();
  // Input closed (cleared + cancelled) back to "+ Ajouter", per round-1b blur behavior.
  await expect(page.getByRole('button', { name: '＋ Ajouter' })).toBeVisible();
});

test('F20b-UI-3: "Recherche active" picker — blur commits a matching genre, identical to the tag cloud', async ({
  page,
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  await request.patch(`${API}/profiles/me`, {
    data: {
      seeking: { active: true, targetRole: 'scénariste', genres: ['Seinen'], projectLength: 'court' },
    },
  });

  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });

  const addGenreInput = page.getByRole('combobox', { name: 'Ajouter un genre' });
  await addGenreInput.pressSequentially('Horreur');
  await addGenreInput.blur();

  await expect(seekingGenresPanel(page).getByRole('button', { name: 'Retirer Horreur' })).toBeVisible();
});

test('F20b-UI-4: custom on-brand dropdown — listbox/option roles, ArrowDown+Enter selects', async ({
  page,
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  await request.patch(`${API}/profiles/me`, { data: { tags: ['Seinen'] } });

  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '＋ Ajouter' }).click();
  const input = page.getByRole('combobox', { name: 'Nouveau genre' });
  // Lowercase substring, matches the shared design-system dropdown pattern
  // (role=listbox/option), not the browser-native datalist look.
  await input.pressSequentially('fantasy');

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const options = listbox.getByRole('option');
  await expect(options).toHaveCount(4); // Fantasy, Dark Fantasy, Fantasy urbaine, Heroic Fantasy
  await expect(options.nth(0)).toHaveText('Fantasy');
  await expect(options.nth(1)).toHaveText('Dark Fantasy');

  await input.press('ArrowDown'); // highlight moves from Fantasy (0) → Dark Fantasy (1)
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  // Visual evidence of the on-brand dropdown (ink border, card bg, hard shadow, accent highlight).
  await page.screenshot({ path: 'e2e/screenshots/f20b-dropdown-open.png' });
  await input.press('Enter');

  await expect(page.getByRole('button', { name: 'Retirer Dark Fantasy' })).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0); // dropdown closed after selection
});

test('F20b-UI-5: ✕ on a tag-cloud chip removes it and the removal persists after reload', async ({
  page,
  request,
}) => {
  await loginApi(request, ACCOUNTS.UTILISATEUR.email);
  await request.patch(`${API}/profiles/me`, { data: { tags: ['Seinen', 'Thriller'] } });

  await loginUi(page, ACCOUNTS.UTILISATEUR.email);
  await page.goto('/e2e-utilisateur');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

  // Chips are always filled accent-red now — no toggle/aria-pressed, just a ✕ remove button.
  await expect(page.getByRole('button', { name: 'Retirer Seinen' })).toBeVisible();
  await page.getByRole('button', { name: 'Retirer Seinen' }).click();
  await expect(page.getByRole('button', { name: 'Retirer Seinen' })).not.toBeVisible();

  // Tag-cloud removal persists instantly via PATCH (no "Enregistrer" needed) — confirm via reload.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Retirer Seinen' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirer Thriller' })).toBeVisible();
});

// ── F-20 RESPONSIVE — genre chip picker at mobile / tablet / desktop ─────────

for (const [label, width, height] of [
  ['375px (mobile)', 375, 812],
  ['768px (tablet)', 768, 1024],
  ['1280px (desktop)', 1280, 800],
] as [string, number, number][]) {
  test(`F20 responsive: owner edit genre picker at ${label} — no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loginUi(page, ACCOUNTS.UTILISATEUR.email);
    await page.goto('/e2e-utilisateur');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });
    await expect(page.getByText('Genres', { exact: true })).toBeVisible();

    await page.screenshot({ path: `e2e/screenshots/f20-genre-picker-${width}.png` });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
}
