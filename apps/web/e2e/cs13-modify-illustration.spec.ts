/**
 * CS-13 "Modifier une illustration" — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB (apps/api/prisma/e2e-seed.js). Signed-in owner:
 * qa_e2e_cs13_owner@test.com / password123 (e2e-cs13-owner, dessinateur), who owns 7 published,
 * standalone illustrations: "e2e-cs13-illu-main" (the edit target) + 6 more ("e2e-cs13-illu-2"
 * .. "e2e-cs13-illu-7") — enough to prove the "Plus de cet·te artiste" cap actually caps at 4
 * (illu-2..5 shown, illu-6/7 not, per getMoreByArtist's `likeCount desc, id asc` order — all
 * likeCount=0 so ties break on id). A stranger account (qa_e2e_cs13_stranger@test.com) proves the
 * non-owner 404 gate.
 *
 * Split-test convention: run only this spec + the auth/nav smoke, not the full e2e suite.
 */
import { test, expect, type Page, request as playwrightRequest } from '@playwright/test';
import * as path from 'path';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs13_owner@test.com';
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com';
const MAIN_ID = 'e2e-cs13-illu-main';
const ARTIST_SLUG = 'e2e-cs13-owner';
const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');

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

test.describe('CS-13 — owner-only full page /illustration/:id/modifier', () => {
  test.describe.configure({ mode: 'serial' });

  test('CS13-E1: owner sees header, back link, prefilled fields + image-slot', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}/modifier`);
    await expect(page.getByRole('heading', { level: 1, name: 'Modifier l’illustration' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Illustration/ })).toHaveAttribute('href', `/illustration/${MAIN_ID}`);
    await expect((page.getByLabel('Titre') as ReturnType<Page['getByLabel']>)).toHaveValue('E2E CS13 Principale');
    await expect(page.getByText('Déposez l’illustration')).toBeVisible();
    await expect(page.getByLabel('Licence')).toBeVisible();
    await expect(page.getByLabel('Visibilité')).toBeVisible();
  });

  test('CS13-E2: a signed-in non-owner gets "Illustration introuvable", never the form (FE + BE gate)', async ({ page, request }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}/modifier`);
    await expect(page.getByText('Illustration introuvable')).toBeVisible();
    await expect(page.getByLabel('Titre')).toHaveCount(0);

    // BE gate: the backend PATCH also rejects a non-owner — never trust the client.
    const ctx = await playwrightRequest.newContext({ baseURL: API });
    await ctx.post('/auth/login', { data: { email: STRANGER_EMAIL, password: PASSWORD } });
    const res = await ctx.patch(`/illustrations/${MAIN_ID}`, { data: { title: 'Hacked' } });
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });

  test('CS13-E3: an anonymous visitor is redirected to /connexion', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto(`/illustration/${MAIN_ID}/modifier`);
    await expect(page).toHaveURL('/connexion', { timeout: 10_000 });
    await ctx.close();
  });

  test('CS13-E4: empty title blocks save with an inline error; values are preserved', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}/modifier`);
    await page.getByLabel('Titre').fill('');
    await page.getByLabel('Outils').fill('Encre · Procreate');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Un titre est requis')).toBeVisible();
    // Other field values are preserved (no state reset on validation failure).
    await expect(page.getByLabel('Outils')).toHaveValue('Encre · Procreate');
    await expect(page).toHaveURL(`/illustration/${MAIN_ID}/modifier`);
  });

  test('CS13-E5: owner edits Titre + Licence + replaces the image (F-10) → PATCH persists, lands back on the detail page', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}/modifier`);

    await page.getByLabel('Titre').fill('E2E CS13 Principale — modifiée');
    await page.getByLabel('Licence').click();
    await page.getByRole('option', { name: 'CC BY', exact: true }).click();

    // F-10 real presigned upload flow (avatar-50x50.jpg fixture — no crop for illustration kind).
    await page.locator('input[type="file"]').first().setInputFiles(IMAGE_FIXTURE);
    const saveBtn = page.getByRole('button', { name: 'Enregistrer' });
    // Enregistrer is disabled while the upload is busy (uploading/processing). The busy flag flips
    // true only once the presign request resolves (not synchronously on file selection), so wait for
    // the disabled state FIRST — otherwise the immediately-following "enabled" check can pass before
    // the upload has even started (race), and Enregistrer fires the PATCH without `image` yet.
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
    await expect(saveBtn).toBeEnabled({ timeout: 30_000 });

    await saveBtn.click();
    await expect(page).toHaveURL(`/illustration/${MAIN_ID}`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'E2E CS13 Principale — modifiée' })).toBeVisible();
    await expect(page.getByText('CC BY')).toBeVisible();
    // The replaced image is now rendered as the illustration's cover (no more blank/placeholder cover).
    await expect(page.locator('img[alt="E2E CS13 Principale — modifiée"], [aria-label="E2E CS13 Principale — modifiée"]').first()).toBeVisible();
  });

  test('CS13-E6: "Annuler" discards and returns to the detail page without saving', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}/modifier`);
    await page.getByLabel('Titre').fill('Ce titre ne doit jamais être enregistré');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page).toHaveURL(`/illustration/${MAIN_ID}`);
    await expect(page.getByText('Ce titre ne doit jamais être enregistré')).toHaveCount(0);
  });
});

test.describe('CS-13 — modal parity + "Plus de cet·te artiste" / "Voir tout"', () => {
  test('CS13-E7: the detail-page "Modifier" modal now shows the same fields WITH the image-slot; Licence has exactly 3 options; Visibilité has exactly 2 (no "Abonnés")', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}`);
    await page.getByRole('button', { name: "Modifier l'illustration" }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Déposez l’illustration')).toBeVisible();
    await expect(dialog.getByLabel('Titre')).toBeVisible();
    await expect(dialog.getByLabel('Catégorie')).toBeVisible();
    await expect(dialog.getByLabel('Description')).toBeVisible();
    await expect(dialog.getByLabel('Outils')).toBeVisible();
    await page.screenshot({ path: 'test-results/cs13-modal-image-slot.png' });

    await dialog.getByLabel('Licence').click();
    await expect(page.getByRole('option')).toHaveCount(3);
    await expect(page.getByRole('option', { name: '© Tous droits réservés' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'CC BY', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'CC BY-NC' })).toBeVisible();
    // NOTE (defect, see qa-report.md): Escape here closes the WHOLE modal, not just this popover
    // (OnBrandSelect's Escape handler doesn't stopPropagation, so it bubbles to the dialog's own
    // Escape-closes-modal handler). Click an inert area of the dialog instead to close just the
    // popover, working around the defect so the rest of this test can still run.
    await dialog.locator('h2').click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Visibilité').click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await expect(page.getByRole('option', { name: 'Publique' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Privée' })).toBeVisible();
    await expect(page.getByRole('option', { name: /abonnés/i })).toHaveCount(0);
    await dialog.locator('h2').click();
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('CS13-D1 (defect, documented): pressing Escape while an OnBrandSelect popover is open inside the edit modal closes the ENTIRE modal instead of just the popover', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}`);
    await page.getByRole('button', { name: "Modifier l'illustration" }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Licence').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    // Documents the observed (undesirable) behavior: the whole modal closes, an unsaved edit is
    // silently discarded. If/when this is fixed, this assertion should flip to `.toBeVisible()`.
    await expect(dialog).not.toBeVisible();
  });

  test('CS13-E8 (DR-6 bundled): "Plus de cet·te artiste" shows at most 4 (of 6 available) + "Voir tout" → /galerie?artist=<slug>', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/illustration/${MAIN_ID}`);
    const box = page.locator('div', { hasText: 'Plus de cet·te artiste' }).last();
    await expect(page.getByText('Plus de cet·te artiste')).toBeVisible();

    // The cap is 4 out of 6 candidates — the first 4 by id (likeCount ties on id asc) appear,
    // the last 2 do not: proves an actual cap, not "there just happened to be ≤4".
    for (const label of ['E2E CS13 Autre 2', 'E2E CS13 Autre 3', 'E2E CS13 Autre 4', 'E2E CS13 Autre 5']) {
      await expect(page.getByRole('link', { name: new RegExp(label) })).toBeVisible();
    }
    for (const label of ['E2E CS13 Autre 6', 'E2E CS13 Autre 7']) {
      await expect(page.getByRole('link', { name: new RegExp(label) })).toHaveCount(0);
    }

    await page.getByText('Plus de cet·te artiste').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/cs13-artist-sidebar-plus-de-cet-artiste.png' });

    const voirTout = page.getByRole('link', { name: /Voir tout/ });
    await expect(voirTout).toHaveAttribute('href', `/galerie?artist=${ARTIST_SLUG}`);
    await voirTout.click();
    await expect(page).toHaveURL(`/galerie?artist=${ARTIST_SLUG}`);
    await expect(page.getByText(/Illustrations de E2E CS13_OWNER/)).toBeVisible({ timeout: 10_000 });
    // All 7 (main + 6 more) illustrations by this artist show up in the filtered Galerie.
    await expect(page.getByRole('link', { name: /E2E CS13 Principale/ }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/cs13-galerie-artist-filter.png', fullPage: true });
    await expect(page.getByRole('link', { name: /E2E CS13 Autre 6/ }).first()).toBeVisible();
    void box;
  });
});

test.describe('CS-13 — responsive sweep (375/768/1280) on the modifier page', () => {
  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label}: no horizontal overflow; footer buttons reachable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, OWNER_EMAIL);
      await page.goto(`/illustration/${MAIN_ID}/modifier`);
      await expect(page.getByRole('heading', { level: 1, name: 'Modifier l’illustration' })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);

      await page.getByRole('button', { name: 'Annuler' }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);

      await page.screenshot({ path: `test-results/cs13-modifier-${width}.png`, fullPage: true });
    });
  }
});
