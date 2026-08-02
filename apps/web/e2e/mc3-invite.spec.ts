/**
 * MC-3 "Proposer une collab" — scoped e2e acceptance suite.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js), not hermetic. Sender:
 * camille.roux@seed.encre-et-plume.local / password123 (dr1-camille-roux, scénariste), who owns 2
 * seeded projects (Lames de Brume, Spectres d'Avril). « Carnet d'encre » used to be a third, but it
 * was a fake `Project` row for an ILLUSTRATION COLLECTION — retired from the seed (see
 * `RETIRED_PROJECT_SLUGS`), because a collection has no chapters, no planches and no kanban. It
 * still exists as a DR-12 collection; it is simply not invitable. Recipients used:
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
    // …and NOT the retired « Carnet d'encre » fixture: an illustration collection is not a project
    // you can collaborate on. Asserted as an absence so a resurrected fake row fails here.
    await expect(dialog.getByRole('radio').filter({ hasText: "Carnet d'encre" })).toHaveCount(0);
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

  test('MC3-E4: work page trigger (multi-creator work) opens the from-work choice modal, preselects the co-creator, and sends without a project', async ({
    page,
  }) => {
    await loginAsCamille(page);
    await page.goto('/oeuvre/lames-de-brume');
    await expect(page.getByRole('heading', { name: 'Lames de Brume' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Proposer une collab' }).click();
    const dialog = page.getByRole('dialog', { name: 'Proposer une collab' });
    await expect(dialog).toBeVisible();

    // Collaboration-choice radios: "Rejoindre ce projet" disabled (Bientôt disponible), "Proposer
    // une autre collaboration" is the only selectable/active choice.
    const choiceGroup = dialog.getByRole('radiogroup', { name: 'Type de collaboration' });
    const joinRadio = choiceGroup.getByRole('radio').filter({ hasText: 'Rejoindre ce projet' });
    await expect(joinRadio).toHaveAttribute('aria-disabled', 'true');
    await expect(joinRadio).toContainText('Bientôt disponible');
    await expect(choiceGroup.getByRole('radio', { name: 'Proposer une autre collaboration' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Creator picker — the lone co-creator (Yuki Moreau) is preselected.
    const yukiCheckbox = dialog.getByRole('checkbox').filter({ hasText: 'Yuki Moreau' });
    await expect(yukiCheckbox).toHaveAttribute('aria-checked', 'true');

    // Send unattached (no project selected) — project is optional.
    await dialog.getByRole('button', { name: "Envoyer l'invitation" }).click();
    await expect(dialog.getByRole('status')).toContainText('Yuki Moreau');
  });

  test('MC3-E4b: illustration page trigger (DR-6) opens the modal for the linked artist', async ({ page }) => {
    await loginAsCamille(page);
    // seed.js FID['dr5-illus-1'] — « Pluie de Néons » (artist Yuki Moreau)
    await page.goto('/illustration/00000000-0000-7000-8000-000000000201');
    await expect(page.getByText('Yuki Moreau', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Proposer une collab' }).click();
    const dialog = page.getByRole('dialog', { name: /Inviter Yuki Moreau/ });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('MC3-E5: responsive — modal usable at 375/768/1280 with no horizontal overflow', async ({ page }) => {
    // Sign in ONCE: an authenticated visit to /connexion redirects home, so re-running the login
    // helper inside the loop would wait forever on a form that is no longer rendered.
    await loginAsCamille(page);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
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

/**
 * MC-3 delta (round 2) — Mode A multi-recipient picker (`InviteModal` in picker mode, launched
 * recipient-less from the new `/contacts` "Proposer une collab" header button, F3).
 *
 * Sender: the dedicated MC-8 fixture account `contacts.mc8@seed.encre-et-plume.local`
 * (mc8-contacts-fixture, "Camille R.") — the ONLY seeded account with real accepted MC-8 contacts
 * (Léa B. / Hugo D., per `MC8_ACCEPTED` in seed.js), which is what the picker's pool draws from
 * (decision 4, plan §7). `dr1-camille-roux` (round-1's sender) has none, so she can't exercise a
 * real multi-select here.
 */
const MC8_EMAIL = 'contacts.mc8@seed.encre-et-plume.local';
const LEA_EMAIL = 'lea.b@seed.encre-et-plume.local';
const HUGO_EMAIL = 'hugo.d@seed.encre-et-plume.local';

async function loginAsMc8Fixture(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(MC8_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

test.describe('MC-3 delta — Mode A multi-recipient picker (mc8-contacts-fixture ⇄ Léa B. / Hugo D.)', () => {
  test.beforeAll(async () => {
    await clearPendingInvitesTo(LEA_EMAIL);
    await clearPendingInvitesTo(HUGO_EMAIL);
  });

  test('MC3-D1: /contacts "Proposer une collab" opens picker mode; selecting two contacts sends two independent invitations with per-recipient results', async ({
    page,
  }) => {
    await loginAsMc8Fixture(page);
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Proposer une collab' }).click();
    const dialog = page.getByRole('dialog', { name: 'Proposer une collab' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toBeFocused();

    // No prefilled/read-only recipient in picker mode — the reachable-user search IS the recipient
    // field (2026-07-26: the Contacts dropdown was retired; contacts are listed idle, then chipped).
    await expect(dialog.getByText('DESTINATAIRES')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Contacts$/ })).toHaveCount(0);
    await dialog.getByRole('option', { name: /Léa B\./ }).click();
    await dialog.getByRole('option', { name: /Hugo D\./ }).click();
    const chips = dialog.getByRole('list', { name: 'Destinataires sélectionnés' });
    await expect(chips.getByText('Léa B.')).toBeVisible();
    await expect(chips.getByText('Hugo D.')).toBeVisible();

    const message = dialog.getByLabel('MESSAGE');
    await expect(message).toHaveAttribute('placeholder', 'Écrivez un mot aux destinataires…');
    await message.fill('On monte un projet à trois ?');

    // 2+ selected → plural send label (F1).
    const sendButton = dialog.getByRole('button', { name: 'Envoyer les invitations' });
    await sendButton.click();

    // Per-recipient result list — role=status, one line per selected contact.
    const results = dialog.getByRole('status');
    await expect(results).toBeVisible({ timeout: 10_000 });
    await expect(results.getByText('Léa B.')).toBeVisible();
    await expect(results.getByText('Hugo D.')).toBeVisible();
    await expect(results.getByText('Envoyée')).toHaveCount(2);

    // Two "Fermer": the header's icon close button (aria-label) and the footer button — the footer
    // one is last in DOM order (same disambiguation as MC3-E1 above).
    await dialog.getByRole('button', { name: 'Fermer' }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Each fanned-out invitation is independently visible/respondable by ITS recipient.
    const leaCtx = await playwrightRequest.newContext({ baseURL: API_BASE });
    const hugoCtx = await playwrightRequest.newContext({ baseURL: API_BASE });
    try {
      await leaCtx.post('/auth/login', { data: { email: LEA_EMAIL, password: PASSWORD } });
      const leaInbox = await leaCtx.get('/invitations?direction=received&pageSize=50');
      const leaBody = await leaInbox.json();
      const leaInvite = (leaBody.items ?? []).find(
        (inv: { status: string; message?: string }) => inv.status === 'pending' && inv.message === 'On monte un projet à trois ?',
      );
      expect(leaInvite).toBeTruthy();
      const leaAccept = await leaCtx.patch(`/invitations/${leaInvite.id}`, { data: { status: 'accepted' } });
      expect(leaAccept.status()).toBe(200);

      await hugoCtx.post('/auth/login', { data: { email: HUGO_EMAIL, password: PASSWORD } });
      const hugoInbox = await hugoCtx.get('/invitations?direction=received&pageSize=50');
      const hugoBody = await hugoInbox.json();
      const hugoInvite = (hugoBody.items ?? []).find(
        (inv: { status: string; message?: string }) => inv.status === 'pending' && inv.message === 'On monte un projet à trois ?',
      );
      expect(hugoInvite).toBeTruthy();
      // Declining Hugo's copy must not affect Léa's already-accepted one (independent rows).
      const hugoDecline = await hugoCtx.patch(`/invitations/${hugoInvite.id}`, { data: { status: 'declined' } });
      expect(hugoDecline.status()).toBe(200);
    } finally {
      await leaCtx.dispose();
      await hugoCtx.dispose();
    }
  });

  test('MC3-D2: picker mode — sending with zero recipients selected shows an inline error and makes no API call', async ({ page }) => {
    await loginAsMc8Fixture(page);
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({ timeout: 10_000 });

    let invitationsPosted = false;
    await page.route('**/invitations', (route) => {
      if (route.request().method() === 'POST') invitationsPosted = true;
      return route.continue();
    });

    await page.getByRole('button', { name: 'Proposer une collab' }).click();
    const dialog = page.getByRole('dialog', { name: 'Proposer une collab' });
    await dialog.getByRole('button', { name: "Envoyer l'invitation" }).click();

    await expect(dialog.getByRole('alert')).toHaveText('Sélectionnez au moins un·e destinataire.');
    expect(invitationsPosted).toBe(false);
  });

  test('MC3-D3: responsive — the picker-mode modal is usable at 375/768/1280 with no horizontal overflow', async ({ page }) => {
    // Sign in ONCE — see MC3-E5: /connexion redirects home for an authenticated session.
    await loginAsMc8Fixture(page);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/contacts');
      await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Proposer une collab' }).click();
      const dialog = page.getByRole('dialog', { name: 'Proposer une collab' });
      await expect(dialog).toBeVisible();

      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
});
