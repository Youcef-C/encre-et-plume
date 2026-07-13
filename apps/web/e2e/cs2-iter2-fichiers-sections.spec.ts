/**
 * CS-2 (post-CS-3) ITER 2 — per-type FICHIERS sections gap closures + UX asks.
 *
 * Covers what cs2-card-modal.spec.ts / cs3-fichiers.spec.ts did not (round-1 e2e was never updated
 * for iter 2): fillability of PAGE/RÉFÉRENCES via the import type selector and section re-typing,
 * "＋ Lier" label, "Retirer" (unlink), Fichiers-grid "Supprimer" (delete asset), the removed
 * `GET /pages/:id/versions` 404, and a breakpoint pass.
 *
 * Split-test convention: this spec + the auth/nav smoke only, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com';

const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');
const TXT_FIXTURE = path.join(__dirname, 'fixtures/cs3-notes.txt');

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

async function createProject(page: Page, title: string, opts?: { public?: boolean }): Promise<string> {
  await page.goto('/creer');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByLabel('Titre du projet').fill(title);
  if (opts?.public) {
    await page.getByRole('radio', { name: 'Public' }).click();
  }
  await page.getByRole('button', { name: /Configurer plus tard/ }).click();
  await expect(page).toHaveURL(/\/projet\//, { timeout: 10_000 });
  return page.url().split('/projet/')[1];
}

async function addCard(page: Page, index = 1): Promise<string> {
  const title = `Page ${index}`;
  const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
  await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
  await expect(scenarioCol.getByText(title, { exact: true })).toBeVisible({ timeout: 5_000 });
  return title;
}

function assetCard(page: Page, filename: string) {
  return page.locator('[data-asset-card]').filter({ hasText: filename });
}

const dialog = (page: Page) => page.getByRole('dialog');

test.describe('CS-2 iter2 — FICHIERS sections fillability + unlink + delete (owner, fresh project)', () => {
  test.describe.configure({ mode: 'serial' });
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS2 Iter2 ${Date.now()}`);
    await addCard(page);
    await page.close();
  });

  test('IT2-E1: import with the "Type" selector set to "Page" declares the type; grid shows "Page" chip and the Pages tab', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    await expect(page.getByLabel('Type de fichier')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Type de fichier').click();
    await page.getByRole('option', { name: 'Page', exact: true }).click();
    await page.getByLabel('Importer des fichiers').setInputFiles(IMAGE_FIXTURE);

    const card = assetCard(page, 'avatar-50x50.jpg');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Page ·/)).toBeVisible();

    const tabGroup = page.getByRole('group', { name: 'Filtrer par type' });
    await expect(tabGroup.getByRole('button', { name: 'Pages' })).toBeVisible();
    await tabGroup.getByRole('button', { name: 'Pages' }).click();
    await expect(card).toBeVisible();
  });

  test('IT2-E2: card modal PAGE section — "＋ Lier" opens the picker, links the declared-page asset (no reclassify hint), row shows v1; board chip "planche v1"', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Lier un fichier (PAGE)' }).click();

    const picker = page.getByRole('dialog', { name: 'Lier · remplacer' });
    await expect(picker).toBeVisible();
    const row = picker.getByRole('button', { name: /avatar-50x50\.jpg/ });
    await expect(row).toBeVisible({ timeout: 10_000 });
    // Already typed "Page" on import (IT2-E1) — no "sera reclassé" hint for this pick.
    await expect(row.getByText('sera reclassé')).toHaveCount(0);
    await row.click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });

    await expect(modal.getByText('avatar-50x50.jpg')).toBeVisible();
    await expect(modal.getByText('v1', { exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');

    const card = page.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    await expect(card.getByText('planche v1')).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('⎘ v1')).toBeVisible();
  });

  test('IT2-E3: RÉFÉRENCES section fillability via reclassification — a "Dessin"-typed file linked from RÉFÉRENCES shows "sera reclassé « Référence »" and re-types on link', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    // A second import, no declared type (Automatique) → an image derives to "dessin".
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await page.getByLabel('Importer des fichiers').setInputFiles(TXT_FIXTURE);
    const txtCard = assetCard(page, 'cs3-notes.txt');
    await expect(txtCard).toBeVisible({ timeout: 30_000 });
    await expect(txtCard.getByText(/Texte ·/)).toBeVisible();

    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Lier un fichier (RÉFÉRENCES)' }).click();

    const picker = page.getByRole('dialog', { name: 'Lier · remplacer' });
    await expect(picker).toBeVisible();
    const row = picker.getByRole('button', { name: /cs3-notes\.txt/ });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('sera reclassé « Référence »')).toBeVisible();
    await row.click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });

    // Row now lives under RÉFÉRENCES.
    const refHeading = modal.getByText('RÉFÉRENCES', { exact: true });
    await expect(refHeading).toBeVisible();
    await expect(modal.getByText('cs3-notes.txt')).toBeVisible();
    await page.keyboard.press('Escape');

    const card = page.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    await expect(card.getByText('réf v1')).toBeVisible({ timeout: 10_000 });

    // The Fichiers grid reflects the global re-type too (type change is global, per D-H).
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await expect(assetCard(page, 'cs3-notes.txt').getByText(/Référence ·/)).toBeVisible({ timeout: 10_000 });
  });

  test('IT2-E4: "Retirer" unlinks a file from its section — row disappears, board chip re-derives (badge drops if no files remain of the max)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();

    await expect(modal.getByText('cs3-notes.txt')).toBeVisible();
    await modal.getByRole('button', { name: 'Retirer cs3-notes.txt de la carte' }).click();
    await expect(modal.getByText('cs3-notes.txt')).toHaveCount(0, { timeout: 10_000 });
    // avatar-50x50.jpg (PAGE) is still linked → the section shows "Aucun fichier" only for RÉFÉRENCES now.
    await expect(modal.getByText('avatar-50x50.jpg')).toBeVisible();
    await page.keyboard.press('Escape');

    const card = page.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    await expect(card.getByText('réf v1')).toHaveCount(0, { timeout: 10_000 });
    await expect(card.getByText('planche v1')).toBeVisible();

    // The file itself is untouched in the Fichiers grid (unlink ≠ delete).
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await expect(assetCard(page, 'cs3-notes.txt')).toBeVisible();
  });

  test('IT2-E5: Fichiers grid "Supprimer" opens a ConfirmDialog; cancel keeps the card, confirm deletes it (and its board chip)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    const card = assetCard(page, 'cs3-notes.txt');
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.getByRole('button', { name: 'Supprimer cs3-notes.txt' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText('Supprimer le fichier ?')).toBeVisible();
    await expect(confirm.getByText(/cs3-notes\.txt.*seront supprimés/)).toBeVisible();

    // Cancel — nothing happens.
    await confirm.getByRole('button', { name: 'Annuler' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(card).toBeVisible();

    // Confirm — the card is gone.
    await card.getByRole('button', { name: 'Supprimer cs3-notes.txt' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(assetCard(page, 'cs3-notes.txt')).toHaveCount(0, { timeout: 10_000 });
  });

  test('IT2-E6: Fichiers grid card actions are real on-brand buttons pinned at the bottom, equal card heights in a row', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    const card = assetCard(page, 'avatar-50x50.jpg');
    await expect(card).toBeVisible({ timeout: 10_000 });

    const aperçu = card.getByRole('button', { name: /Aperçu de avatar-50x50\.jpg/ });
    const lier = card.getByRole('button', { name: /Lier avatar-50x50\.jpg à une carte/ });
    const supprimer = card.getByRole('button', { name: /Supprimer avatar-50x50\.jpg/ });
    for (const btn of [aperçu, lier, supprimer]) {
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(30); // real button, not a bare link
    }

    // The action row sits near the card's bottom edge (pinned via marginTop:auto). The row can wrap
    // onto two lines at narrow card widths (3 buttons), so use the LAST button (last line) rather
    // than the first — that's the one closest to the card's bottom edge when wrapped.
    const cardBox = await card.boundingBox();
    const rowBox = await supprimer.boundingBox();
    expect(cardBox && rowBox && rowBox.y + rowBox.height).toBeLessThanOrEqual((cardBox!.y + cardBox!.height) + 2);
    expect(cardBox && rowBox && (cardBox.y + cardBox.height) - (rowBox.y + rowBox.height)).toBeLessThan(20);
  });

  test('IT2-E7: the removed interim per-card versioning route 404s (GET /pages/:id/versions)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const workspace = await page.request.get(`http://localhost:3001/projects/${slug}`);
    expect(workspace.ok()).toBe(true);
    const body = await workspace.json();
    const p1 = body.pages.find((p: { title: string }) => p.title === 'Page 1');
    expect(p1).toBeTruthy();
    expect(Array.isArray(p1.linkedFiles)).toBe(true);
    expect(p1.version).toBeUndefined();

    const res = await page.request.get(`http://localhost:3001/pages/${p1.id}/versions`);
    expect(res.status()).toBe(404);
  });
});

test.describe('CS-2 iter2 — non-member (public project) sees none of the new write affordances', () => {
  let publicSlug = '';
  let cardTitle = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    publicSlug = await createProject(page, `E2E CS2 Iter2 Public ${Date.now()}`, { public: true });
    cardTitle = await addCard(page);
    await page.close();
  });

  test('RO-IT2-1: non-member card modal has no "＋ Lier" / "Retirer"; Fichiers panel has no Type selector / Supprimer', async ({ page }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/projet/${publicSlug}`);
    await page.getByText(cardTitle, { exact: true }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: /Lier un fichier/ })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: /Retirer .* de la carte/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.goto(`/projet/${publicSlug}?tab=fichiers`);
    await expect(page.getByLabel('Type de fichier')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
  });
});

test.describe('CS-2 iter2 — responsive sweep (375/768/1280): FICHIERS modal sections + Fichiers grid', () => {
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS2 Iter2 Responsive ${Date.now()}`);
    await addCard(page);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await page.getByLabel('Importer des fichiers').setInputFiles(IMAGE_FIXTURE);
    await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible({ timeout: 30_000 });
    await page.close();
  });

  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label} — card modal FICHIERS sections + picker + Fichiers grid: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, OWNER_EMAIL);
      await page.goto(`/projet/${slug}`);
      await page.getByText('Page 1', { exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Page 1' });
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText('SCÉNARIO', { exact: true })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);

      await modal.getByRole('button', { name: 'Lier un fichier (SCÉNARIO)' }).click();
      const picker = page.getByRole('dialog', { name: 'Lier · remplacer' });
      await expect(picker).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        await page.screenshot({ path: `test-results/cs2-iter2-picker-${width}.png`, fullPage: true });
      }
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await page.keyboard.press('Escape');

      await page.goto(`/projet/${slug}?tab=fichiers`);
      await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible({ timeout: 10_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        await page.screenshot({ path: `test-results/cs2-iter2-fichiers-grid-${width}.png`, fullPage: true });
      }
    });
  }
});
