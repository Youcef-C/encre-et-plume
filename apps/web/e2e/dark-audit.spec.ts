/**
 * F-6 dark-mode visual audit — screenshots + token checks.
 * Runs against the live stack (webServer in playwright.config.ts starts it).
 * Outputs screenshots to the scratchpad directory.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const SCRATCHPAD = '/private/tmp/claude-501/-Users-youcef-Projects-encre-et-plume/2740af18-3b1d-4d22-a93f-8ebcbb1364a2/scratchpad/screenshots';

async function mockDarkLogin(page: import('@playwright/test').Page) {
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-dark-audit',
          email: 'audit@test.com',
          displayName: 'Yuki Moreau',
          role: 'utilisateur',
          verified: false,
          slug: 'yuki-moreau',
          createdAt: new Date().toISOString(),
          preferences: { theme: 'dark' },
        }),
      });
    } else {
      await route.continue();
    }
  });
  await page.route('**/auth/logout', (r) => r.fulfill({ status: 204, body: '' }));
  // Set dark cookie before navigation
  await page.context().addCookies([{ name: 'ep_theme', value: 'dark', domain: 'localhost', path: '/' }]);
}

test('dark-audit: home in dark mode — background and ink tokens correct', async ({ page }) => {
  await mockDarkLogin(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SCRATCHPAD, 'dark-home.png') });

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // dark --paper = #1d1813 → rgb(29, 24, 19)
  expect(bodyBg).toBe('rgb(29, 24, 19)');

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      paper: cs.getPropertyValue('--paper').trim(),
      ink: cs.getPropertyValue('--ink').trim(),
      card: cs.getPropertyValue('--card').trim(),
      border: cs.getPropertyValue('--border').trim(),
    };
  });
  console.log('Dark tokens on home:', JSON.stringify(tokens));
  expect(tokens.paper).toBe('#1d1813');
  expect(tokens.ink).toBe('#f1ece1');
  expect(tokens.card).toBe('#26211b');
  expect(tokens.border).toBe('#43392f');
});

test('dark-audit: avatar menu open in dark mode', async ({ page }) => {
  await mockDarkLogin(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /menu de yuki moreau/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SCRATCHPAD, 'dark-avatar-menu.png') });

  // Sombre button should be aria-pressed=true and have accent background
  const sombreBtn = page.getByRole('button', { name: /sombre/i });
  await expect(sombreBtn).toHaveAttribute('aria-pressed', 'true');
  const clairBtn = page.getByRole('button', { name: /clair/i });
  await expect(clairBtn).toHaveAttribute('aria-pressed', 'false');

  // Sombre button background should be accent red
  const sombrebg = await sombreBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  // var(--accent) = #e8261c → rgb(232, 38, 28)
  expect(sombrebg).toBe('rgb(232, 38, 28)');
});

test('dark-audit: /connexion in dark mode — no light colors bleeding', async ({ page }) => {
  await mockDarkLogin(page);
  await page.goto('/connexion');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SCRATCHPAD, 'dark-connexion.png') });

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe('rgb(29, 24, 19)');
});

test('dark-audit: /inscription in dark mode — no light colors bleeding', async ({ page }) => {
  await mockDarkLogin(page);
  await page.goto('/inscription');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SCRATCHPAD, 'dark-inscription.png') });

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe('rgb(29, 24, 19)');
});

test('dark-audit: /notifications in dark mode — data-theme="dark" + screenshot', async ({ page }) => {
  await mockDarkLogin(page);
  // Mock the API-level notification calls (port 3001), not the Next.js page (port 3000).
  // Matching on 3001 prevents the page.route from intercepting the Next.js page navigation.
  await page.route('http://localhost:3001/notifications/unread-counts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: 0, demandes: 0, signalements: 0 }),
    });
  });
  await page.route('http://localhost:3001/notifications', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      await route.continue();
    }
  });
  await page.goto('/notifications');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SCRATCHPAD, 'dark-notifications.png') });

  // Check data-theme is "dark" (SSR cookie was set)
  const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(dataTheme).toBe('dark');

  // Check --paper CSS variable is the dark value (token applied regardless of body shorthand)
  const paperToken = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
  );
  expect(paperToken).toBe('#1d1813');
});

test('dark-audit: light mode tokens on /connexion', async ({ page }) => {
  // Light mode — no cookie
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-light',
          email: 'light@test.com',
          displayName: 'Clair User',
          role: 'utilisateur',
          verified: false,
          slug: 'clair-user',
          createdAt: new Date().toISOString(),
          preferences: { theme: 'light' },
        }),
      });
    } else {
      await route.continue();
    }
  });
  await page.context().addCookies([{ name: 'ep_theme', value: 'light', domain: 'localhost', path: '/' }]);
  await page.goto('/connexion');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SCRATCHPAD, 'light-connexion.png') });

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // light --paper = #f1ece1 → rgb(241, 236, 225)
  expect(bodyBg).toBe('rgb(241, 236, 225)');
});
