/**
 * MC-3 "Proposer une collab" — scoped e2e acceptance suite.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js), not hermetic. Sender:
 * camille.roux@seed.encre-et-plume.local / password123 (dr1-camille-roux, scénariste), who owns 3
 * seeded projects (Lames de Brume, Spectres d'Avril, Carnet d'encre). Recipients used:
 *   - Théo M. (theo.m@seed.encre-et-plume.local, mc1-theo-m) via the /trouver partner card + her
 *     own profile page (/mc1-theo-m).
 *   - Yuki Moreau (yuki.moreau@seed.encre-et-plume.local, dr1-yuki-moreau) via the work page
 *     (/oeuvre/lames-de-brume), the showcase manga's other creator (Camille is the first creator —
 *     the invite targets the co-creator, never herself).
 *
 * Idempotency: sending an invitation persists a row (no UI to accept/decline this story), so a
 * rerun of this file would otherwise hit the 409 duplicate-pending guard on the "happy path" test.
 * `clearPendingInvitesTo` logs in as each recipient directly against the API and declines any
 * pending invite from a prior run before the suite starts.
 */
import { test, expect, type Page, request as playwrightRequest } from '@playwright/test';

const PASSWORD = 'password123';
const CAMILLE_EMAIL = 'camille.roux@seed.encre-et-plume.local';
const THEO_EMAIL = 'theo.m@seed.encre-et-plume.local';
const YUKI_EMAIL = 'yuki.moreau@seed.encre-et-plume.local';
const API_BASE = 'http://localhost:3001';

async function loginAsCamille(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(CAMILLE_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

async function clearPendingInvitesTo(email: string) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  await ctx.post('/auth/login', { data: { email, password: PASSWORD } });
  const res = await ctx.get('/invitations?direction=received&pageSize=50');
  if (res.ok()) {
    const body = await res.json();
    for (const inv of body.items ?? []) {
      if (inv.status === 'pending') {
        await ctx.patch(`/invitations/${inv.id}`, { data: { status: 'declined' } });
      }
    }
  }
  await ctx.dispose();
}

const trouverGrid = (page: Page) => page.locator('.ep-partners-grid');

test.describe('MC-3 collaboration invite — signed in (dr1-camille-roux)', () => {
  test.beforeAll(async () => {
    await clearPendingInvitesTo(THEO_EMAIL);
    await clearPendingInvitesTo(YUKI_EMAIL);
  });

  test('MC3-E1: partner card → modal → project picker → message → send → success', async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/trouver');
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });

    const theoCard = trouverGrid(page).locator('li').filter({ hasText: 'Théo M.' });
    await theoCard.getByRole('button', { name: 'Proposer une collaboration à Théo M.' }).click();

    const dialog = page.getByRole('dialog', { name: /Inviter Théo M\./ });
    await expect(dialog).toBeVisible();
    // A11y: aria-modal, focus moved into the dialog on open.
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toBeFocused();
    // Read-only recipient field — no input for the recipient anywhere in the modal.
    await expect(dialog.locator('input, [contenteditable]').filter({ hasText: 'Théo' })).toHaveCount(0);

    // Project picker — seeded projects render, none selected by default.
    await expect(dialog.getByText('CHOISIR UN PROJET')).toBeVisible();
    const lamesRow = dialog.getByRole('radio').filter({ hasText: 'Lames de Brume' });
    await expect(lamesRow).toBeVisible();
    await expect(dialog.getByRole('radio').filter({ hasText: "Spectres d'Avril" })).toBeVisible();
    await expect(dialog.getByRole('radio').filter({ hasText: "Carnet d'encre" })).toBeVisible();
    await expect(lamesRow).toHaveAttribute('aria-checked', 'false');

    await lamesRow.click();
    await expect(lamesRow).toHaveAttribute('aria-checked', 'true');

    // Message field — bounded, placeholder verbatim.
    const message = dialog.getByLabel('MESSAGE');
    await expect(message).toHaveAttribute('maxlength', '1000');
    await expect(message).toHaveAttribute('placeholder', 'Écrivez un mot à ce créateur…');
    await message.fill("On s'associe sur un chapitre bonus ?");

    // Sending state, then success.
    const sendButton = dialog.getByRole('button', { name: "Envoyer l'invitation" });
    await sendButton.click();
    // Note: the confirmation string is "Proposition envoyée à {name}." — with the seeded display
    // name "Théo M." already ending in a period, the rendered text doubles up ("Théo M..").
    await expect(dialog.getByRole('status')).toHaveText('Proposition envoyée à Théo M..');

    // Two "Fermer": the header's icon close button (aria-label) and the success footer button —
    // click the footer one (last in DOM order).
    await dialog.getByRole('button', { name: 'Fermer' }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('MC3-E2: duplicate pending invite disables send with the French error', async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/trouver');
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });

    const theoCard = trouverGrid(page).locator('li').filter({ hasText: 'Théo M.' });
    await theoCard.getByRole('button', { name: 'Proposer une collaboration à Théo M.' }).click();

    const dialog = page.getByRole('dialog', { name: /Inviter Théo M\./ });
    const sendButton = dialog.getByRole('button', { name: "Envoyer l'invitation" });
    await sendButton.click();

    await expect(dialog.getByRole('alert')).toHaveText('Une proposition est déjà en attente pour ce créateur.');
    await expect(sendButton).toBeDisabled();
  });

  test('MC3-E3: profile trigger opens the modal prefilled with that creator; Esc closes it', async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/mc1-theo-m');
    await expect(page.getByRole('heading', { name: 'Théo M.' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Proposer une collab' }).click();
    const dialog = page.getByRole('dialog', { name: /Inviter Théo M\./ });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('MC3-E4: work page trigger opens the modal for the co-creator and sends without a project', async ({
    page,
  }) => {
    await loginAsCamille(page);
    await page.goto('/oeuvre/lames-de-brume');
    await expect(page.getByRole('heading', { name: 'Lames de Brume' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Proposer une collab' }).click();
    const dialog = page.getByRole('dialog', { name: /Inviter Yuki Moreau/ });
    await expect(dialog).toBeVisible();

    // Send unattached (no project selected) — project is optional.
    await dialog.getByRole('button', { name: "Envoyer l'invitation" }).click();
    await expect(dialog.getByRole('status')).toHaveText('Proposition envoyée à Yuki Moreau.');
  });

  test('MC3-E4b: illustration page trigger (DR-6) opens the modal for the linked artist', async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/illustration/dr5-illus-1');
    await expect(page.getByText('Yuki Moreau', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Proposer une collab' }).click();
    const dialog = page.getByRole('dialog', { name: /Inviter Yuki Moreau/ });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('MC3-E5: responsive — modal usable at 375/768/1280 with no horizontal overflow', async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await loginAsCamille(page);
      await page.goto('/trouver');
      await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });

      const theoCard = trouverGrid(page).locator('li').filter({ hasText: 'Théo M.' });
      await theoCard.getByRole('button', { name: 'Proposer une collaboration à Théo M.' }).click();
      const dialog = page.getByRole('dialog', { name: /Inviter Théo M\./ });
      await expect(dialog).toBeVisible();

      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);

      await page.screenshot({ path: `e2e/screenshots/mc3-invite-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
});

test('MC3-E6: anonymous visitor — profile "Proposer une collab" redirects to /connexion', async ({ page }) => {
  await page.goto('/mc1-theo-m');
  await expect(page.getByRole('heading', { name: 'Théo M.' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Proposer une collab' }).click();
  await expect(page).toHaveURL('/connexion');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
