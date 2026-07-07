/**
 * MC-6 — "Mes candidatures" (route /mes-candidatures) e2e acceptance suite.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js) — not hermetic, exercises the real
 * GET/DELETE /me/applications integration. Login as camille.roux@seed.encre-et-plume.local /
 * password123 (dr1-camille-roux), who has 3 seeded applications (backend-notes.md §Seed):
 *   Récit fantastique      (mc6-call-fantastique) — pending  — newest  (createdAt -2j)
 *   Comédie douce-amère    (mc6-call-comedie)     — accepted —         (createdAt -5j)
 *   Aventure onirique      (mc6-call-aventure)    — rejected — oldest  (createdAt -9j)
 *
 * Owner extension (user-feedback.md): withdrawal is REQUIRED. `DELETE /me/applications/:id` is
 * pending-only (409 on decided rows) — the FE only ever shows "Retirer" on pending rows, so the
 * 409 guard is exercised at the API layer (my-applications.service.spec.ts), not re-proven here;
 * this suite proves the UI withdraw path end-to-end and that a withdrawn row can be re-applied to.
 *
 * theo.m@seed.encre-et-plume.local (mc1-theo-m, password123) has zero applications — used for the
 * empty state.
 *
 * `application.deleteMany({})` runs on every reseed (before ProjectCall.deleteMany, FK Restrict),
 * so this suite (including the withdraw test, which deletes a row) is repeatable — reseed-before-
 * e2e is the established QA flow for this story.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';
const CAMILLE_EMAIL = 'camille.roux@seed.encre-et-plume.local';
const THEO_EMAIL = 'theo.m@seed.encre-et-plume.local';
// Dedicated accounts for the QA-added scenarios below — all unused by any other e2e spec (grepped),
// so applying to / withdrawing from calls here can't collide with appels.spec / mc5-apply-call.spec's
// exact-count assertions (those only pin "One-shot fantastique" 5→6 and "« Lames de Brume »" at 0).
const HUGO_EMAIL = 'hugo.d@seed.encre-et-plume.local'; // dessinateur, single-role
const NOE_EMAIL = 'noe.p@seed.encre-et-plume.local'; // scenariste, PATCHed to dual-role below
const LEA_EMAIL = 'lea.b@seed.encre-et-plume.local'; // scenariste, single-role

const SAMPLE_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/avatar.jpg'));

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

const rows = (page: Page) => page.locator('.ep-candidature-row');
const rowByTitle = (page: Page, title: string) => rows(page).filter({ hasText: title });

test.describe('MC-6 "Mes candidatures" — signed in (dr1-camille-roux)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CAMILLE_EMAIL);
    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('MC6-E1: header, tagline, chips, and the 3 seeded rows render newest-first with distinct status badges', async ({
    page,
  }) => {
    await expect(page.getByRole('link', { name: '‹ Appels' })).toBeVisible();
    await expect(
      page.getByText('Les appels à projets auxquels vous avez postulé.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toutes · 3' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'En attente' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acceptées' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refusées' })).toBeVisible();

    await expect(rows(page)).toHaveCount(3);
    // Newest-first order: pending (-2j) → accepted (-5j) → rejected (-9j).
    await expect(rows(page).nth(0)).toContainText('Récit fantastique');
    await expect(rows(page).nth(1)).toContainText('Comédie douce-amère');
    await expect(rows(page).nth(2)).toContainText('Aventure onirique');

    await expect(rowByTitle(page, 'Récit fantastique').getByText('● En attente')).toBeVisible();
    await expect(rowByTitle(page, 'Comédie douce-amère').getByText('✓ Acceptée')).toBeVisible();
    await expect(rowByTitle(page, 'Aventure onirique').getByText('✕ Refusée')).toBeVisible();

    // Meta line: direction · genre · owner.
    await expect(
      rowByTitle(page, 'Récit fantastique').getByText('Dessinateur cherche scénariste · Fantastique · Théo M.'),
    ).toBeVisible();
  });

  test('MC6-E2: "Refusées" chip narrows to the rejected row only; "Toutes" restores all 3', async ({ page }) => {
    await page.getByRole('button', { name: 'Refusées' }).click();
    await expect(page.getByRole('button', { name: 'Refusées' })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
    await expect(rowByTitle(page, 'Aventure onirique')).toBeVisible();

    await page.getByRole('button', { name: 'Toutes · 3' }).click();
    await expect(rows(page)).toHaveCount(3);
  });

  test('MC6-E3: "Voir l\'appel" on the pending row lands on /appels with the target card visible', async ({ page }) => {
    const link = rowByTitle(page, 'Récit fantastique').getByRole('link', {
      name: "Voir l'appel « Récit fantastique »",
    });
    await expect(link).toHaveAttribute('href', /\/appels\?call=/);
    await link.click();

    await expect(page).toHaveURL(/\/appels\?call=/);
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ep-call-board-card').filter({ hasText: 'Récit fantastique' })).toBeVisible();
  });

  test('MC6-E4: withdraw a pending row via inline confirm — row gone, counts update, board flips to Candidater, re-apply possible', async ({
    page,
  }) => {
    const pendingRow = rowByTitle(page, 'Récit fantastique');
    await pendingRow.getByRole('button', { name: 'Retirer' }).click();

    const confirmGroup = pendingRow.getByRole('group', { name: 'Confirmer le retrait de la candidature' });
    await expect(confirmGroup).toBeVisible();
    await confirmGroup.getByRole('button', { name: 'Confirmer le retrait' }).click();

    // Row disappears, counts drop 3 → 2 both on the "Toutes" chip and the visible list.
    await expect(rowByTitle(page, 'Récit fantastique')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Toutes · 2' })).toBeVisible();

    // The board (/appels) reflects the withdrawal: the card flips back to "Candidater" and the
    // applicant re-apply path works (hasApplied is false again server-side).
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    const card = page.locator('.ep-call-board-card').filter({ hasText: 'Récit fantastique' });
    await expect(card.getByRole('button', { name: 'Candidater' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Candidature envoyée' })).toHaveCount(0);

    // Re-apply: the unique (callId, applicantId) key was freed by the DELETE.
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await expect(dialog).toBeVisible();
    await dialog.getByAltText('Échantillon 1').click();
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const reappliedCard = page.locator('.ep-call-board-card').filter({ hasText: 'Récit fantastique' });
    await expect(reappliedCard.getByText('Candidature envoyée')).toBeVisible();

    // Reseed cleanup happens outside this test (fresh seed before the next full e2e run); within
    // this run "Mes candidatures" now shows the re-applied row back at pending.
    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(rowByTitle(page, 'Récit fantastique').getByText('● En attente')).toBeVisible();
  });

  test('MC6-E5: "Retirer" is not offered on decided (accepted/rejected) rows — pending-only withdrawal', async ({
    page,
  }) => {
    await expect(rowByTitle(page, 'Comédie douce-amère').getByRole('button', { name: 'Retirer' })).toHaveCount(0);
    await expect(rowByTitle(page, 'Aventure onirique').getByRole('button', { name: 'Retirer' })).toHaveCount(0);
  });

  test('MC6-E6: responsive — 375px, 768px, 1280px have no horizontal overflow', async ({ page }) => {
    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
    }
  });
});

test('MC6-E7: empty state for a user with zero applications — copy + "Appels à projets" link', async ({ page }) => {
  await login(page, THEO_EMAIL);
  await page.goto('/mes-candidatures');
  await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Vous n’avez pas encore candidaté.')).toBeVisible();
  const link = page.getByRole('link', { name: 'Appels à projets' });
  await expect(link).toHaveAttribute('href', '/appels');
  await link.click();
  await expect(page).toHaveURL('/appels');
});

test('MC6-E8: logged-out visit to /mes-candidatures shows the connect prompt', async ({ page }) => {
  await page.goto('/mes-candidatures');
  await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible();
  await expect(page.getByText('Connectez-vous pour retrouver vos candidatures.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
    'href',
    '/connexion?redirect=/mes-candidatures',
  );
});

test('MC6-E9: smoke — /appels "Mes candidatures" header link navigates to the page', async ({ page }) => {
  await login(page, CAMILLE_EMAIL);
  await page.goto('/appels');
  await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('link', { name: 'Mes candidatures' }).click();
  await expect(page).toHaveURL('/mes-candidatures');
  await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible();
});

// ─── QA addition: withdraw directly from the /appels BOARD CARD surface (not via Mes candidatures) ──
//
// Owner feedback (user-feedback.md): "It also needs to be able to withdraw from an application in
// the calls list." MC6-E4 above proves withdrawal from the /mes-candidatures row; this proves the
// second surface — CallBoardCard's own "Retirer" inline-confirm — independently, using a dedicated
// account + an open call with no exact-count assertion elsewhere ("Seinen urbain").
test.describe('MC-6 owner extension — withdraw from the /appels board card', () => {
  test('MC6-E10: apply then withdraw via the board card\'s own "Retirer" — flips back to Candidater, and Mes candidatures reflects it', async ({
    page,
  }) => {
    await login(page, HUGO_EMAIL);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });

    const card = page.locator('.ep-call-board-card').filter({ hasText: 'Seinen urbain' });
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await dialog.getByAltText('Échantillon 1').click();
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const appliedCard = page.locator('.ep-call-board-card').filter({ hasText: 'Seinen urbain' });
    await expect(appliedCard.getByText('Candidature envoyée')).toBeVisible();

    // Withdraw right here on the board — never visits /mes-candidatures for this part.
    await appliedCard.getByRole('button', { name: 'Retirer' }).click();
    const confirmGroup = appliedCard.getByRole('group', { name: 'Confirmer le retrait de la candidature' });
    await expect(confirmGroup).toBeVisible();
    await confirmGroup.getByRole('button', { name: 'Confirmer le retrait' }).click();

    await expect(appliedCard.getByRole('button', { name: 'Candidater' })).toBeVisible();
    await expect(appliedCard.getByText('Candidature envoyée')).toHaveCount(0);

    // Cross-surface check: the withdrawal also reached GET /me/applications (empty for Hugo).
    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Vous n’avez pas encore candidaté.')).toBeVisible();
  });
});

// ─── QA addition: owner extension — appliedAs role toggle for a dual-role applicant ──────────────
//
// No seeded fixture account has both creatorRoles (camille is single-role scenariste, per
// backend-notes.md). Per the QA brief: grant a seed account the second role live via
// `PATCH /profiles/me` (page.request shares the page's session cookie) instead of relying on an
// ad-hoc, non-reseedable dual-role row. Uses "Comédie romantique" (MC-4 fixture, scenariste-authored,
// seeking dessinateur) — untouched by any exact-count assertion in appels.spec / mc5-apply-call.spec.
test.describe('MC-6 owner extension — appliedAs role toggle', () => {
  test('MC6-E11: dual-role applicant sees "Je candidate en tant que :", can switch roles, and the choice is echoed on Mes candidatures', async ({
    page,
  }) => {
    await login(page, NOE_EMAIL);

    const patchRes = await page.request.patch(`${API}/profiles/me`, {
      data: { creatorRoles: ['scenariste', 'dessinateur'] },
    });
    expect(patchRes.status()).toBe(200);

    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });

    const card = page.locator('.ep-call-board-card').filter({ hasText: 'Comédie romantique' });
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });

    const toggle = dialog.getByRole('group', { name: 'Je candidate en tant que :' });
    await expect(toggle).toBeVisible();
    // Default = the call's sought role (author scenariste → seeks dessinateur).
    await expect(toggle.getByRole('button', { name: 'Dessinateur·rice' })).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle.getByRole('button', { name: 'Scénariste' })).toHaveAttribute('aria-pressed', 'false');

    // Switch the choice.
    await toggle.getByRole('button', { name: 'Scénariste' }).click();
    await expect(toggle.getByRole('button', { name: 'Scénariste' })).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle.getByRole('button', { name: 'Dessinateur·rice' })).toHaveAttribute('aria-pressed', 'false');

    await dialog.getByAltText('Échantillon 1').click();
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();

    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    const row = page.locator('.ep-candidature-row').filter({ hasText: 'Comédie romantique' });
    await expect(row.getByText('En tant que scénariste')).toBeVisible();
  });

  test('MC6-E12: single-role applicant sees no apply-as toggle (no regression)', async ({ page }) => {
    await login(page, LEA_EMAIL);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });

    const card = page.locator('.ep-call-board-card').filter({ hasText: 'Comédie romantique' });
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await expect(dialog.getByRole('group', { name: 'Je candidate en tant que :' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Fermer' }).click(); // header ✕ (aria-label), no submission
    await expect(dialog).toHaveCount(0);
  });
});

// ─── QA addition: owner extension — UploadControl preview shape (never a circle outside avatars) ──
test.describe('MC-6 owner extension — sample preview is never a circle', () => {
  test('MC6-E13: the apply-modal sample preview renders as a rounded rectangle, not a circle', async ({ page }) => {
    await login(page, LEA_EMAIL);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });

    const card = page.locator('.ep-call-board-card').filter({ hasText: 'Comédie romantique' });
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'sample.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });

    // application_sample uploads skip the avatar crop step and go straight to upload → processing →
    // ready (worker runs inline locally per .env WORKER_INLINE=true). "Changer" only renders in the
    // ready state, next to the thumbnail preview.
    await expect(dialog.getByRole('button', { name: 'Changer' })).toBeVisible({ timeout: 30_000 });

    const previewImg = dialog.locator('img[alt="Fichier d\'échantillon"]');
    await expect(previewImg).toBeVisible();
    const borderRadius = await previewImg.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(borderRadius).not.toBe('50%');
    expect(borderRadius).toBe('6px');

    await previewImg.screenshot({ path: 'test-results/mc6-upload-preview-not-circle.png' });

    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
