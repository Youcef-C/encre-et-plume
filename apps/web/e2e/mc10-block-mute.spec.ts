/**
 * MC-10 — Block & mute users.
 *
 * Real backend (no route mocking) — proves the server-side enforcement (neutral errors, auto-remove
 * of the connection, per-viewer review filtering) actually holds, not just that the UI renders a menu.
 * Hermeticity traps (heeded, per the MC-9 lesson): a stale API on :3001 makes every assertion fail
 * confusingly (kill it + flush `rl:*` before running); Postgres is on :5433.
 *
 * Dedicated `MC10_A` / `MC10_B` / `MC10_FRESH` fixture accounts (apps/api/prisma/e2e-seed.js) — no
 * OTHER spec file references them, so a sibling running in parallel can't disturb this suite's
 * absolute connection/DM/block-list assertions (the MC-9 parallel-file-contamination lesson).
 * A and B start as accepted contacts with one existing DM message (A → B, "Salut, on garde le
 * contact !"); MC10_FRESH starts with a clean block list (used for the empty-state assertion so
 * scenario ordering on A/B doesn't matter).
 *
 * The mute flow rides the real dev-seeded /oeuvre/lames-de-brume work: its first review is authored
 * by the seeded creator account `dr1-yuki-moreau` (backend-notes.md) — the second review keeps
 * `authorId: null` and must never be filterable, which MC-9/DR-3 seed data already guarantees.
 *
 * Scope note (CLAUDE.md convention): only this story's spec + the header/auth smoke run per story;
 * the full e2e suite runs at epic boundaries.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASSWORD = 'password123';

const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

async function login(page: Page, email: string, namePattern: RegExp) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: namePattern })).toBeVisible({ timeout: 10_000 });
}

// Messaging widget helpers (same shape as mc9-messaging.spec.ts).
const fab = (page: Page) => page.getByRole('button', { name: /^Messages/ });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Messages' });
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const rowByName = (page: Page, name: string) =>
  panel(page)
    .locator('button')
    .filter({ has: page.locator('b', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }) });

test.describe.configure({ mode: 'serial' });

// MC10-E0 (B14 · R2-B5) — boot/DI-wiring guard. Against the REALLY-booted API (Playwright webServer),
// an unauthenticated GET /me/blocks must be 401 (route mounted), NOT 404/ECONNREFUSED. A missing DI
// provider (the round-1 RedisService regression that failed the whole app boot) makes this fail — the
// net that unit tests, which never instantiate the real module graph, structurally cannot provide.
test('MC10-E0: /me/blocks is mounted on the booted API (unauth → 401)', async ({ request }) => {
  const res = await request.get('http://localhost:3001/me/blocks');
  expect(res.status()).toBe(401);
});

test.describe('MC-10 — block from profile, neutral doors, unblock', () => {
  test('MC10-E1: A blocks B from B\'s profile — confirm modal shows the verbatim effects copy', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_A.email, /menu de e2e mc10_a/i);
    await page.goto('/e2e-mc10-b');
    await expect(page.getByRole('heading', { name: 'E2E MC10_B' })).toBeVisible({ timeout: 10_000 });

    const overflow = page.getByRole('button', { name: "Plus d'actions sur le profil de E2E MC10_B" });
    await expect(overflow).toBeVisible();
    await overflow.click();
    await page.getByRole('menuitem', { name: 'Bloquer' }).click();

    const dialog = page.getByRole('dialog', { name: 'Bloquer E2E MC10_B ?' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "Cette personne ne pourra plus vous envoyer de messages, d'invitations ni de demandes de contact. Vous ne verrez plus ses commentaires.",
      ),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Bloquer' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeVisible();

    // Focus trap: focus starts inside the dialog.
    const focusInDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && (d === document.activeElement || d.contains(document.activeElement));
    });
    expect(focusInDialog).toBe(true);

    await dialog.getByRole('button', { name: 'Bloquer' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('Compte bloqué.')).toBeAttached({ timeout: 5_000 });
  });

  test('MC10-E2: B\'s send in the existing DM now gets the neutral "Impossible d\'envoyer le message." — no block disclosure', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MC10_B.email, /menu de e2e mc10_b/i);
    await fab(page).click();
    await rowByName(page, 'E2E MC10_A').click();
    await expect(panel(page).getByText('Salut, on garde le contact !')).toBeVisible({ timeout: 10_000 }); // history stays readable

    await panel(page).getByLabel('Écrire un message').fill('Toujours partant ?');
    await panel(page).getByRole('button', { name: 'Envoyer' }).click();

    const alert = panel(page).getByRole('alert');
    await expect(alert).toHaveText("Impossible d'envoyer le message.", { timeout: 10_000 });
    // Neutral: nowhere does the failure mention blocking.
    await expect(panel(page).getByText(/bloqu/i)).toHaveCount(0);
  });

  test('MC10-E3: B\'s connection request to A fails neutrally (generic client error, no block disclosure)', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_B.email, /menu de e2e mc10_b/i);
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({ timeout: 10_000 });

    const search = page.getByLabel('Rechercher des personnes');
    await search.fill('E2E MC10_A');
    const row = page.locator('li').filter({ hasText: 'E2E MC10_A' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    const connectBtn = row.getByRole('button', { name: 'Se connecter avec E2E MC10_A' });
    await expect(connectBtn).toBeVisible({ timeout: 10_000 });
    await connectBtn.click();

    // Scoped by text (mc8-contacts.spec.ts convention): a page-wide getByRole('alert') also matches
    // Next's empty route-announcer div (QA round-1 lesson).
    const alert = page.getByRole('alert').filter({ hasText: 'Demande impossible' });
    await expect(alert).toHaveText('Demande impossible. Veuillez réessayer.', { timeout: 10_000 });
    // Rolled back to 'none' (no disclosure of *why* — same generic copy a deleted-account 404 gets).
    await expect(row.getByRole('button', { name: 'Se connecter avec E2E MC10_A' })).toBeVisible();
  });

  test('MC10-E4: blocking auto-removed the contact — A\'s contacts list no longer shows B', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_A.email, /menu de e2e mc10_a/i);
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('li').filter({ hasText: 'E2E MC10_B' })).toHaveCount(0);
  });
});

// Round 2 (D8, "visible mutual block") — these three tests run while A's block on B is still live
// (before E6 unblocks it in the next describe). MC10-E11 is deliberately READ-ONLY: E6 owns the
// unblock action, keeping the serial state deterministic (plan §6 note).
test.describe('MC-10 — round 2: blocker-side state, disclosure, mutual content-hiding (D8)', () => {
  test('MC10-E11: A revisits B\'s profile — overflow shows "Débloquer" + a "Bloqué" badge (read-only)', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_A.email, /menu de e2e mc10_a/i);
    await page.goto('/e2e-mc10-b');
    await expect(page.getByRole('heading', { name: 'E2E MC10_B' })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Bloqué', { exact: true })).toBeVisible();

    const overflow = page.getByRole('button', { name: "Plus d'actions sur le profil de E2E MC10_B" });
    await overflow.click();
    await expect(page.getByRole('menuitem', { name: 'Débloquer' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Bloquer', exact: true })).toHaveCount(0);
    // Close without unblocking — E6 owns the unblock action.
    await page.keyboard.press('Escape');
  });

  test('MC10-E12: B visits A\'s profile while blocked — disclosure shown, no actions/tabs/portfolio', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_B.email, /menu de e2e mc10_b/i);
    await page.goto('/e2e-mc10-a');

    await expect(page.getByRole('heading', { name: 'Profil indisponible' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Cet utilisateur vous a bloqué·e.')).toBeVisible();

    // Nothing else renders: no action buttons, no tabs, no portfolio shell.
    await expect(page.getByRole('button', { name: /Se connecter/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Proposer une collab/i })).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);
  });

  test('MC10-E13: B loses A\'s work + illustration everywhere; anonymous still sees both', async ({ browser }) => {
    const ctxB = await browser.newContext();
    const ctxAnon = await browser.newContext();
    try {
      const pageB = await ctxB.newPage();
      const pageAnon = await ctxAnon.newPage();

      await login(pageB, ACCOUNTS.MC10_B.email, /menu de e2e mc10_b/i);
      await pageB.goto('/oeuvre/e2e-mc10-oeuvre-a');
      await expect(pageB.getByRole('heading', { name: 'Œuvre introuvable' })).toBeVisible({ timeout: 10_000 });

      await pageB.goto('/galerie');
      const searchB = pageB.getByLabel('Titre, artiste…');
      // Wait for the actual debounced /illustrations?q= fetch to resolve (GallerySearchInput
      // debounces 350ms then GalerieClient re-fetches) instead of racing a fixed sleep.
      const searchRespB = pageB.waitForResponse((r) => r.url().includes('/illustrations?') && r.url().includes('q='));
      await searchB.fill('E2E MC10 Illustration A');
      await searchRespB;
      // Locator trap (self-inflicted, same lesson as the alert scoping): the "Résultats pour « … »"
      // heading echoes the raw query text, so a page-wide getByText(query) always matches it even
      // when the grid is empty. Assert the grid's own empty state instead.
      await expect(pageB.getByText('Aucune illustration pour le moment.')).toBeVisible({ timeout: 10_000 });
      await expect(pageB.locator('b', { hasText: 'E2E MC10 Illustration A' })).toHaveCount(0);

      // Anonymous viewer: content stays public, only the blocked-pair viewer loses it.
      await pageAnon.goto('/oeuvre/e2e-mc10-oeuvre-a');
      await expect(pageAnon.getByRole('heading', { name: 'E2E MC10 Œuvre A' })).toBeVisible({ timeout: 10_000 });

      await pageAnon.goto('/galerie');
      const searchAnon = pageAnon.getByLabel('Titre, artiste…');
      const searchRespAnon = pageAnon.waitForResponse((r) => r.url().includes('/illustrations?') && r.url().includes('q='));
      await searchAnon.fill('E2E MC10 Illustration A');
      await searchRespAnon;
      await expect(pageAnon.locator('b', { hasText: 'E2E MC10 Illustration A' })).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctxB.close();
      await ctxAnon.close();
    }
  });
});

test.describe('MC-10 — "Comptes bloqués" settings list + unblock', () => {
  test('MC10-E5: a fresh account with no blocks shows the empty state', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_FRESH.email, /menu de e2e mc10_fresh/i);
    await page.goto('/parametres#comptes-bloques');
    await expect(page.getByRole('heading', { name: 'Comptes bloqués' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Aucun compte bloqué.')).toBeVisible({ timeout: 10_000 });
  });

  test('MC10-E6: A\'s list shows B (name, date, "Débloquer") — unblock removes the row and reopens the door', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_A.email, /menu de e2e mc10_a/i);
    await page.goto('/parametres#comptes-bloques');
    await expect(page.getByRole('heading', { name: 'Comptes bloqués' })).toBeVisible({ timeout: 10_000 });

    const row = page.locator('li').filter({ hasText: 'E2E MC10_B' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Bloqué', { exact: true })).toBeVisible();
    await expect(row.getByText(/Depuis le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    const unblockBtn = row.getByRole('button', { name: 'Débloquer E2E MC10_B' });
    await expect(unblockBtn).toBeVisible();
    await unblockBtn.click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    // Reload confirms the removal persisted server-side (not just optimistic local state).
    await page.reload();
    await expect(page.getByText('Aucun compte bloqué.')).toBeVisible({ timeout: 10_000 });
  });

  test('MC10-E7: B can DM A again after the unblock', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_B.email, /menu de e2e mc10_b/i);
    await fab(page).click();
    await rowByName(page, 'E2E MC10_A').click();
    const marker = `De retour ${Date.now()}`;
    await panel(page).getByLabel('Écrire un message').fill(marker);
    await panel(page).getByRole('button', { name: 'Envoyer' }).click();
    await expect(panel(page).getByRole('log', { name: 'Messages' }).getByText(marker, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(panel(page).getByRole('alert')).toHaveCount(0);
  });
});

test.describe('MC-10 — mute a review author (deviation D2: rides the work-page review rows)', () => {
  test('MC10-E8: A mutes the seeded review author — that review disappears for A only, and persists on reload', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxAnon = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageAnon = await ctxAnon.newPage();

      await login(pageA, ACCOUNTS.MC10_A.email, /menu de e2e mc10_a/i);
      await pageA.goto('/oeuvre/lames-de-brume');
      await expect(pageA.getByText('Une plume incroyable, hâte de lire la suite.')).toBeVisible({ timeout: 10_000 });

      const overflow = pageA.getByRole('button', { name: "Actions sur l'avis de Yuki Moreau" });
      await expect(overflow).toBeVisible();
      await overflow.click();
      await pageA.getByRole('menuitem', { name: 'Masquer les commentaires de ce compte' }).click();

      await expect(pageA.getByText('Commentaires masqués.')).toBeVisible({ timeout: 10_000 });
      await expect(pageA.getByText('Une plume incroyable, hâte de lire la suite.')).toHaveCount(0);

      // Reload — server-side filtering (GET /works/lames-de-brume), not just local state.
      await pageA.reload();
      await expect(pageA.getByRole('heading', { name: 'Avis des lecteur·rices' })).toBeVisible({ timeout: 10_000 });
      await expect(pageA.getByText('Une plume incroyable, hâte de lire la suite.')).toHaveCount(0);

      // Anonymous viewer: content stays public, per-viewer filtering only affects the muter.
      await pageAnon.goto('/oeuvre/lames-de-brume');
      await expect(pageAnon.getByText('Une plume incroyable, hâte de lire la suite.')).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctxA.close();
      await ctxAnon.close();
    }
  });

  test('MC10-E9: settings list shows the mute row ("Masqué" / "Ne plus masquer") — unmute restores the review', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MC10_A.email, /menu de e2e mc10_a/i);
    await page.goto('/parametres#comptes-bloques');
    const row = page.locator('li').filter({ hasText: 'Yuki Moreau' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Masqué', { exact: true })).toBeVisible();
    const unmuteBtn = row.getByRole('button', { name: 'Ne plus masquer Yuki Moreau' });
    await expect(unmuteBtn).toBeVisible();
    await unmuteBtn.click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    await page.goto('/oeuvre/lames-de-brume');
    await expect(page.getByText('Une plume incroyable, hâte de lire la suite.')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('MC-10 — responsive (375px)', () => {
  test('MC10-E10: settings list and the confirm modal are usable at 375px — no horizontal overflow', async ({ page }) => {
    await login(page, ACCOUNTS.MC10_A.email, /menu de e2e mc10_a/i);
    await page.setViewportSize({ width: 375, height: 800 });

    await page.goto('/parametres#comptes-bloques');
    await expect(page.getByRole('heading', { name: 'Comptes bloqués' })).toBeVisible({ timeout: 10_000 });
    const noOverflowSettings = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(noOverflowSettings).toBe(true);
    await page.screenshot({ path: 'test-results/mc10-settings-375px.png', fullPage: true });

    // Confirm modal usability — reopen it on B's profile (unblocked now; contacts again post-E7 send,
    // but the overflow menu is always offered to a signed-in visitor regardless of contact state).
    await page.goto('/e2e-mc10-b');
    await expect(page.getByRole('heading', { name: 'E2E MC10_B' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: "Plus d'actions sur le profil de E2E MC10_B" }).click();
    await page.getByRole('menuitem', { name: 'Bloquer' }).click();

    const dialog = page.getByRole('dialog', { name: 'Bloquer E2E MC10_B ?' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box && box.width).toBeLessThanOrEqual(375);
    const noOverflowModal = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(noOverflowModal).toBe(true);
    await page.screenshot({ path: 'test-results/mc10-confirm-modal-375px.png', fullPage: true });

    // Don't actually re-block B (would break a re-run of this file) — cancel out.
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
