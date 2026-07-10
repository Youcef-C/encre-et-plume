/**
 * MC-6 — "Mes candidatures" (route /mes-candidatures) e2e acceptance suite.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js) — not hermetic, exercises the real
 * GET/DELETE /me/applications integration. Login as candidatures.mc6@seed.encre-et-plume.local /
 * password123 (mc6-candidatures-fixture — a dedicated account, NOT camille: camille is also
 * mc5-apply-call.spec.ts's dedicated account, and sharing her raced these exact-count assertions
 * under parallel Playwright workers), who has 3 seeded applications (backend-notes.md §Seed):
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
const MC6_EMAIL = 'candidatures.mc6@seed.encre-et-plume.local'; // dedicated account — see file header
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

test.describe('MC-6 "Mes candidatures" — signed in (dedicated mc6-candidatures-fixture account)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, MC6_EMAIL);
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

  test('MC6-E5: amendment (2026-07-10) — "Retirer" is now offered on the ACCEPTED row too (withdraw-when-accepted); still absent on the rejected (decided, nothing to free) row', async ({
    page,
  }) => {
    // Structural check only (does not click/withdraw) — this account's accepted row is a shared
    // fixture other tests in this file assume stays at "accepted" (e.g. MC6-E1's newest-first/status
    // assertions). The functional end-to-end proof (click → confirm → row gone → seat freed) lives in
    // calls-batch-fixes.spec.ts using dedicated scratch accounts, so it can actually complete the
    // withdrawal without destroying this shared fixture's baseline for the rest of the file.
    await expect(rowByTitle(page, 'Comédie douce-amère').getByRole('button', { name: 'Retirer' })).toBeVisible();
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
  await login(page, MC6_EMAIL);
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

// ─── QA addition: owner extension — appliedAs derivation for a dual-role applicant ───────────────
//
// No seeded fixture account has both creatorRoles (camille is single-role scenariste, per
// backend-notes.md). Per the QA brief: grant a seed account the second role live via
// `PATCH /profiles/me` (page.request shares the page's session cookie) instead of relying on an
// ad-hoc, non-reseedable dual-role row.
//
// MC-4X req6 note: the "Je candidate en tant que :" chooser only renders when the call seeks
// MULTIPLE roles AND the applicant holds more than one of them (`seekingRoles ∩ creatorRoles`
// length > 1). Every seeded call has exactly ONE seekingRole (the multi-role-calls migration
// backfilled 1:1), so no seeded fixture can show the chooser — that specific rendering path is
// unit-tested (ApplyCallModal.test.tsx: "shows the toggle for a dual-role applicant … (multi)") and
// was additionally live-verified once against a scratch multi-seat call created via the API during
// this QA pass (see qa-report.md — chooser appeared, role switch worked, appliedAs round-tripped);
// that scratch call was removed by the final reseed so it never pollutes appels.spec's board counts.
// What IS safe to keep as a permanent regression here: a dual-role applicant applying to a
// single-role-seeking seeded call must NOT see a spurious chooser, and appliedAs still derives
// correctly (to the one role both she and the call share).
test.describe('MC-6 owner extension — appliedAs derivation (dual-role applicant, single-role call)', () => {
  test('MC6-E11: dual-role applicant applying to a single-role-seeking call sees NO chooser; appliedAs still derives correctly', async ({
    page,
  }) => {
    await login(page, NOE_EMAIL);

    const patchRes = await page.request.patch(`${API}/profiles/me`, {
      data: { creatorRoles: ['scenariste', 'dessinateur'] },
    });
    expect(patchRes.status()).toBe(200);

    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });

    // Aventure onirique (mc6-call-aventure) seeks scénariste only — NOE holds it (and dessinateur
    // too), but the intersection with the call's single sought role is exactly 1 → no chooser.
    const card = page.locator('.ep-call-board-card').filter({ hasText: 'Aventure onirique' });
    await expect(card.getByRole('button', { name: 'Candidater' })).toBeEnabled();
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });

    await expect(dialog.getByRole('group', { name: 'Je candidate en tant que :' })).toHaveCount(0);

    await dialog.getByAltText('Échantillon 1').click();
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();

    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    const row = page.locator('.ep-candidature-row').filter({ hasText: 'Aventure onirique' });
    await expect(row.getByText('En tant que scénariste')).toBeVisible();
  });

  test('MC6-E12: single-role applicant sees no apply-as chooser (no regression)', async ({ page }) => {
    await login(page, LEA_EMAIL);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });

    const card = page.locator('.ep-call-board-card').filter({ hasText: 'Récit fantastique' });
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await expect(dialog.getByRole('group', { name: 'Je candidate en tant que :' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Fermer' }).click(); // header ✕ (aria-label), no submission
    await expect(dialog).toHaveCount(0);
  });
});

// ─── QA addition: owner extension — UploadControl preview shape (never a circle outside avatars) ──
test.describe('MC-6 owner extension — sample preview is never a circle', () => {
  test('MC6-E13: an uploaded application sample renders as a rounded rectangle, not a circle', async ({ page }) => {
    await login(page, HUGO_EMAIL);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });

    // Hugo (dessinateur) applies to "« Lames de Brume »" (seeks dessinateur) — role-eligible.
    const card = page.locator('.ep-call-board-card').filter({ hasText: '« Lames de Brume »' });
    await expect(card.getByRole('button', { name: 'Candidater' })).toBeEnabled();
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'sample.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });

    // MC-4X: ApplyCallModal remounts its combined UploadControl on every successful upload
    // (`key={samples.length}`, multi-sample UX) — the control's OWN transient "ready" state (with a
    // "Changer" button) never stably paints; React batches the child's local ready-state update with
    // the parent's `onUploaded` state update that changes the key, so the OLD instance unmounts before
    // that frame renders (confirmed via a captured DOM snapshot: the drop zone is back to idle text
    // immediately). The real, persisted result users see is the uploaded item added to the "JOINDRE UN
    // ÉCHANTILLON" list — that thumbnail (not UploadControl's own ready-state <img>) is what must never
    // render as a circle here; it's a separate, hardcoded `borderRadius: 3` in ApplyCallModal.tsx.
    const listItem = dialog.getByRole('listitem').filter({ has: page.getByAltText('Échantillon téléversé') });
    await expect(listItem).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('1/3')).toBeVisible();

    const previewImg = listItem.getByAltText('Échantillon téléversé');
    const borderRadius = await previewImg.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(borderRadius).not.toBe('50%');

    await previewImg.screenshot({ path: 'test-results/mc6-upload-preview-not-circle.png' });

    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
