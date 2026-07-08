/**
 * MC-5 — "Candidater" application flow e2e acceptance suite.
 *
 * Extended for MC-4X: role-gated applications (a call's Candidater button is disabled unless the
 * viewer's creatorRoles include the call's seekingRoles), samples[] (was single sampleMediaId /
 * samplePortfolioItemId), no more appliedAs toggle (server-derived). Real backend + seeded dev DB
 * (apps/api/prisma/seed.js) — not hermetic, exercises the real POST /calls/:id/applications +
 * board `hasApplied` integration. Login as camille.roux@seed.encre-et-plume.local / password123
 * (dr1-camille-roux, single-role scénariste), who has 2 seeded PortfolioItems for the
 * portfolio-pick path (backend-notes.md §Seed).
 *
 * Seed fixtures relevant here (see appels.spec.ts header for the full board):
 *   One-shot fantastique  — open, not owned by camille, no deadline, seeks SCÉNARISTE (camille
 *                           holds it — role gate passes), 5 candidatures → 6 after apply.
 *   Recueil horrifique    — CLOSED (deadline passed) → "Clôturé", no Candidater button.
 *   Seinen urbain         — owned by camille (the logged-in viewer) → no Candidater button.
 *   « Lames de Brume »    — seeks DESSINATEUR·RICE only — camille is role-gated here (disabled
 *                           Candidater + hint); used below for the Escape/responsive tests since
 *                           those interact with the modal without ever submitting an application
 *                           (MC-4X moved the "open a modal that doesn't submit" tests off it — see
 *                           MC5-E10 for the explicit role-gate-blocks-the-modal assertion).
 *
 * `application.deleteMany({})` runs on every reseed (before ProjectCall.deleteMany, FK Restrict) so
 * this suite is repeatable — reseed-before-e2e is the established QA flow for this story.
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

test.describe('MC-5 "Candidater" — signed in (dr1-camille-roux)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('MC5-E1: "Candidater" on an open call opens the modal, focus moves inside', async ({ page }) => {
    const card = cardByTitle(page, 'One-shot fantastique');
    await card.getByRole('button', { name: 'Candidater' }).click();

    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await expect(dialog).toBeVisible();
    // Focus is moved into the dialog itself (tabIndex=-1 container) on open.
    await expect(dialog).toBeFocused();
  });

  test('MC5-E2: submitting with no sample shows the required-sample validation message', async ({ page }) => {
    const card = cardByTitle(page, 'One-shot fantastique');
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });

    // Wait for the inline portfolio thumbnails to load (camille has 2 seeded items).
    await expect(dialog.getByAltText('Échantillon 1')).toBeVisible();

    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Ajoutez un échantillon de votre travail.' })).toBeVisible();
    // Modal stays open on validation failure.
    await expect(dialog).toBeVisible();
  });

  test('MC5-E3: portfolio thumbnails and the combined file adder are shown together, with a live n/3 counter', async ({
    page,
  }) => {
    const card = cardByTitle(page, 'One-shot fantastique');
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });

    // MC-4X: up to 3 mixed samples (portfolio picks + uploaded images/PDFs), ONE combined adder —
    // the prototype's "JOINDRE UN ÉCHANTILLON" row shows both sources at once, no mode switch.
    await expect(dialog.getByAltText('Échantillon 1')).toBeVisible();
    await expect(dialog.getByLabel('Ajouter un échantillon')).toBeVisible();
    await expect(dialog.getByText('0/3')).toBeVisible();

    await dialog.getByAltText('Échantillon 1').click();
    await expect(dialog.getByText('1/3')).toBeVisible();
  });

  test('MC5-E4: happy path — pick a portfolio sample + message → success → card flips + count bumps → survives reload', async ({
    page,
  }) => {
    const card = cardByTitle(page, 'One-shot fantastique');
    await expect(card.getByText('5 candidatures')).toBeVisible();
    await card.getByRole('button', { name: 'Candidater' }).click();

    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await dialog.getByAltText('Échantillon 1').click();
    await dialog.getByLabel('VOTRE MESSAGE').fill("J'adore l'univers, je serais ravie de collaborer !");
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();

    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    // Two "Fermer" controls exist (header ✕ aria-label + footer text button) — target the footer
    // one by its visible text (the header ✕ has no text node, only the aria-label).
    await dialog.getByText('Fermer', { exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // Card flips to the "Candidature envoyée" state and the count bumps 5 → 6, without a refetch.
    // MC-6: this is a <span> (not a disabled button) — a "Retirer" affordance now lives alongside it.
    const updatedCard = cardByTitle(page, 'One-shot fantastique');
    await expect(updatedCard.getByText('Candidature envoyée')).toBeVisible();
    await expect(updatedCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
    await expect(updatedCard.getByText('6 candidatures')).toBeVisible();

    // Reload — server-side `hasApplied` (not client state) still shows "Candidature envoyée".
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    const reloadedCard = cardByTitle(page, 'One-shot fantastique');
    await expect(reloadedCard.getByText('Candidature envoyée')).toBeVisible();
    await expect(reloadedCard.getByText('6 candidatures')).toBeVisible();
  });

  test('MC5-E5: closed call shows "Clôturé" and no Candidater button (blocked with explanation)', async ({ page }) => {
    const closedCard = cardByTitle(page, 'Recueil horrifique');
    await expect(closedCard.getByText('Clôturé')).toBeVisible();
    await expect(closedCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
    await expect(closedCard.getByRole('button', { name: 'Candidature envoyée' })).toHaveCount(0);
  });

  test('MC5-E6: the viewer\'s own call shows no Candidater button', async ({ page }) => {
    const ownCard = cardByTitle(page, 'Seinen urbain');
    await expect(ownCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
    await expect(ownCard.getByRole('button', { name: 'Candidature envoyée' })).toHaveCount(0);
  });

  test('MC5-E7: Escape closes the modal without submitting', async ({ page }) => {
    // Récit fantastique (mc6-call-fantastique) also seeks scénariste — camille is eligible — and,
    // unlike One-shot fantastique, is untouched by MC5-E4 (which runs earlier in this same file and
    // applies there), so its Candidater button is still guaranteed enabled here.
    const card = cardByTitle(page, 'Récit fantastique');
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // No candidature was sent — the card is unaffected.
    await expect(cardByTitle(page, 'Récit fantastique').getByRole('button', { name: 'Candidater' })).toBeVisible();
  });

  test('MC5-E8: modal is usable at 375px, 768px and 1280px (no horizontal overflow, CTA reachable)', async ({
    page,
  }) => {
    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      const card = cardByTitle(page, 'Récit fantastique');
      await card.getByRole('button', { name: 'Candidater' }).click();
      const dialog = page.getByRole('dialog', { name: 'Candidater' });
      await expect(dialog).toBeVisible();

      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
      await expect(dialog.getByRole('button', { name: 'Envoyer ma candidature' })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });

  test('MC5-E10 (MC-4X role gate): a role-gated call never opens the apply modal', async ({ page }) => {
    // « Lames de Brume » seeks dessinateur·rice only — camille (scénariste) is disabled here.
    const card = cardByTitle(page, '« Lames de Brume »');
    const btn = card.getByRole('button', { name: 'Candidater' });
    await expect(btn).toBeDisabled();
    await expect(page.getByRole('dialog', { name: 'Candidater' })).toHaveCount(0);
  });
});

test('MC5-E9: logged-out visit to /appels shows no Candidater button (auth gate — MC4-E13 regression)', async ({
  page,
}) => {
  await page.goto('/appels');
  await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
});
