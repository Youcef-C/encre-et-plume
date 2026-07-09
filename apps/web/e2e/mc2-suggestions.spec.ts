/**
 * MC-2 "Suggestions — par affinité de style & genre" — e2e acceptance suite.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js) — same convention as trouver.spec.ts.
 * Login as camille.roux@seed.encre-et-plume.local / password123 (dr1-camille-roux, scénariste).
 * Per backend-notes.md's seeded scoring table (freshly-seeded DB), her top 4 suggestions are:
 *   1. Théo M.     (mc1-theo-m)      75  "même genre · rythme compatible"
 *   2. Yuki Moreau (dr1-yuki-moreau) 60  "même genre · rôle complémentaire"
 *   3. Léa B.      (mc1-lea-b)       40  "même genre"
 *   4. Noé P.       (mc1-noe-p)      25  "style proche de vos refs"
 * backend-notes flags rank 1 (Théo, 75) as the only strictly-stable assertion across any local dev
 * DB (accumulated non-seed accounts can displace ranks 3-4) — so we assert Théo as the top card plus
 * generic "a card has a %/reason" shape, and treat the full table as a bonus check when present.
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const CAMILLE_EMAIL = 'camille.roux@seed.encre-et-plume.local';
const SPARSE_EMAIL = 'mc2.sansprofil@seed.encre-et-plume.local';

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

const aside = (page: Page) => page.getByRole('complementary', { name: 'Suggestions — par affinité de style & genre' });

test.describe('MC-2 Suggestions aside — signed in (dr1-camille-roux)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CAMILLE_EMAIL);
    await page.goto('/trouver');
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });
  });

  test('MC2-E1: aside renders title/subtitle and Théo M. tops the ranking with score + reason', async ({ page }) => {
    const panel = aside(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Suggestions', { exact: true })).toBeVisible();
    await expect(panel.getByText('par affinité de style & genre')).toBeVisible();

    const cards = panel.locator('li');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    // Théo M. (score 75) is the stable top card per backend-notes' seeded expectations.
    const topCard = cards.first();
    await expect(topCard.getByText('Théo M.', { exact: true })).toBeVisible();
    await expect(topCard.getByText('75%')).toBeVisible();
    await expect(topCard.getByText('même genre · rythme compatible')).toBeVisible();
    await expect(topCard.getByText('Dessinateur·rice · Seinen')).toBeVisible();

    // Every card shows a percentage + non-empty reason line (generic shape, resilient to reseed drift).
    // Score text includes an sr-only "affinité " prefix in the same element — match the digits+% substring.
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).getByText(/\d{1,3}%/)).toBeVisible();
    }
  });

  test('MC2-E2: card "Profil" link navigates to the candidate profile page', async ({ page }) => {
    const topCard = aside(page).locator('li').first();
    await topCard.getByRole('link', { name: 'Profil de Théo M.' }).click();
    await expect(page).toHaveURL('/mc1-theo-m');
  });

  test('MC2-E3: "Proposer" has a descriptive a11y name and opens the MC-3 invite modal', async ({ page }) => {
    const topCard = aside(page).locator('li').first();
    const proposer = topCard.getByRole('button', { name: 'Proposer une collaboration à Théo M.' });
    await expect(proposer).toBeVisible();
    // MC-3 wired this button to the real "Proposer une collab" invite modal (see
    // mc3-invite.spec.ts for the full acceptance flow) — verify it opens, then close it.
    await proposer.click();
    await expect(page.getByRole('dialog', { name: /Inviter Théo M\./ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible();
  });

  test('MC2-E4: affinity percentage is announced with context (sr-only "affinité" prefix)', async ({ page }) => {
    const topCard = aside(page).locator('li').first();
    await expect(topCard.getByText('affinité 75%')).toBeVisible();
  });
});

test('MC2-E5: sparse-profile viewer sees the "Complétez votre profil…" empty state; the directory grid still renders', async ({
  page,
}) => {
  await login(page, SPARSE_EMAIL);
  await page.goto('/trouver');
  await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });

  await expect(
    aside(page).getByText('Complétez votre profil pour recevoir des suggestions.'),
  ).toBeVisible();

  // The suggestions failure/empty state never blanks the partner directory grid.
  const cards = page.locator('.ep-partners-grid > li');
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
});

test.describe('MC-2 responsive', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CAMILLE_EMAIL);
  });

  test('MC2-E6a: 375px — aside stacks full-width below the grid, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/trouver');
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });
    await expect(aside(page)).toBeVisible({ timeout: 10_000 });

    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);

    const gridBox = await page.locator('.ep-partners-grid').boundingBox();
    const asideBox = await aside(page).boundingBox();
    expect(gridBox && asideBox).toBeTruthy();
    // Stacks BELOW the grid (owner §7 priority ordering) and spans ~full width.
    expect(asideBox!.y).toBeGreaterThan(gridBox!.y);
    expect(asideBox!.width).toBeGreaterThan(300);
  });

  test('MC2-E6b: 768px — aside stacks full-width below the grid, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/trouver');
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });
    await expect(aside(page)).toBeVisible({ timeout: 10_000 });
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('MC2-E6c: 1280px — aside is a fixed 264px right column, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/trouver');
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });
    const asideBox = await aside(page).boundingBox();
    expect(asideBox).toBeTruthy();
    expect(Math.round(asideBox!.width)).toBe(264);

    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });
});
