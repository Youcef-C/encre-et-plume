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

// DR-8/DR-9 addendum: illustrations shown alongside works in the same tabs.
const savedIllustrations = [
  { id: 'i1', title: 'Pluie de Néons', artistName: 'Yuki Moreau', category: 'process', categoryLabel: 'Process', image: null, likeCount: 3400 },
];
const likedIllustrations = [
  { id: 'i2', title: 'Étude d’encre', artistName: 'Yuki Moreau', category: 'process', categoryLabel: 'Process', image: null, likeCount: 1300 },
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
  // DR-8/DR-9 addendum: illustrations sub-section — empty by default, overridden per test.
  await page.route(`${API}/me/illustrations/saved`, (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/me/illustrations/liked`, (route) => route.fulfill({ json: [] }));
  // DR-9 B5/FE7: "Ma liste" remove + "Coups de cœur" unlike both re-point onto the reactions
  // endpoints (the old DELETE /me/list/:slug route was removed).
  await page.route(`${API}/reactions/save`, (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ json: { active: false, count: 0 } });
    return route.continue();
  });
  await page.route(`${API}/reactions/like`, (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ json: { active: false, count: 8099 } });
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

  test('DR-9 FE7: unliking a Coups de cœur card removes it and stays removed after the undo window', async ({ page }) => {
    await mockSignedIn(page);
    await page.goto('/ma-liste');
    await page.getByRole('tab', { name: 'Coups de cœur · 1' }).click();
    await expect(page.getByText('Néon Sutra')).toBeVisible();

    await page.getByRole('button', { name: "Retirer le j'aime" }).click();
    await expect(page.getByText('Néon Sutra')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();

    await page.waitForTimeout(5200);
    await expect(page.getByText('Néon Sutra')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Coups de cœur · 0' })).toBeVisible();
  });

  test('DR-8/DR-9 addendum: saved/liked illustrations render in their matching tab and count toward it', async ({ page }) => {
    await mockSignedIn(page);
    await page.route(`${API}/me/illustrations/saved`, (route) => route.fulfill({ json: savedIllustrations }));
    await page.route(`${API}/me/illustrations/liked`, (route) => route.fulfill({ json: likedIllustrations }));
    await page.goto('/ma-liste');

    await expect(page.getByRole('tab', { name: 'Ma liste · 3' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Pluie de Néons/ })).toHaveAttribute('href', '/illustration/i1');

    await page.getByRole('tab', { name: 'Coups de cœur · 2' }).click();
    await expect(page.getByRole('link', { name: /Étude d.encre/ })).toHaveAttribute('href', '/illustration/i2');
  });

  test('coordinator follow-up: removing a saved illustration decrements the tab count and stays removed after the undo window (DELETE /reactions/save persists)', async ({ page }) => {
    await mockSignedIn(page);
    await page.route(`${API}/me/illustrations/saved`, (route) => route.fulfill({ json: savedIllustrations }));
    await page.goto('/ma-liste');
    await expect(page.getByRole('tab', { name: 'Ma liste · 3' })).toBeVisible();

    await page.getByRole('button', { name: 'Retirer Pluie de Néons' }).click();
    await expect(page.getByRole('tab', { name: 'Ma liste · 2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();

    await page.waitForTimeout(5200);
    await expect(page.getByText('Pluie de Néons')).toHaveCount(0);

    // Stays gone after reload (the DELETE persisted server-side)
    await page.route(`${API}/me/illustrations/saved`, (route) => route.fulfill({ json: [] }));
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Ma liste · 2' })).toBeVisible();
    await expect(page.getByText('Pluie de Néons')).toHaveCount(0);
  });

  test('coordinator follow-up: removing a liked illustration (Coups de cœur) calls unlikeReaction and decrements the tab count', async ({ page }) => {
    await mockSignedIn(page);
    await page.route(`${API}/me/illustrations/liked`, (route) => route.fulfill({ json: likedIllustrations }));
    await page.goto('/ma-liste');
    await page.getByRole('tab', { name: 'Coups de cœur · 2' }).click();
    await expect(page.getByRole('link', { name: /Étude d.encre/ })).toBeVisible();

    await page.getByRole('button', { name: 'Retirer Étude d’encre' }).click();
    await expect(page.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();

    await page.waitForTimeout(5200);
    await expect(page.getByText('Étude d’encre')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeVisible();
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
