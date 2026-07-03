/**
 * Theme — forced light mode (picker disabled for now).
 *
 * The full F-6 light/dark suite lives in git history; restore it when the
 * picker is re-enabled. For now the invariants are:
 *   - HTML always arrives with data-theme="light" (even with a stale dark cookie)
 *   - The avatar dropdown no longer offers a theme toggle
 */
import { test, expect, type Page } from '@playwright/test';

async function mockLogin(page: Page, displayName: string) {
  const slug = displayName.toLowerCase().replace(/\s+/g, '-');
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-theme-user',
          email: 'theme-user@test.com',
          displayName,
          role: 'utilisateur',
          verified: false,
          slug,
          createdAt: new Date().toISOString(),
          preferences: { theme: 'dark' }, // stale dark preference must be ignored
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

test('THEME-1: SSR always renders html[data-theme="light"], even with a stale dark cookie', async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([
    { name: 'ep_theme', value: 'dark', url: baseURL ?? 'http://localhost:3000' },
  ]);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('THEME-2: forced light sticks even when the account preference says dark', async ({
  page,
}) => {
  await mockLogin(page, 'Theme User');
  const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(dataTheme).toBe('light');
});

test('THEME-3: avatar dropdown no longer offers the theme toggle', async ({ page }) => {
  await mockLogin(page, 'Theme User');
  await page.getByRole('button', { name: /menu de theme user/i }).click();
  await expect(page.getByRole('menu')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('group', { name: 'Thème' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sombre/i })).toHaveCount(0);
});
