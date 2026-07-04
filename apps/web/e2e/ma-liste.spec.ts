/**
 * DR-8 "Ma liste & coups de cœur" — e2e acceptance suite.
 *
 * Hermetic: mocks /auth/me, /me/list, /me/likes, /me/list/:slug via page.route (same pattern as
 * work.spec.ts/classement.spec.ts) so the suite doesn't depend on the shared dev DB's seed data.
 * NOT run this session — for QA/CI to execute (demo account seeded unverified, see backend-notes.md).
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

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

const listItems = [
  {
    slug: 'lames-de-brume',
    title: 'Lames de Brume',
    cover: null,
    savedAt: '2026-06-01T00:00:00.000Z',
    lastChapterNumber: 1,
    page: 3,
    totalChapters: 12,
    progressPercent: 8,
  },
  {
    slug: 'onibi',
    title: 'Onibi',
    cover: null,
    savedAt: '2026-06-02T00:00:00.000Z',
    lastChapterNumber: null,
    page: null,
    totalChapters: 14,
    progressPercent: 0,
  },
];

const likeItems = [
  { slug: 'neon-sutra', title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, likedAt: '2026-06-01T00:00:00.000Z' },
];

async function mockSignedOut(page: Page) {
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, json: { statusCode: 401, message: 'Non authentifié', error: 'UNAUTHORIZED' } }),
  );
}

async function mockSignedIn(page: Page) {
  await page.route(`${API}/auth/me`, (route) => route.fulfill({ json: signedInAccount }));
  await page.route(`${API}/me/list`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: listItems });
    return route.continue();
  });
  await page.route(`${API}/me/likes`, (route) => route.fulfill({ json: likeItems }));
  await page.route(`${API}/me/list/lames-de-brume`, (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
    return route.continue();
  });
}

test.describe('Ma liste & coups de cœur', () => {
  test('signed-out visitor sees a sign-in prompt', async ({ page }) => {
    await mockSignedOut(page);
    await page.goto('/ma-liste');
    // Scope to <main>: the header also renders its own "Se connecter" link when signed out.
    await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      '/connexion?redirect=/ma-liste',
    );
  });

  test('signed-in reader sees both tabs with counts, resume bar, and can switch tabs', async ({ page }) => {
    await mockSignedIn(page);
    await page.goto('/ma-liste');

    await expect(page.getByRole('tab', { name: 'Ma liste · 2' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByText('Reprendre · Ch. 1 / 12')).toBeVisible();
    await expect(page.getByText('Pas commencé')).toBeVisible();

    await page.getByRole('tab', { name: 'Coups de cœur · 1' }).click();
    await expect(page.getByText('Néon Sutra')).toBeVisible();
  });

  test('clicking a started Ma liste card opens the reader at the saved chapter/page', async ({ page }) => {
    await mockSignedIn(page);
    await page.goto('/ma-liste');
    await page.getByRole('link', { name: /Lames de Brume/ }).click();
    await expect(page).toHaveURL('/lecteur/lames-de-brume?chapitre=1&page=3');
  });

  test('removing a Ma liste item decrements the tab count and stays removed after the undo window', async ({ page }) => {
    await mockSignedIn(page);
    await page.goto('/ma-liste');
    await expect(page.getByRole('tab', { name: 'Ma liste · 2' })).toBeVisible();

    await page.getByRole('button', { name: 'Retirer de ma liste' }).first().click();
    await expect(page.getByRole('tab', { name: 'Ma liste · 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();

    await page.waitForTimeout(5200);
    await expect(page.getByRole('tab', { name: 'Ma liste · 1' })).toBeVisible();
    await expect(page.getByText('Lames de Brume')).toHaveCount(0);
  });

  test('375px viewport has no horizontal overflow', async ({ page }) => {
    await mockSignedIn(page);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/ma-liste');
    await expect(page.getByRole('tab', { name: 'Ma liste · 2' })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });
});
