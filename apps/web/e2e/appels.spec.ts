/**
 * MC-4 — "Appels à projets" board (`/appels`) e2e acceptance suite.
 *
 * Replaces the MC-1 §11 minimal-stub suite now that the full board (filters, post-call modal,
 * closed/own-call states, countdown/applicant meta) has shipped. Real backend + seeded dev DB
 * (apps/api/prisma/seed.js) — not hermetic, exercises the real GET/POST /calls integration + auth
 * gate. Login as camille.roux@seed.encre-et-plume.local / password123 (dr1-camille-roux).
 *
 * Seed fixtures (backend-notes.md — 8 board calls, board fetches status:'all'):
 *   « Lames de Brume »        — scenariste→dessinateur · Seinen/Thriller · closes +12j · 0 candidatures
 *   One-shot fantastique      — dessinateur→scenariste · Fantastique     · no deadline · 5 candidatures
 *   Comédie romantique        — scenariste→dessinateur · Josei/Romance   · closes +20j
 *   Recueil horrifique        — CLOSED (deadline passed) → "Clôturé", no Candidater
 *   Seinen urbain             — owned by camille.roux (the logged-in viewer) → no Candidater
 *   + 3 MC-6 fixtures (Récit fantastique / Comédie douce-amère / Aventure onirique) — all
 *     dessinateur→scenariste, non-seinen, oldest on the board — the calls camille has applied to.
 *     They only grow the TOTAL count (8), not the dessinateur-seeking (3) / seinen (2) filter counts.
 *
 * The navbar "Trouver" dropdown entry point to /appels is covered in header.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const CAMILLE_EMAIL = 'camille.roux@seed.encre-et-plume.local';

async function loginAsCamille(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(CAMILLE_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

const board = (page: Page) => page.locator('.ep-call-board-card');
const cardByTitle = (page: Page, title: string) => board(page).filter({ hasText: title });

async function openMultiSelect(page: Page, label: string) {
  await page.getByRole('button', { name: new RegExp(`^${label}( \\(\\d+\\))? ▾$`) }).click();
}

test.describe('Appels à projets — signed in (dr1-camille-roux)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('MC4-E1: header, tagline, filter row, and the 5 named MC-4 rows render (8 total with MC-6 fixtures)', async ({ page }) => {
    // MC-6: "Mes candidatures" is now a live link (was a no-op stub button pre-MC-6).
    await expect(page.getByRole('link', { name: 'Mes candidatures' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Candidatures reçues' })).toBeVisible();
    await expect(page.getByRole('button', { name: '＋ Poster un appel' })).toBeVisible();
    await expect(
      page.getByText("Postez un scénario en quête d'un trait, ou un univers en quête d'une histoire."),
    ).toBeVisible();

    const filterGroup = page.getByRole('group', { name: 'Je cherche :' });
    await expect(filterGroup.getByRole('button', { name: 'Dessinateur·rice' })).toBeVisible();
    await expect(filterGroup.getByRole('button', { name: 'Scénariste' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Genre.*▾$/ })).toBeVisible();

    // §8 — no native <select> anywhere on this page (OnBrandMultiSelect is custom).
    expect(await page.locator('select').count()).toBe(0);

    await expect(board(page)).toHaveCount(8);
    await expect(cardByTitle(page, '« Lames de Brume »')).toBeVisible();
    await expect(cardByTitle(page, 'One-shot fantastique')).toBeVisible();
    await expect(cardByTitle(page, 'Comédie romantique')).toBeVisible();
    await expect(cardByTitle(page, 'Recueil horrifique')).toBeVisible();
    await expect(cardByTitle(page, 'Seinen urbain')).toBeVisible();

    // Directional eyebrows are visible text, not color-only.
    await expect(cardByTitle(page, '« Lames de Brume »').getByText('SCÉNARISTE CHERCHE DESSINATEUR·RICE')).toBeVisible();
    await expect(cardByTitle(page, 'One-shot fantastique').getByText('DESSINATEUR CHERCHE SCÉNARISTE')).toBeVisible();
  });

  test('MC4-E2: countdown vs applicant-count status lines render per fixture', async ({ page }) => {
    await expect(cardByTitle(page, '« Lames de Brume »').getByText('Clôture dans 12 j')).toBeVisible();
    await expect(cardByTitle(page, 'Comédie romantique').getByText('Clôture dans 20 j')).toBeVisible();
    await expect(cardByTitle(page, 'One-shot fantastique').getByText('5 candidatures')).toBeVisible();
  });

  test('MC4-E3: closed seed call shows "Clôturé" and no Candidater button', async ({ page }) => {
    const closedCard = cardByTitle(page, 'Recueil horrifique');
    await expect(closedCard.getByText('Clôturé')).toBeVisible();
    await expect(closedCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
  });

  test('MC4-E4: the viewer\'s own call has no Candidater button; other open calls do', async ({ page }) => {
    const ownCard = cardByTitle(page, 'Seinen urbain');
    await expect(ownCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);

    const otherCard = cardByTitle(page, '« Lames de Brume »');
    await expect(otherCard.getByRole('button', { name: 'Candidater' })).toBeVisible();
  });

  test('MC4-E5: role filter "Dessinateur·rice" narrows to calls seeking a dessinateur·rice', async ({ page }) => {
    const filterGroup = page.getByRole('group', { name: 'Je cherche :' });
    const dessinateur = filterGroup.getByRole('button', { name: 'Dessinateur·rice' });
    await expect(dessinateur).toHaveAttribute('aria-pressed', 'false');

    await dessinateur.click();
    await expect(dessinateur).toHaveAttribute('aria-pressed', 'true');

    // Seeking a dessinateur·rice: « Lames de Brume », Comédie romantique, Seinen urbain (3).
    await expect(board(page)).toHaveCount(3);
    await expect(cardByTitle(page, '« Lames de Brume »')).toBeVisible();
    await expect(cardByTitle(page, 'Comédie romantique')).toBeVisible();
    await expect(cardByTitle(page, 'Seinen urbain')).toBeVisible();
    await expect(cardByTitle(page, 'One-shot fantastique')).not.toBeVisible(); // seeks a scénariste

    // Re-click clears (same pattern as /trouver's role toggle).
    await dessinateur.click();
    await expect(dessinateur).toHaveAttribute('aria-pressed', 'false');
    await expect(board(page)).toHaveCount(8);
  });

  test('MC4-E6: genre filter {Seinen} narrows the board, with a removable chip inside the popover, trigger shows (N)', async ({
    page,
  }) => {
    await openMultiSelect(page, 'Genre');
    await page.getByRole('checkbox', { name: 'Seinen' }).check();

    // Trigger shows the (N) count once closed/reopened, and the chip renders inside the popover
    // (owner's chip-layout fix) — never in the shared filter row, so the row never distorts.
    await expect(page.getByRole('button', { name: 'Retirer Seinen' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Genre \(1\) ▾$/ })).toBeVisible();
    // The filter row itself never grows past its normal layout — the chip is inside the popover.
    const filterRow = page.getByRole('group', { name: 'Je cherche :' });
    const rowBox = await filterRow.boundingBox();
    expect(rowBox && rowBox.height).toBeLessThan(60);

    await expect(board(page)).toHaveCount(2); // « Lames de Brume » + Seinen urbain
    await expect(cardByTitle(page, '« Lames de Brume »')).toBeVisible();
    await expect(cardByTitle(page, 'Seinen urbain')).toBeVisible();
    await expect(cardByTitle(page, 'One-shot fantastique')).not.toBeVisible();

    await page.getByRole('button', { name: 'Retirer Seinen' }).click();
    await expect(board(page)).toHaveCount(8);
  });

  test('MC4-E7: dashed sample-slot placeholder has an accessible label on seed cards without a sample', async ({
    page,
  }) => {
    await expect(cardByTitle(page, '« Lames de Brume »').getByRole('img', { name: "Aucun visuel d'exemple" })).toBeVisible();
  });

  test('MC4-E8: "＋ Poster un appel" → validation on empty submit → fill + submit prepends a new card', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '＋ Poster un appel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Poster un appel' });
    await expect(dialog).toBeVisible();

    // Empty submit surfaces required-field validation messages.
    await dialog.getByRole('button', { name: "Publier l'appel" }).click();
    await expect(dialog.getByText('Choisissez qui vous cherchez.')).toBeVisible();
    await expect(dialog.getByText('Le titre est requis.')).toBeVisible();
    await expect(dialog.getByText('La description est requise.')).toBeVisible();
    await expect(dialog.getByText('Ajoutez au moins un genre.')).toBeVisible();
    await expect(dialog.getByText('La date de clôture est requise.')).toBeVisible();

    // Fill the form (no sample image — optional per the story).
    await dialog.getByRole('button', { name: 'Un·e dessinateur·rice' }).click();
    await dialog.getByLabel('Titre').fill('« Brume Écarlate » — one-shot QA');
    await dialog.getByLabel('Description').fill("Un one-shot d'ambiance pour un test e2e MC-4.");
    await dialog.getByRole('combobox', { name: 'Ajouter un genre' }).fill('Seinen');
    await dialog.getByRole('combobox', { name: 'Ajouter un genre' }).press('Enter');
    await expect(dialog.getByRole('button', { name: 'Retirer Seinen' })).toBeVisible();

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 5);
    await dialog.locator('#post-call-deadline').fill(deadline.toISOString().slice(0, 10));

    await dialog.getByRole('button', { name: "Publier l'appel" }).click();
    await expect(dialog).toHaveCount(0);

    // Prepended without a refetch, with the computed countdown. Located by its own (unique)
    // title rather than board(page).first() — independent of seed ordering/timing.
    const newCard = cardByTitle(page, '« Brume Écarlate » — one-shot QA');
    await expect(newCard).toBeVisible();
    await expect(newCard.getByText('Clôture dans 5 j')).toBeVisible();
    // "Un·e dessinateur·rice" = writerSeeksIllustrator = a scénariste seeking a dessinateur·rice.
    await expect(newCard.getByText('SCÉNARISTE CHERCHE DESSINATEUR·RICE')).toBeVisible();
    // The poster is the viewer's own new call — no Candidater.
    await expect(newCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
    await expect(board(page)).toHaveCount(9);
    // Prepended means it's also the first DOM row (still true, asserted separately from identity).
    await expect(board(page).first()).toHaveText(/Brume Écarlate/);
  });

  test('MC4-E9: "Poster un appel" rejects a past/today deadline client-side', async ({ page }) => {
    await page.getByRole('button', { name: '＋ Poster un appel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Poster un appel' });
    await dialog.getByRole('button', { name: 'Un·e scénariste' }).click();
    await dialog.getByLabel('Titre').fill('Titre test');
    await dialog.getByLabel('Description').fill('Description test.');
    await dialog.getByRole('combobox', { name: 'Ajouter un genre' }).fill('Seinen');
    await dialog.getByRole('combobox', { name: 'Ajouter un genre' }).press('Enter');

    const today = new Date().toISOString().slice(0, 10);
    // The native date input enforces `min` = tomorrow; `.fill()` (unlike a raw DOM value + dispatch)
    // goes through React's tracked value setter so onChange actually fires, proving the client-side
    // "must be in the future" rule is enforced (not just the native min attribute, which `.fill` bypasses).
    await dialog.locator('#post-call-deadline').fill(today);
    await dialog.getByRole('button', { name: "Publier l'appel" }).click();
    await expect(dialog.getByText('La date de clôture doit être dans le futur.')).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('MC4-E10: 375px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
    await expect(board(page).first()).toBeVisible();
  });

  test('MC4-E11: 768px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });

  test('MC4-E12: 1280px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });
});

test('MC4-E13: logged-out visit shows the connect prompt, not the calls', async ({ page }) => {
  await page.goto('/appels');
  await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
  await expect(page.getByText('Connectez-vous pour parcourir les appels à projets.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
    'href',
    '/connexion?redirect=/appels',
  );
  await expect(page.getByText('« Lames de Brume »')).not.toBeVisible();
});
