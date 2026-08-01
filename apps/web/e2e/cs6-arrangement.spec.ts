/**
 * CS-6 « Réorganiser les pages » — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB, same fixture/pattern as cs7-chapter-management.spec.ts: the CS-12
 * owner creates a FRESH project per run (CS-6's routes need a Project → Work → Chapter → cards).
 *
 * Split-test convention: run this spec + the auth/nav smoke only, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
}

async function createProject(page: Page, title: string): Promise<string> {
  await page.goto('/creer');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByLabel('Titre du projet').fill(title);
  await page.getByRole('button', { name: /Configurer plus tard/ }).click();
  await expect(page).toHaveURL(/\/projet\//, { timeout: 10_000 });
  return page.url().split('/projet/')[1];
}

/** The grid tiles, in drawn order, by their « P. n » label. */
function tileLabels(page: Page) {
  return page.locator('[data-page-id] [data-page-label]').allTextContents();
}

const tile = (page: Page, label: string) =>
  page.locator('[data-page-id]').filter({ has: page.getByText(label, { exact: true }) });

test.describe.serial('CS-6 · page arrangement', () => {
  let slug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS6 Arrangement ${Date.now()}`);

    // A chapter with three cards: the CS-7 Chapitres tab is the shipped way to make both.
    await page.goto(`/projet/${slug}?tab=chapitres`);
    await page.getByRole('button', { name: '＋ Ajouter un chapitre' }).click();
    await page.getByLabel('TITRE').fill('Ch. 1 — La marée');
    await page.getByLabel('N°').fill('1');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Ch. 1 — La marée')).toBeVisible({ timeout: 8_000 });

    // The arrangement screen only REARRANGES (user decision 2026-08-01), so the cards are created
    // where creating a card lives: the Chapitres strip's dashed « Nouvelle page » tile, which needs
    // its accordion open first.
    const card = page.getByRole('listitem').filter({ hasText: 'Ch. 1 — La marée' });
    await card.getByRole('button', { name: /Ch. 1 — La marée/ }).click();
    for (let i = 0; i < 3; i++) {
      await card.getByRole('button', { name: /Nouvelle page/ }).click();
      await expect(card.locator('.ep-chapter-thumb')).toHaveCount(i + 1, { timeout: 8_000 });
    }
    await page.close();
  });

  // Entry point — proto 1303 `goArrangement`, the header button that was inert until CS-6.
  test('CS6-E1: the workspace « Réorganiser & Publier » opens the arrangement screen', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByRole('button', { name: 'Réorganiser & Publier' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/arrangement`), { timeout: 10_000 });
  });

  // F1 + D-2
  test('CS6-E2: the header replica, with « Publier ▾ » inert (its screen is CS-9)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}/arrangement`);
    await expect(page.getByRole('heading', { name: 'Réorganiser les pages' })).toBeVisible();
    await expect(page.getByText(/Ch\. 1 · 3 planches/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Aperçu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' })).toBeDisabled();
    // F7 — reading direction is set on the reader, never here.
    await expect(page.getByText(/Webtoon/i)).toHaveCount(0);
    // …and this screen rearranges only: no add, no delete, no cover control, no order buttons.
    await expect(page.getByRole('button', { name: /Ajouter/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /couverture/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Déplacer/ })).toHaveCount(0);
  });

  // F2 — the tab row, and the chapter surviving a reload through ?ch=
  test('CS6-E3: the chapter tabs switch the grid and ?ch= survives a reload', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=chapitres`);
    await page.getByRole('button', { name: '＋ Ajouter un chapitre' }).click();
    await page.getByLabel('TITRE').fill('Ch. 2 — Le port');
    await page.getByLabel('N°').fill('2');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Ch. 2 — Le port')).toBeVisible({ timeout: 8_000 });

    await page.goto(`/projet/${slug}/arrangement`);
    // D-8 — newest first, so the fresh chapter is the selected tab.
    await expect(page.getByRole('tab', { name: 'Ch. 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Aucune page')).toBeVisible();

    await page.getByRole('tab', { name: 'Ch. 1' }).click();
    await expect(page.locator('[data-page-id]')).toHaveCount(3);
    await expect(page).toHaveURL(/\?ch=/);

    await page.reload();
    await expect(page.getByRole('tab', { name: 'Ch. 1' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-page-id]')).toHaveCount(3);
  });

  // F10 — the keyboard path is the graded persistence proof (Playwright drag is flaky; both paths
  // commit through the same `commitOrder`).
  test('CS6-E4: a keyboard reorder persists across a full reload', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}/arrangement`);
    await page.getByRole('tab', { name: 'Ch. 1' }).click();
    await expect(page.locator('[data-page-id]')).toHaveCount(3);

    const before = await page.locator('[data-page-id]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-page-id')),
    );
    // The drag grip is the keyboard path — arrow keys move the focused tile.
    await page.getByRole('button', { name: 'Réorganiser P. 3' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('status')).toHaveText('Ordre enregistré', { timeout: 8_000 });

    await page.reload();
    await expect(page.locator('[data-page-id]')).toHaveCount(3, { timeout: 10_000 }); // fetched client-side
    const after = await page.locator('[data-page-id]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-page-id')),
    );
    expect(after).toEqual([before[0], before[2], before[1]]);
    expect(await tileLabels(page)).toEqual(['P. 1', 'P. 2', 'P. 3']); // dense, contiguous
  });

  // F5 — the dashed « déposer ici » gap, then a REAL drag (Playwright's HTML5 drag driver, the
  // closest thing to the author's gesture). This is the regression guard for the bug that made the
  // gesture dead: re-ordering the tiles mid-drag moved the drag source node and Chromium dropped the
  // drag session, so nothing ever committed.
  test('CS6-E5: dragging shows the insertion gap and commits the new order', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}/arrangement`);
    await page.getByRole('tab', { name: 'Ch. 1' }).click();
    await expect(page.locator('[data-page-id]')).toHaveCount(3);

    const src = page.locator('[data-page-id]').nth(2);
    const dst = page.locator('[data-page-id]').nth(0);
    const movedId = await src.getAttribute('data-page-id');
    const fillBefore = await src
      .locator('.ep-arrangement-thumb')
      .evaluate((e) => getComputedStyle(e).backgroundImage);

    // Mid-drag: the gap appears, and the tiles keep their order (only the gap marks the landing).
    await src.hover();
    await page.mouse.down();
    await dst.hover();
    await dst.hover();
    await expect(page.getByText('déposer ici')).toBeVisible();
    await expect(page.locator('[data-page-id]').nth(2)).toHaveAttribute('data-page-id', movedId!);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.reload();
    await expect(page.locator('[data-page-id]')).toHaveCount(3, { timeout: 10_000 });

    // The real gesture: drop the last page onto the first one and reload.
    await page.locator('[data-page-id]').nth(2).dragTo(page.locator('[data-page-id]').nth(0));
    await expect(page.getByRole('status')).toHaveText('Ordre enregistré', { timeout: 8_000 });
    await page.reload();
    await expect(page.locator('[data-page-id]')).toHaveCount(3, { timeout: 10_000 });
    await expect(page.locator('[data-page-id]').first()).toHaveAttribute('data-page-id', movedId!);

    // A placeholder belongs to its CARD, not to its slot: it must not change when the card moves.
    const fillAfter = await page
      .locator(`[data-page-id="${movedId}"] .ep-arrangement-thumb`)
      .evaluate((e) => getComputedStyle(e).backgroundImage);
    expect(fillAfter).toBe(fillBefore);
  });

  // The page preview is forced to a manga-page ratio, and a « double » spread is twice as wide at
  // exactly the same height (the column gap must not make it taller).
  test('CS6-E9: every preview is page-shaped, a spread is 2× wide and the same height', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}/arrangement`);
    await page.getByRole('tab', { name: 'Ch. 1' }).click();
    await expect(page.locator('[data-page-id]')).toHaveCount(3);

    const box = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('[data-page-id]')] as HTMLElement[];
      const thumb = (t: HTMLElement) => t.querySelector('.ep-arrangement-thumb')!.getBoundingClientRect();
      const single = thumb(tiles[0]);
      tiles[1].classList.add('ep-arrangement-tile--double'); // what a « double » card renders as
      const spread = thumb(tiles[1]);
      return {
        ratio: single.height / single.width,
        singleH: Math.round(single.height),
        spreadH: Math.round(spread.height),
        singleW: Math.round(single.width),
        spreadW: Math.round(spread.width),
      };
    });
    expect(box.ratio).toBeCloseTo(257 / 182, 1); // B5 manga page
    expect(box.spreadH).toBe(box.singleH);
    expect(box.spreadW).toBeGreaterThan(box.singleW * 1.9);
  });

  // F4 (as amended by the user 2026-08-01) — the cover is AUTOMATIC: whichever page sits first.
  test('CS6-E6: the « COUV. » badge follows the first slot, with no control to set it', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}/arrangement`);
    await page.getByRole('tab', { name: 'Ch. 1' }).click();
    await expect(page.locator('[data-page-id]')).toHaveCount(3);

    await expect(tile(page, 'P. 1').getByLabel('Couverture du chapitre')).toBeVisible();
    await expect(tile(page, 'P. 2').getByLabel('Couverture du chapitre')).toHaveCount(0);

    const second = await page.locator('[data-page-id]').nth(1).getAttribute('data-page-id');
    await page.getByRole('button', { name: 'Réorganiser P. 2' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('status')).toHaveText('Ordre enregistré', { timeout: 8_000 });

    await page.reload();
    await expect(page.locator('[data-page-id]')).toHaveCount(3, { timeout: 10_000 });
    await expect(page.locator('[data-page-id]').first()).toHaveAttribute('data-page-id', second!);
    await expect(tile(page, 'P. 1').getByLabel('Couverture du chapitre')).toBeVisible();
  });

  // Responsive — the prototype is the desktop replica; it must adapt down.
  test('CS6-E8: 375 / 768 / 1280 — no overflow, the grid reflows, the grip stays reachable', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}/arrangement`);
    await page.getByRole('tab', { name: 'Ch. 1' }).click();
    await expect(page.locator('[data-page-id]')).toHaveCount(3);

    const columns = () =>
      page
        .locator('.ep-arrangement-grid')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

    await page.setViewportSize({ width: 375, height: 800 });
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(await columns()).toBe(2);
    // The grip is grabbed with a finger at this width — it must be a real tap target.
    const grip = page.getByRole('button', { name: 'Réorganiser P. 2' });
    await expect(grip).toBeVisible();
    const box = (await grip.boundingBox())!;
    expect(Math.min(box.height, box.width)).toBeGreaterThanOrEqual(40);

    await page.setViewportSize({ width: 768, height: 900 });
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(await columns()).toBe(4);

    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(await columns()).toBe(6); // the prototype's grid
  });
});
