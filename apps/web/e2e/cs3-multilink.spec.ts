/**
 * CS-3 delta — "Multi-card linking" (story, Backend, 2026-07-14) — scoped e2e acceptance suite.
 *
 * A `scenario`/`texte`/`ref` asset may be linked to MULTIPLE page cards (add, idempotent); a
 * `dessin`/`page` asset stays single-card (re-link replaces). Covers: multi-link add (A1/A4),
 * per-card unlink (A5), delete removes ALL links (A7), Fichiers-grid "Liée à N cartes" (A8),
 * add-vs-replace picker UI copy incl. the disabled "déjà liée à cette carte" row (F2/F3), and a
 * single-type replace re-verification (A2, non-regression).
 *
 * Reuses the CS-12 seeded owner account (see cs3-fichiers.spec.ts's header note / e2e-seed.js).
 * Split-test convention: this spec + the auth/nav smoke only, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';

const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');
const SCENARIO_TXT_FIXTURE = path.join(__dirname, 'fixtures/cs3-scenario-brief.txt');

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

async function addCard(page: Page, index: number): Promise<string> {
  const title = `Page ${index}`;
  const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
  await ensureChapter(page);
  await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
  await expect(scenarioCol.getByText(title, { exact: true })).toBeVisible({ timeout: 5_000 });
  return title;
}

function assetCard(page: Page, filename: string) {
  return page.locator('[data-asset-card]').filter({ hasText: filename });
}

function kanbanCard(page: Page, title: string) {
  return page.locator('div[draggable="true"]').filter({ hasText: title });
}

// Closing a nested dialog (the link picker) leaves focus outside the CardModal panel, so a bare
// `Escape` keypress doesn't reach the modal's own key handler afterwards — click its explicit
// "Fermer" button instead whenever the test keeps interacting on the same page.
async function closeCardModal(modal: ReturnType<Page['getByRole']>) {
  await modal.getByRole('button', { name: 'Fermer' }).click();
  await expect(modal).toHaveCount(0, { timeout: 10_000 });
}

/**
 * R2-1: a card needs a chapter first. On a chapterless board the R2-3 empty state REPLACES the board
 * (no chip row at all), so the only affordance is its « Créer un chapitre » CTA. Wait for whichever
 * of the two renders before deciding — the board is fetched client-side, and checking too early used
 * to fall through to a chip that does not exist.
 */
async function ensureChapter(page: Page) {
  const add = page.getByRole('button', { name: '＋ Ajouter une carte' }).first();
  const cta = page.getByRole('button', { name: 'Créer un chapitre' });
  await expect(add.or(cta).first()).toBeVisible({ timeout: 15_000 });
  if (await add.isVisible().catch(() => false)) return;
  await cta.click();
  await expect(add).toBeVisible({ timeout: 8_000 });
}

test.describe('CS-3 multi-link — signed in (e2e-cs12-owner)', () => {
  test.describe.configure({ mode: 'serial' });

  let slug = '';
  const title = `E2E CS3 Multilink ${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, title);
    await addCard(page, 1);
    await addCard(page, 2);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await page.getByLabel('Importer des fichiers').setInputFiles([SCENARIO_TXT_FIXTURE, IMAGE_FIXTURE]);
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toBeVisible({ timeout: 30_000 });
    await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible({ timeout: 30_000 });
    await page.close();
  });

  test('ML-1: SCÉNARIO section "＋ Lier" opens a "Lier · ajouter" picker; linking to Page 1 attaches it (N1)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Lier un fichier (SCÉNARIO)' }).click();
    const picker = page.getByRole('dialog', { name: 'Lier · ajouter' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: /cs3-scenario-brief\.txt/ }).click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });

    await expect(modal.getByText('cs3-scenario-brief.txt')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(kanbanCard(page, 'Page 1').getByText('scénario')).toBeVisible({ timeout: 10_000 });
  });

  test('ML-2: linking the SAME asset to Page 2 ADDS a link — hint "sera aussi liée ici"; Page 1 keeps it (A1/A4/A6/N3)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 2', { exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Page 2' });
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Lier un fichier (SCÉNARIO)' }).click();
    const picker = page.getByRole('dialog', { name: 'Lier · ajouter' });
    await expect(picker).toBeVisible();
    const row = picker.getByRole('button', { name: /cs3-scenario-brief\.txt/ });
    await expect(row.getByText('liée à « Page 1 » — sera aussi liée ici')).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });

    await expect(modal.getByText('cs3-scenario-brief.txt')).toBeVisible();
    await closeCardModal(modal);

    // BOTH cards carry the chip now — the link was added, not moved (this is the core A1/A6 assertion:
    // the old single-link "replace" rule would have left Page 1 without the chip).
    await expect(kanbanCard(page, 'Page 1').getByText('scénario')).toBeVisible({ timeout: 10_000 });
    await expect(kanbanCard(page, 'Page 2').getByText('scénario')).toBeVisible({ timeout: 10_000 });

    // Page 1's modal still shows the file too (didn't get silently unlinked).
    await page.getByText('Page 1', { exact: true }).click();
    const modal1 = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal1).toBeVisible();
    await expect(modal1.getByText('cs3-scenario-brief.txt')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('ML-3: re-opening Page 2\'s picker shows the asset as "déjà liée à cette carte", row disabled (no-op guard)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 2', { exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Page 2' });
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Lier un fichier (SCÉNARIO)' }).click();
    const picker = page.getByRole('dialog', { name: 'Lier · ajouter' });
    await expect(picker).toBeVisible();
    const row = picker.getByRole('button', { name: /cs3-scenario-brief\.txt/ });
    await expect(row.getByText('déjà liée à cette carte')).toBeVisible({ timeout: 10_000 });
    await expect(row).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  test('ML-4: Fichiers grid shows "Liée à 2 cartes" (A8)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    const chip = assetCard(page, 'cs3-scenario-brief.txt').getByText('Liée à 2 cartes');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toHaveAttribute('title', /Page 1.*Page 2|Page 2.*Page 1/);
  });

  // ML-5 ("Retirer" per-card unlink) is deliberately NOT here — see the isolated describe block
  // below: the server-side unlink/derivation is correct (A5 IS met, confirmed via a full reload),
  // but the CardModal's own optimistic client patch has a confirmed staleness bug (see qa-report.md),
  // so it's kept out of this serial chain per the repo's established pattern (cs3-fichiers.spec.ts's
  // isolated ".docx import" block) so one known, unfixed FE bug doesn't cascade-skip ML-6/ML-7.

  test('ML-6: single-type (dessin) re-link still REPLACES — byte-identical to pre-multilink behavior (A2, non-regression)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    let modal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Lier un fichier (DESSIN)' }).click();
    let picker = page.getByRole('dialog', { name: 'Lier · remplacer' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: /avatar-50x50\.jpg/ }).click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });
    await closeCardModal(modal);
    await expect(kanbanCard(page, 'Page 1').getByText('dessin')).toBeVisible({ timeout: 10_000 });

    await page.getByText('Page 2', { exact: true }).click();
    modal = page.getByRole('dialog', { name: 'Page 2' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Lier un fichier (DESSIN)' }).click();
    picker = page.getByRole('dialog', { name: 'Lier · remplacer' });
    await expect(picker).toBeVisible();
    const row = picker.getByRole('button', { name: /avatar-50x50\.jpg/ });
    await expect(row.getByText('liée à « Page 1 » — sera re-liée')).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });
    await closeCardModal(modal);

    // Replaced, not added: Page 1 loses the "dessin" chip, Page 2 gains it. A reload reads the
    // durable, server-derived truth — the board has no live cross-card sync for a card that isn't
    // the currently-open modal (pre-existing characteristic, not a multi-link regression: the
    // original CS-3 e2e coverage always navigated between link steps for the same reason).
    await page.goto(`/projet/${slug}`);
    await expect(kanbanCard(page, 'Page 1').getByText('dessin')).toHaveCount(0, { timeout: 10_000 });
    await expect(kanbanCard(page, 'Page 2').getByText('dessin')).toBeVisible();
  });

  test('ML-7: deleting the shared asset (still linked to both Page 1 + Page 2 since ML-4) removes it + ALL its links (A7) — both cards\' chips clear', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await assetCard(page, 'cs3-scenario-brief.txt').getByRole('button', { name: 'Supprimer cs3-scenario-brief.txt' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toHaveCount(0, { timeout: 10_000 });

    // A full navigation (not a live optimistic patch) — the durable, server-derived truth.
    await page.goto(`/projet/${slug}`);
    await expect(kanbanCard(page, 'Page 1').getByText(/scénario v\d/)).toHaveCount(0, { timeout: 10_000 });
    await expect(kanbanCard(page, 'Page 2').getByText(/scénario v\d/)).toHaveCount(0);
  });
});

// ML-5 — per-card unlink (A5). Isolated on purpose (own project, no shared state with the serial
// chain above): the DELETE /assets/:id/link?pageId=… endpoint and the server-side fileTags-prune
// derivation are correct (confirmed below via a full page reload, which is the durable/server truth
// a real user sees on next navigation) — but CardModal's own OPTIMISTIC client patch
// (`unlinkAsset` → `applyAssets`, apps/web/components/projet/CardModal.tsx) only updates
// `linkedFiles`/`linkedFileIds` and never prunes the stale `fileTags` entry, so the kanban card
// transiently shows a stray bare "scénario" tag (not the correct "scénario vN" chip — that one IS
// gone) until the page is reloaded. Confirmed root cause + a dedicated reproduction below; see
// qa-report.md. This test documents the CORRECT (server-truth) behavior and is expected to go green
// once a dev agent makes the optimistic patch also prune covered fileTags (or refetches page detail
// after unlink instead of a purely local patch).
test.describe('CS-3 multi-link — ML-5 per-card unlink (isolated; optimistic fileTags prune verified)', () => {
  test.describe.configure({ mode: 'serial' });
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS3 ML5 Unlink ${Date.now()}`);
    await addCard(page, 1);
    await addCard(page, 2);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await page.getByLabel('Importer des fichiers').setInputFiles(SCENARIO_TXT_FIXTURE);
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toBeVisible({ timeout: 30_000 });
    // Link to both cards via the Fichiers-grid picker. Multi-linking QOL: the picker STAYS OPEN, so
    // both links are added from a single session — each row toggles to aria-pressed, then Terminé.
    await assetCard(page, 'cs3-scenario-brief.txt').getByRole('button', { name: /Lier cs3-scenario-brief\.txt à une carte/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const cardTitle of ['Page 1', 'Page 2']) {
      await dialog.getByRole('button', { name: new RegExp(cardTitle) }).click();
      await expect(dialog.getByRole('button', { name: new RegExp(cardTitle) })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    }
    await dialog.getByRole('button', { name: 'Terminé' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await page.close();
  });

  test('ML-5: "Retirer" on Page 1 unlinks ONLY Page 1 — Page 2 keeps the file (A5, server-truth via reload); grid chip drops to single-card', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Retirer cs3-scenario-brief.txt de la carte' }).click();
    await expect(modal.getByText('cs3-scenario-brief.txt')).toHaveCount(0, { timeout: 10_000 });
    await closeCardModal(modal);

    // Reload to read the durable, server-derived truth (sidesteps the known client-side staleness bug).
    await page.goto(`/projet/${slug}`);
    await expect(kanbanCard(page, 'Page 1').getByText('scénario')).toHaveCount(0, { timeout: 10_000 });
    await expect(kanbanCard(page, 'Page 2').getByText(/scénario v\d/)).toBeVisible();

    await page.goto(`/projet/${slug}?tab=fichiers`);
    const card = assetCard(page, 'cs3-scenario-brief.txt');
    await expect(card.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText(/Liée à \d+ cartes/)).toHaveCount(0);
  });

  test('ML-5b: immediately after "Retirer" — BEFORE any reload — Page 1 shows NO stray "scénario" tag (fileTags pruned client-side, mirroring the server)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    // Fresh setup — link scénario to Page 1 alone this time, then unlink it, and inspect the LIVE
    // (unreloaded) DOM straight after, without navigating away.
    const slug2 = await createProject(page, `E2E CS3 ML5bug ${Date.now()}`);
    await addCard(page, 1);
    await page.goto(`/projet/${slug2}?tab=fichiers`);
    await page.getByLabel('Importer des fichiers').setInputFiles(SCENARIO_TXT_FIXTURE);
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toBeVisible({ timeout: 30_000 });

    await page.goto(`/projet/${slug2}`);
    await page.getByText('Page 1', { exact: true }).click();
    let modal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Lier un fichier (SCÉNARIO)' }).click();
    const picker = page.getByRole('dialog', { name: 'Lier · ajouter' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: /cs3-scenario-brief\.txt/ }).click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });
    await closeCardModal(modal);
    await expect(kanbanCard(page, 'Page 1').getByText(/scénario v\d/)).toBeVisible({ timeout: 10_000 });

    await page.getByText('Page 1', { exact: true }).click();
    modal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Retirer cs3-scenario-brief.txt de la carte' }).click();
    await expect(modal.getByText('cs3-scenario-brief.txt')).toHaveCount(0, { timeout: 10_000 });
    await closeCardModal(modal);

    // Fixed (no reload here): the versioned linked-file chip is gone AND the bare "scénario" tag is
    // pruned client-side (the optimistic patch mirrors the server's fileTags-prune).
    await expect(kanbanCard(page, 'Page 1').getByText(/scénario v\d/)).toHaveCount(0);
    await expect(kanbanCard(page, 'Page 1').getByText('scénario', { exact: true })).toHaveCount(0, { timeout: 5_000 });
  });
});

test.describe('CS-3 multi-link — responsive sweep (375/768/1280)', () => {
  // A fresh project per width (not a shared beforeAll) — each iteration performs the SAME stateful
  // link sequence (unlinked → linked-to-both), so sharing one project across widths would leave the
  // 2nd/3rd iteration re-running against an already-fully-linked asset (the picker row would then be
  // the disabled "déjà liée à cette carte" state, not the "sera aussi liée ici" one being exercised).
  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label} — SCÉNARIO section "Lier · ajouter" picker + grid "Liée à N cartes" chip: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, OWNER_EMAIL);
      const slug = await createProject(page, `E2E CS3 Multilink Responsive ${label} ${Date.now()}`);
      await addCard(page, 1);
      await addCard(page, 2);
      await page.goto(`/projet/${slug}?tab=fichiers`);
      await page.getByLabel('Importer des fichiers').setInputFiles(SCENARIO_TXT_FIXTURE);
      await expect(assetCard(page, 'cs3-scenario-brief.txt')).toBeVisible({ timeout: 30_000 });

      await page.goto(`/projet/${slug}`);
      await page.getByText('Page 1', { exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Page 1' });
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: 'Lier un fichier (SCÉNARIO)' }).click();
      const picker = page.getByRole('dialog', { name: 'Lier · ajouter' });
      await expect(picker).toBeVisible();
      await picker.getByRole('button', { name: /cs3-scenario-brief\.txt/ }).click();
      await expect(picker).toHaveCount(0, { timeout: 10_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      await closeCardModal(modal);

      await page.getByText('Page 2', { exact: true }).click();
      const modal2 = page.getByRole('dialog', { name: 'Page 2' });
      await expect(modal2).toBeVisible();
      await modal2.getByRole('button', { name: 'Lier un fichier (SCÉNARIO)' }).click();
      const picker2 = page.getByRole('dialog', { name: 'Lier · ajouter' });
      await expect(picker2).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        await page.screenshot({ path: `test-results/cs3-multilink-picker-${width}.png`, fullPage: true });
      }
      await picker2.getByRole('button', { name: /cs3-scenario-brief\.txt/ }).click();
      await expect(picker2).toHaveCount(0, { timeout: 10_000 });
      await page.keyboard.press('Escape');

      await page.goto(`/projet/${slug}?tab=fichiers`);
      await expect(assetCard(page, 'cs3-scenario-brief.txt').getByText('Liée à 2 cartes')).toBeVisible({ timeout: 10_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        await page.screenshot({ path: `test-results/cs3-multilink-grid-${width}.png`, fullPage: true });
      }
    });
  }
});
