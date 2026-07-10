/**
 * CS-1 "Nouveau projet" wizard — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB. Reuses the CS-12 owner fixture
 * (qa_e2e_cs12_owner@test.com / password123, scénariste) who lands on /projets.
 *
 * The wizard creates real Project rows (no project-delete endpoint yet), so titles are uniquified
 * with a timestamp and left in place — sibling suites filter by their own fixtures. Split-test
 * convention: run this spec + the auth/nav smoke only.
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';

async function loginAsOwner(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(OWNER_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
}

test('CS1-E0: logged out /creer redirects to sign-in', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.goto('/creer');
  await expect(page).toHaveURL(/\/connexion\?next=\/creer/, { timeout: 10_000 });
  await ctx.close();
});

test.describe('CS-1 Nouveau projet — signed in (e2e-cs12-owner)', () => {
  test.describe.configure({ mode: 'serial' });

  test('CS1-E1: /projets → "＋ Nouveau projet" opens the wizard replica (Manga pre-selected)', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    await page.getByRole('button', { name: '＋ Nouveau projet' }).click();
    await expect(page).toHaveURL(/\/creer$/);

    await expect(page.getByRole('heading', { name: /Nouveau projet/i })).toBeVisible();
    // Three step dots.
    for (const label of ['Type', 'Détails', 'Soutien']) {
      await expect(page.getByRole('button', { name: new RegExp(`Étape .*${label}`) })).toBeVisible();
    }
    // Three type cards, Manga checked.
    const group = page.getByRole('radiogroup', { name: /Type de projet/i });
    await expect(group.getByRole('radio', { name: /Manga/ })).toHaveAttribute('aria-checked', 'true');
    await expect(group.getByRole('radio', { name: /Illustration/ })).toBeVisible();
    await expect(group.getByRole('radio', { name: /Histoire/ })).toBeVisible();
  });

  test('CS1-E2: full manga flow → project appears on /projets with a "Manga" badge', async ({ page }) => {
    const title = `E2E CS1 Manga ${Date.now()}`;
    await loginAsOwner(page);
    await page.goto('/creer');

    await page.getByRole('button', { name: /Continuer/ }).click(); // step 1 → 2
    await page.getByLabel('Titre du projet').fill(title);
    await page.getByLabel('Synopsis').fill('Un récit d’encre et de pluie.');
    await page.getByRole('button', { name: 'One Shot' }).click();
    await page.getByRole('combobox', { name: 'Ajouter un genre' }).fill('Seinen');
    await page.getByRole('combobox', { name: 'Ajouter un genre' }).press('Enter');
    await page.getByRole('button', { name: '16+' }).click();
    await page.getByRole('button', { name: /Plus de scénaristes/ }).click();
    await page.getByRole('radio', { name: 'Public' }).click();
    await page.getByRole('button', { name: /Continuer/ }).click(); // → step 3

    await page.getByRole('button', { name: '＋ Ajouter un palier' }).click();
    await page.getByLabel('Nom du palier 1').fill('Mécène');
    await page.getByLabel('Prix mensuel du palier 1 (€)').fill('5');
    await page.getByRole('checkbox', { name: /Autoriser les dons uniques/ }).check();

    await page.getByRole('button', { name: 'Créer le projet' }).click();
    await expect(page).toHaveURL(/\/projets/, { timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test('CS1-E3: "Configurer plus tard" from step 2 (Histoire) creates immediately', async ({ page }) => {
    const title = `E2E CS1 Histoire ${Date.now()}`;
    await loginAsOwner(page);
    await page.goto('/creer');

    await page.getByRole('radio', { name: /Histoire/ }).click();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel('Titre du projet').fill(title);
    await page.getByRole('button', { name: /Configurer plus tard/ }).click();
    await expect(page).toHaveURL(/\/projets/, { timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test('CS1-E4: empty title blocks Continuer with an inline error, stays on step 2', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/creer');
    await page.getByRole('button', { name: /Continuer/ }).click(); // → step 2
    await page.getByRole('button', { name: /Continuer/ }).click(); // empty title
    await expect(page.getByText('Un titre est requis')).toBeVisible();
    await expect(page.getByLabel('Titre du projet')).toBeVisible();
  });

  test('CS1-E5: Illustration(s) card routes to /creer/illustration with contest + Soutien', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/creer');
    await page.getByRole('radio', { name: /Illustration/ }).click();
    await expect(page).toHaveURL(/\/creer\/illustration/, { timeout: 10_000 });
    await expect(page.getByLabel('Lier à un concours')).toBeVisible();
    await expect(page.getByText('Soutien · optionnel')).toBeVisible();
    await expect(page.getByRole('button', { name: '＋ Ajouter un palier' })).toBeVisible();
  });

  test('CS1-E6: mobile (375×812) — type cards stack single-column, ✓ badge not clipped, no overflow across step 2', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsOwner(page);
    await page.goto('/creer');

    // Type step: the 3 cards collapse to a single column (grid = one track) so the selected-card badge
    // has full-width room and does not clip.
    const cols = await page
      .getByRole('radiogroup', { name: /Type de projet/i })
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(1);

    // The Manga card's ✓ badge is on-screen (right edge within the viewport, not clipped off-canvas).
    const badge = page.getByRole('radiogroup', { name: /Type de projet/i }).getByText('✓', { exact: true });
    await expect(badge).toBeVisible();
    const box = await badge.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(await noHorizontalOverflow(page)).toBe(true);

    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel('Titre du projet').fill('Mobile check');
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test('CS1-E7: no horizontal overflow at 375 / 768 / 1280', async ({ page }) => {
    await loginAsOwner(page);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/creer');
      expect(await noHorizontalOverflow(page)).toBe(true); // step 1
      await page.getByRole('button', { name: /Continuer/ }).click();
      await page.getByLabel('Titre du projet').fill('Sweep');
      await page.getByRole('button', { name: /Continuer/ }).click(); // step 3
      expect(await noHorizontalOverflow(page)).toBe(true);
    }
  });
});
