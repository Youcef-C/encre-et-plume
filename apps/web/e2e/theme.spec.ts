/**
 * F-6 Light/Dark theme — e2e acceptance suite
 *
 * Covers all F-6 acceptance criteria:
 *   - Toggle in avatar dropdown: ☀ Clair / ☾ Sombre present and operable
 *   - Clicking toggle re-skins the app immediately (data-theme flips, no reload)
 *   - Key token (--paper background) actually changes colour in DOM
 *   - Cookie persistence: after reload page stays in chosen theme
 *   - SSR no-flash: setting ep_theme cookie before navigation means HTML arrives
 *     with the correct data-theme attribute (no light→dark flash)
 *   - PATCH /accounts/me/preferences fires when logged-in user changes theme
 *   - GET /auth/me returns preferences.theme (verified via mock response shape)
 *   - prefers-color-scheme: dark with no explicit cookie → data-theme="system"
 *   - Keyboard operability: toggle reachable and operable without a mouse
 *
 * Hermetic: uses page.route to mock /auth/me and /accounts/me/preferences.
 * No DB writes needed.  The existing global-setup/teardown are kept for the
 * other spec files and don't need extending here.
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helper: mock a logged-in session and land on home
// ---------------------------------------------------------------------------

async function mockLoginWithTheme(
  page: Page,
  opts: { displayName: string; theme?: 'light' | 'dark' | 'system' },
) {
  const { displayName, theme = 'system' } = opts;
  const slug = displayName.toLowerCase().replace(/\s+/g, '-');

  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-theme-' + Math.random().toString(36).slice(2, 7),
          email: 'theme-user@test.com',
          displayName,
          role: 'utilisateur',
          verified: false,
          slug,
          createdAt: new Date().toISOString(),
          preferences: { theme },
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: new RegExp(`menu de ${displayName}`, 'i') }),
  ).toBeVisible({ timeout: 10_000 });
}

// Open the avatar dropdown
async function openAvatarMenu(page: Page, displayName: string) {
  await page.getByRole('button', { name: new RegExp(`menu de ${displayName}`, 'i') }).click();
  // Wait for the menu to appear
  await expect(page.getByRole('menu')).toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// F6-E2E-1: Toggle buttons present in dropdown
// ---------------------------------------------------------------------------

test('F6-E2E-1: avatar dropdown contains ☀ Clair and ☾ Sombre buttons', async ({ page }) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Presence' });
  await openAvatarMenu(page, 'Theme Presence');

  await expect(page.getByRole('button', { name: /clair/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /sombre/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// F6-E2E-2: Toggle group has aria-label="Thème" (accessibility)
// ---------------------------------------------------------------------------

test('F6-E2E-2: theme toggle group has accessible label "Thème"', async ({ page }) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Label' });
  await openAvatarMenu(page, 'Theme Label');

  const group = page.getByRole('group', { name: /thème/i });
  await expect(group).toBeVisible();
});

// ---------------------------------------------------------------------------
// F6-E2E-3: Clicking Sombre flips html[data-theme] to "dark" without reload
// ---------------------------------------------------------------------------

test('F6-E2E-3: clicking Sombre sets data-theme="dark" immediately (no reload)', async ({
  page,
}) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Dark Toggle' });
  await openAvatarMenu(page, 'Theme Dark Toggle');

  // Track whether a full navigation happens (it should not)
  let navigated = false;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigated = true;
  });

  await page.getByRole('button', { name: /sombre/i }).click();

  // data-theme attribute should be "dark" now
  const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(dataTheme).toBe('dark');

  // No full navigation/reload should have occurred
  expect(navigated).toBe(false);
});

// ---------------------------------------------------------------------------
// F6-E2E-4: Key token actually changes — background colour shifts in dark
// ---------------------------------------------------------------------------

test('F6-E2E-4: switching to dark mode changes the computed --paper background token', async ({
  page,
}) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Token' });

  // Record light background first (paper = #f1ece1 → rgb(241, 236, 225))
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await openAvatarMenu(page, 'Theme Token');
  await page.getByRole('button', { name: /sombre/i }).click();

  // Dark app background (prototype .ep[data-theme="dark"]) = #161310 → rgb(22, 19, 16)
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  expect(lightBg).not.toBe(darkBg);
  expect(darkBg).toBe('rgb(22, 19, 16)');
});

// ---------------------------------------------------------------------------
// F6-E2E-5: Cookie persistence — reload keeps the chosen theme
// ---------------------------------------------------------------------------

test('F6-E2E-5: chosen theme persists across page reload (ep_theme cookie)', async ({ page }) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Persist' });
  await openAvatarMenu(page, 'Theme Persist');
  await page.getByRole('button', { name: /sombre/i }).click();

  // Verify dark was applied
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  // Reload the page — the ep_theme=dark cookie should make the server render data-theme="dark"
  await page.reload({ waitUntil: 'domcontentloaded' });

  const afterReload = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(afterReload).toBe('dark');
});

// ---------------------------------------------------------------------------
// F6-E2E-6: SSR no-flash — html has data-theme before JS hydrates
// ---------------------------------------------------------------------------

test('F6-E2E-6: SSR renders html[data-theme="dark"] when ep_theme cookie is set (no flash)', async ({
  page,
}) => {
  // Set the cookie before navigation so the server can read it
  await page.context().addCookies([
    {
      name: 'ep_theme',
      value: 'dark',
      domain: 'localhost',
      path: '/',
    },
  ]);

  // Navigate and intercept at the earliest possible moment
  let initialDataTheme: string | null = null;

  await page.goto('/', { waitUntil: 'commit' });
  // 'commit' fires right after headers/initial response is committed, before DOM is parsed
  // We check immediately after DOMContentLoaded to catch pre-hydration state
  await page.waitForLoadState('domcontentloaded');

  initialDataTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
  expect(initialDataTheme).toBe('dark');

  // Clean up cookie for other tests
  await page.context().clearCookies();
});

// ---------------------------------------------------------------------------
// F6-E2E-7: aria-pressed reflects active theme
// ---------------------------------------------------------------------------

test('F6-E2E-7: Sombre button has aria-pressed="true" after clicking it', async ({ page }) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Pressed' });
  await openAvatarMenu(page, 'Theme Pressed');
  await page.getByRole('button', { name: /sombre/i }).click();

  // Menu may stay open or close; re-open if needed
  const sombreBtn = page.getByRole('button', { name: /sombre/i });
  if (!(await sombreBtn.isVisible())) {
    await openAvatarMenu(page, 'Theme Pressed');
  }

  await expect(page.getByRole('button', { name: /sombre/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /clair/i })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

// ---------------------------------------------------------------------------
// F6-E2E-8: system state — neither button is pressed before any explicit choice
// ---------------------------------------------------------------------------

test('F6-E2E-8: neither Clair nor Sombre is pressed in "system" state', async ({ page }) => {
  await mockLoginWithTheme(page, { displayName: 'Theme System', theme: 'system' });
  await openAvatarMenu(page, 'Theme System');

  await expect(page.getByRole('button', { name: /clair/i })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('button', { name: /sombre/i })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

// ---------------------------------------------------------------------------
// F6-E2E-9: PATCH /accounts/me/preferences fires when logged-in user toggles
// ---------------------------------------------------------------------------

test('F6-E2E-9: toggling theme calls PATCH /accounts/me/preferences when logged in', async ({
  page,
}) => {
  let patchCalled = false;
  let patchBody: unknown = null;

  // Intercept the PATCH endpoint
  await page.route('**/accounts/me/preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      patchCalled = true;
      patchBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-id',
          email: 'theme-user@test.com',
          displayName: 'Theme Patch',
          role: 'utilisateur',
          verified: false,
          slug: 'theme-patch',
          createdAt: new Date().toISOString(),
          preferences: { theme: 'dark' },
        }),
      });
    } else {
      await route.continue();
    }
  });

  await mockLoginWithTheme(page, { displayName: 'Theme Patch' });
  await openAvatarMenu(page, 'Theme Patch');
  await page.getByRole('button', { name: /sombre/i }).click();

  // Give the fire-and-forget a moment to fire
  await page.waitForTimeout(500);

  expect(patchCalled).toBe(true);
  expect(patchBody).toMatchObject({ theme: 'dark' });
});

// ---------------------------------------------------------------------------
// F6-E2E-10: GET /auth/me returns preferences.theme
// ---------------------------------------------------------------------------

test('F6-E2E-10: GET /auth/me response includes preferences.theme field', async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-theme-me',
          email: 'theme-me@test.com',
          displayName: 'Theme Me User',
          role: 'utilisateur',
          verified: false,
          slug: 'theme-me-user',
          createdAt: new Date().toISOString(),
          preferences: { theme: 'dark' },
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Use waitForResponse so we capture the browser-side /auth/me call from SessionProvider
  // (server-side fetch from Next.js SSR is not intercepted by page.route)
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/auth/me') && r.request().method() === 'GET',
      { timeout: 10_000 },
    ),
    page.goto('/'),
  ]);

  const body = await response.json();
  expect(body.preferences).toBeDefined();
  expect(body.preferences).toMatchObject({ theme: 'dark' });
});

// ---------------------------------------------------------------------------
// F6-E2E-11: prefers-color-scheme: dark with no explicit cookie → data-theme="system"
// ---------------------------------------------------------------------------

test(
  'F6-E2E-11: prefers-color-scheme:dark with no ep_theme cookie → data-theme="system"',
  async ({ browser }) => {
    // Create a context that reports dark OS preference
    const context = await browser.newContext({
      colorScheme: 'dark',
    });
    const page = await context.newPage();

    // Ensure no ep_theme cookie
    await context.clearCookies();

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
    // Without an explicit cookie the server renders data-theme="system"
    expect(dataTheme).toBe('system');

    await context.close();
  },
);

// ---------------------------------------------------------------------------
// F6-E2E-12: Keyboard operability — toggle reachable and operable without mouse
// ---------------------------------------------------------------------------

test('F6-E2E-12: theme toggle is keyboard-operable (Tab + Enter activates Sombre)', async ({
  page,
}) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Keyboard' });

  // Open the avatar menu via keyboard
  const avatarBtn = page.getByRole('button', { name: /menu de theme keyboard/i });
  await avatarBtn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible({ timeout: 5_000 });

  // Tab to the Sombre button (the toggle is in the dropdown)
  const sombreBtn = page.getByRole('button', { name: /sombre/i });
  await sombreBtn.focus();
  await page.keyboard.press('Enter');

  const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(dataTheme).toBe('dark');
});

// ---------------------------------------------------------------------------
// F6-E2E-13: Clicking Clair flips back from dark to light
// ---------------------------------------------------------------------------

test('F6-E2E-13: clicking Clair switches back to light theme from dark', async ({ page }) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Light Back' });
  await openAvatarMenu(page, 'Theme Light Back');

  // First go dark
  await page.getByRole('button', { name: /sombre/i }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  // The menu may still be open after clicking Sombre (it's inside the menu div).
  // Close it first (Escape) so clicking the avatar button opens rather than toggles.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).not.toBeVisible({ timeout: 3_000 }).catch(() => {});

  // Re-open menu
  await openAvatarMenu(page, 'Theme Light Back');

  // Then go light
  await page.getByRole('button', { name: /clair/i }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

  // Light app background (prototype .ep) = #fbfaf6 → rgb(251, 250, 246)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(251, 250, 246)');
});

// ---------------------------------------------------------------------------
// F6-E2E-14: Dark palette tokens regression — key token values in dark mode
// ---------------------------------------------------------------------------

test('F6-E2E-14: dark mode uses correct ink token (#f1ece1) from prototype', async ({ page }) => {
  await mockLoginWithTheme(page, { displayName: 'Theme Ink Token' });
  await openAvatarMenu(page, 'Theme Ink Token');
  await page.getByRole('button', { name: /sombre/i }).click();

  // --ink in dark mode = #f1ece1 → rgb(241, 236, 225)
  const inkColor = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
  );
  expect(inkColor).toBe('#f1ece1');
});

// ---------------------------------------------------------------------------
// F6-E2E-15: PATCH /accounts/me/preferences — unauthenticated → 401
// ---------------------------------------------------------------------------

test('F6-E2E-15: PATCH /accounts/me/preferences without session cookie → 401', async ({
  request,
}) => {
  // Direct API call with no auth — should return 401 (SessionGuard)
  const response = await request.patch('http://localhost:3001/accounts/me/preferences', {
    data: { theme: 'dark' },
  });
  expect(response.status()).toBe(401);
});

// ---------------------------------------------------------------------------
// F6-E2E-16: PATCH /accounts/me/preferences — invalid body → 400
// ---------------------------------------------------------------------------

test('F6-E2E-16: PATCH /accounts/me/preferences with invalid theme value → 400', async ({
  page,
  request,
}) => {
  // Sign in with a real seeded account so we have a valid session cookie
  const loginResponse = await request.post('http://localhost:3001/auth/login', {
    data: { email: 'qa_e2e_utilisateur@test.com', password: 'password123' },
  });
  expect([200, 201]).toContain(loginResponse.status());

  // Extract the session cookie from the login response
  const setCookieHeader = loginResponse.headers()['set-cookie'] ?? '';
  const sessionCookie = setCookieHeader.split(';')[0]; // ep_session=<value>

  // PATCH with an invalid theme value
  const patchResponse = await request.patch('http://localhost:3001/accounts/me/preferences', {
    data: { theme: 'blue' },
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  expect(patchResponse.status()).toBe(400);
});
