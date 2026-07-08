/**
 * MC-7 — "Mes appels à projets" (route /candidatures-recues, renamed from "Candidatures reçues")
 * e2e acceptance suite.
 *
 * Round 2 (design-fidelity re-shape): the page is now a replica of prototype
 * `data-page="candidatsrecus"` (Encre et Plume - Prototype.dc.html:2181-2201) — a single-call
 * OnBrandSelect selector + accent "N candidatures" count badge (not a stacked grouped list),
 * circular avatar + accent role chip + separate "Voir le profil" button, green Accepter (#1f8a5b) /
 * red Refuser (var(--accent)), and "Voir l'appel" opens the shared CallDetailModal IN-PAGE (no
 * navigation to /appels).
 *
 * Round 3 (call edit/delete + modal contrast, MC7-E10/E11/E12 below, kept LAST in this file):
 * owner Éditer/Supprimer live in the shared CallDetailModal footer (D12), reusing PostCallModal in
 * edit mode and the MC-6 inline on-brand confirm pattern (no window.confirm). Exercised on the
 * SECOND owner call `mc7-call-brouillon` « Brouillon d'été » (zero accepted applications — safe to
 * edit/delete). The 409 "accepted applicants" delete-refusal is exercised on `mc7-call-nocturne`
 * itself, relying on MC7-E5 (same describe block, sequential execution, no reseed in between)
 * having already accepted Léa's application on it.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js) — not hermetic, exercises the real
 * GET /me/calls/applications + PATCH /applications/:id + PATCH/DELETE /calls/:id integration.
 *
 * Login as appels.mc7@seed.encre-et-plume.local / password123 (mc7-appels-fixture — a dedicated
 * call-owner account, standalone so it can't race any other suite's counts), who owns TWO calls
 * (backend-notes.md §Seed fixtures):
 *   mc7-call-nocturne "Polar nocturne" (dessinateur→scenariste, genre action) — newest, default
 *   selection — 3 received applications:
 *     Léa B.   (mc1-lea-b)   — pending  — has a message   — newest (createdAt -1j) — accepted below
 *     Noé P.   (mc1-noe-p)   — pending  — empty message   —         (createdAt -3j) — rejected below
 *     Diego S. (mc1-diego-s) — rejected — has a message   — oldest  (createdAt -6j) — resolved on load
 *   mc7-call-brouillon "Brouillon d'été" (dessinateur→scenariste, genre action) — older, round-3
 *   edit/delete fixture — 1 received application (Diego S., pending), zero accepted.
 *
 * mc2.sansprofil@seed.encre-et-plume.local owns zero calls — used for the empty state.
 *
 * PDF sample size (magnitude-based formatBytes units): NOT e2e-tested — the MC-7 seed's samples
 * are all `kind: 'image'` (seed.js, seed frozen for this field). Unit-tested in format.test.ts +
 * the CandidaturesRecuesClient unit suite's mocked PDF row.
 *
 * Board-count ripple: the two MC-7 calls grow the default /appels board total by 2 (appels.spec.ts
 * already accounts for it — see its header comment); the "Candidatures reçues" board button was
 * renamed to a live "Mes appels à projets" link (F1); header.spec.ts F4-E2E-12 asserts the same
 * avatar-menu rename. Neither spec's locators touch this page's reshape, so no ripple edits needed
 * there beyond the board total.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';
const MC7_OWNER_EMAIL = 'appels.mc7@seed.encre-et-plume.local';
// Diego is a received applicant on mc7-call-nocturne but NOT its owner — used to probe owner-only
// authz. Also used nowhere else in the e2e suite for a write, so a failed 404 PATCH attempt here
// can't corrupt his (already resolved) row.
const DIEGO_EMAIL = 'diego.s@seed.encre-et-plume.local';
const LEA_EMAIL = 'lea.b@seed.encre-et-plume.local';
const NOE_EMAIL = 'noe.p@seed.encre-et-plume.local';
const MC2_SPARSE_EMAIL = 'mc2.sansprofil@seed.encre-et-plume.local'; // owns no calls — empty state

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

const rows = (page: Page) => page.locator('.ep-candidature-row');
const rowByApplicant = (page: Page, name: string) => rows(page).filter({ hasText: name });

async function gotoReceived(page: Page) {
  await page.goto('/candidatures-recues');
  await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({
    timeout: 10_000,
  });
}

// §8 — OnBrandSelect is a combobox listbox (no native <select>): open the trigger, click the option.
async function selectCall(page: Page, optionLabel: string) {
  await page.getByRole('combobox', { name: "Choisir l'appel" }).click();
  await page.getByRole('option', { name: optionLabel }).click();
}

test.describe('MC-7 "Mes appels à projets" — signed in as the call owner (mc7-appels-fixture)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, MC7_OWNER_EMAIL);
  });

  test('MC7-E1: avatar menu entry navigates to the renamed page; selector + count badge + 3 replica rows render', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /menu de testeur appels/i }).click();
    // Regex, not exact match: the menuitem's accessible name also folds in the "N demandes en
    // attente" CountBadge (this owner has 3 pending/received applications), so it isn't exactly
    // "Mes appels à projets".
    const item = page.getByRole('menuitem', { name: /mes appels à projets/i });
    await expect(item).toHaveAttribute('href', '/candidatures-recues');
    await item.click();

    await expect(page).toHaveURL('/candidatures-recues');
    await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('link', { name: '‹ Appels' })).toBeVisible();

    // Selector row (proto line 2185) — single-call OnBrandSelect combobox + accent count badge,
    // NOT a stacked grouped-heading list.
    await expect(page.getByText('Pour votre appel :')).toBeVisible();
    const combobox = page.getByRole('combobox', { name: "Choisir l'appel" });
    // OnBrandSelect's trigger appends a decorative "▾" affordance glyph in its own aria-hidden span
    // (component-wide behaviour, not MC-7-specific) — match the label as a substring, not full text.
    await expect(combobox).toHaveText(/« Polar nocturne »/);
    await expect(page.getByText('3 candidatures')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voir l\'appel « Polar nocturne »' })).toBeVisible();
    await expect(rows(page)).toHaveCount(3);

    // Léa B. — pending, has a message, image sample, circular avatar row, accent role chip,
    // separate "Voir le profil" button (name itself is plain, not a link), named actions.
    const lea = rowByApplicant(page, 'Léa B.');
    await expect(lea.getByText(/Scénariste/)).toBeVisible();
    await expect(lea.getByText(/Vos ambiances nocturnes/)).toBeVisible();
    // exact:true — Playwright's default name match is substring, and the sample link's own
    // accessible name ("Voir l'échantillon de Léa B.") contains "Léa B." too.
    await expect(lea.getByRole('link', { name: 'Léa B.', exact: true })).toHaveCount(0); // name is plain bold, not a link
    const profileLink = lea.getByRole('link', { name: 'Voir le profil' });
    await expect(profileLink).toHaveAttribute('href', '/mc1-lea-b');
    const leaSample = lea.getByRole('link', { name: "Voir l'échantillon de Léa B." });
    await expect(leaSample).toBeVisible();
    await expect(leaSample).toHaveAttribute('target', '_blank');
    const acceptBtn = lea.getByRole('button', { name: 'Accepter la candidature de Léa B.' });
    const rejectBtn = lea.getByRole('button', { name: 'Refuser la candidature de Léa B.' });
    await expect(acceptBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();
    // Colour semantic (round-2 fix #1): Accepter is GREEN #1f8a5b, Refuser is accent RED.
    await expect(acceptBtn).toHaveCSS('background-color', 'rgb(31, 138, 91)');
    const refuserBg = await rejectBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const accentBg = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim());
    // var(--accent) resolves; compare against the CSS custom property's own computed colour.
    const probe = await page.evaluate((v) => {
      const d = document.createElement('div');
      d.style.backgroundColor = v;
      document.body.appendChild(d);
      const c = getComputedStyle(d).backgroundColor;
      d.remove();
      return c;
    }, accentBg);
    expect(refuserBg).toBe(probe);

    // Noé P. — pending, empty message (no quoted block rendered).
    const noe = rowByApplicant(page, 'Noé P.');
    await expect(noe.locator('p')).toHaveCount(0); // the message block only renders when non-empty

    // Diego S. — already resolved on load: badge only, no actions.
    const diego = rowByApplicant(page, 'Diego S.');
    await expect(diego.getByText('✕ Refusée')).toBeVisible();
    await expect(diego.getByRole('button', { name: /Accepter|Refuser/ })).toHaveCount(0);
  });

  test('MC7-E2: "Voir l\'appel" opens the CallDetailModal IN-PAGE (no navigation), closes via Escape/backdrop/Fermer', async ({
    page,
  }) => {
    await gotoReceived(page);
    const trigger = page.getByRole('button', { name: 'Voir l\'appel « Polar nocturne »' });

    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Polar nocturne')).toBeVisible();
    // Stays on /candidatures-recues — no redirect to the /appels board.
    await expect(page).toHaveURL('/candidatures-recues');

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Reopen, close via the "Fermer" button.
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page).toHaveURL('/candidatures-recues');

    // Reopen, close via backdrop click.
    await trigger.click();
    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible();
    // Click well outside the dialog panel (top-left corner of the viewport overlay).
    await page.mouse.click(4, 4);
    await expect(dialog2).not.toBeVisible();
    await expect(page).toHaveURL('/candidatures-recues');
  });

  test('MC7-E2b: the in-page modal is usable at 375px (scroll + close reachable)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoReceived(page);
    await page.getByRole('button', { name: 'Voir l\'appel « Polar nocturne »' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Fermer' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('MC7-E3: responsive — 375px, 768px, 1280px have no horizontal overflow, and pending-row actions stay tappable', async ({
    page,
  }) => {
    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await gotoReceived(page);
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
    }

    // At 375px, the pending row's actions are visible and ≥44px tall (tap-target minimum).
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoReceived(page);
    const acceptBtn = rowByApplicant(page, 'Léa B.').getByRole('button', {
      name: 'Accepter la candidature de Léa B.',
    });
    await expect(acceptBtn).toBeVisible();
    const box = await acceptBtn.boundingBox();
    expect(box && box.height).toBeGreaterThanOrEqual(44);
    // QA evidence — mobile screenshot for the design-fidelity/responsive review.
    await page.screenshot({ path: 'test-results/mc7-candidatures-recues-375px.png', fullPage: true });

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoReceived(page);
    await page.screenshot({ path: 'test-results/mc7-candidatures-recues-768px.png', fullPage: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoReceived(page);
    await page.screenshot({ path: 'test-results/mc7-candidatures-recues-1280px.png', fullPage: true });
  });

  test('MC7-E4: owner-only authz — a non-owner cannot decide an application on this call (404, no existence leak)', async ({
    page,
    browser,
  }) => {
    // Fetch the real application id as the owner (page.request shares the logged-in cookie jar).
    const listRes = await page.request.get(`${API}/me/calls/applications`);
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    const group = body.groups.find((g: { callId: string }) => g.callId === 'mc7-call-nocturne');
    const diegoApp = group.applications.find((a: { applicant: { name: string } }) => a.applicant.name === 'Diego S.');
    expect(diegoApp).toBeTruthy();

    // A different, non-owner account (Diego himself — an applicant, not the call owner) attempts
    // to decide it. Ownership is data-derived server-side (call.authorId), never a client claim.
    const ctx = await browser.newContext();
    try {
      const nonOwnerPage = await ctx.newPage();
      const loginRes = await nonOwnerPage.request.post(`${API}/auth/login`, {
        data: { email: DIEGO_EMAIL, password: PASSWORD },
      });
      expect(loginRes.status()).toBe(200);

      const patchRes = await nonOwnerPage.request.patch(`${API}/applications/${diegoApp.id}`, {
        data: { status: 'accepted' },
      });
      expect(patchRes.status()).toBe(404);
      const errBody = await patchRes.json();
      expect(errBody.message).toContain('introuvable');
    } finally {
      await ctx.close();
    }

    // Unauthenticated attempt is also rejected (401).
    const ctx2 = await browser.newContext();
    try {
      const anonPage = await ctx2.newPage();
      const anonPatch = await anonPage.request.patch(`${API}/applications/${diegoApp.id}`, {
        data: { status: 'accepted' },
      });
      expect(anonPatch.status()).toBe(401);
    } finally {
      await ctx2.close();
    }

    // Validation — as the real owner this time, an out-of-enum status value is rejected (400),
    // case-sensitively (a target we CAN mutate here since it never reaches "pending → decided").
    const leaApp = group.applications.find((a: { applicant: { name: string } }) => a.applicant.name === 'Léa B.');
    const badStatus = await page.request.patch(`${API}/applications/${leaApp.id}`, {
      data: { status: 'ACCEPTED' },
    });
    expect(badStatus.status()).toBe(400);
  });

  test('MC7-E5: accept Léa, reject Noé — badges flip, actions disappear, live region announces, persists across reload', async ({
    page,
  }) => {
    await gotoReceived(page);

    const lea = rowByApplicant(page, 'Léa B.');
    await lea.getByRole('button', { name: 'Accepter la candidature de Léa B.' }).click();
    await expect(lea.getByText('✓ Acceptée')).toBeVisible({ timeout: 10_000 });
    await expect(lea.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('status', { name: /décision/i })).toHaveText('Candidature de Léa B. acceptée.');

    const noe = rowByApplicant(page, 'Noé P.');
    await noe.getByRole('button', { name: 'Refuser la candidature de Noé P.' }).click();
    await expect(noe.getByText('✕ Refusée')).toBeVisible({ timeout: 10_000 });
    await expect(noe.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('status', { name: /décision/i })).toHaveText('Candidature de Noé P. refusée.');

    // Reload — the decisions persisted server-side (order-independent, content-based locators).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(rowByApplicant(page, 'Léa B.').getByText('✓ Acceptée')).toBeVisible();
    await expect(rowByApplicant(page, 'Noé P.').getByText('✕ Refusée')).toBeVisible();
    await expect(rowByApplicant(page, 'Diego S.').getByText('✕ Refusée')).toBeVisible();
    // All 3 rows now resolved — no Accepter/Refuser anywhere on the page.
    await expect(page.getByRole('button', { name: /Accepter la candidature|Refuser la candidature/ })).toHaveCount(0);
  });

  test('MC7-E6: F-5 — the applicant sees a notification with the right copy after each decision, linking to Mes candidatures', async ({
    browser,
  }) => {
    // Runs after MC7-E5 (same file, sequential execution) — Léa is now accepted, Noé rejected.
    const leaCtx = await browser.newContext();
    try {
      const leaPage = await leaCtx.newPage();
      const leaLogin = await leaPage.request.post(`${API}/auth/login`, {
        data: { email: LEA_EMAIL, password: PASSWORD },
      });
      expect(leaLogin.status()).toBe(200);
      await leaPage.goto('/notifications');
      await expect(leaPage.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible({
        timeout: 10_000,
      });
      // .first() — notifications aren't wiped on reseed, so repeated QA/e2e runs can accumulate
      // more than one "accepted" notif for Léa across sessions; the newest (this decision) is what
      // matters, and the inbox lists newest-first.
      const leaNotif = leaPage.getByRole('button', { name: /a accepté votre candidature/i }).first();
      await expect(leaNotif).toBeVisible();
      await leaNotif.click();
      await expect(leaPage).toHaveURL('/mes-candidatures');
    } finally {
      await leaCtx.close();
    }

    const noeCtx = await browser.newContext();
    try {
      const noePage = await noeCtx.newPage();
      const noeLogin = await noePage.request.post(`${API}/auth/login`, {
        data: { email: NOE_EMAIL, password: PASSWORD },
      });
      expect(noeLogin.status()).toBe(200);
      await noePage.goto('/notifications');
      await expect(noePage.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible({
        timeout: 10_000,
      });
      const noeNotif = noePage.getByRole('button', { name: /n'a pas retenu votre candidature/i }).first();
      await expect(noeNotif).toBeVisible();
      await noeNotif.click();
      await expect(noePage).toHaveURL('/mes-candidatures');
    } finally {
      await noeCtx.close();
    }
  });

  test('MC7-E7: error state on load + "Réessayer" retries and succeeds', async ({ page }) => {
    let calls = 0;
    await page.route(`${API}/me/calls/applications`, (route) => {
      calls += 1;
      if (calls === 1) return route.fulfill({ status: 500, json: { message: 'boom' } });
      return route.continue();
    });

    await page.goto('/candidatures-recues');
    await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    // filter(hasText) — role="alert" also matches Next.js's own empty route-announcer div.
    // toContainText, not toHaveText — the alert div also wraps the "Réessayer" button text.
    const alert = page.getByRole('alert').filter({ hasText: 'Impossible de charger' });
    await expect(alert).toContainText('Impossible de charger les candidatures reçues.');

    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('« Polar nocturne »')).toBeVisible({ timeout: 10_000 });
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------------------------
  // Round 3 — call edit / delete + CallDetailModal contrast. Kept LAST in the file (plan §9.4):
  // MC7-E11's 409 case depends on MC7-E5 (above) having already accepted Léa on « Polar nocturne ».
  // ---------------------------------------------------------------------------------------------

  const BROUILLON_TITLE = "Brouillon d'été";
  const BROUILLON_RENAMED = "Brouillon d'été (modifié)";

  test("MC7-E10: owner edits « Brouillon d'été » via Voir l'appel → Éditer — pre-filled form, saved title reflected in the modal + selector", async ({
    page,
  }) => {
    await gotoReceived(page);
    await selectCall(page, `« ${BROUILLON_TITLE} »`);
    await expect(page.getByText('1 candidature', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Voir l'appel « ${BROUILLON_TITLE} »` }).click();
    const detail = page.getByRole('dialog').first();
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: BROUILLON_TITLE, level: 2 })).toBeVisible();
    // Non-owner controls absent on this owner's own call; owner sees Éditer + Supprimer, no Clôturé
    // badge (the call is open).
    await expect(detail.getByRole('button', { name: 'Éditer' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Supprimer' })).toBeVisible();

    await detail.getByRole('button', { name: 'Éditer' }).click();
    const editDialog = page.getByRole('dialog', { name: "Modifier l'appel" });
    await expect(editDialog).toBeVisible();

    // Pre-filled from the existing call.
    const titleInput = editDialog.getByLabel('Titre');
    await expect(titleInput).toHaveValue(BROUILLON_TITLE);
    await expect(editDialog.getByLabel('Description')).not.toHaveValue('');
    // Media/project not editable in edit mode (D13 note).
    await expect(
      editDialog.getByText('Les visuels, les documents et le projet lié ne sont pas modifiables.'),
    ).toBeVisible();
    await expect(editDialog.getByLabel('Lier à un projet')).toHaveCount(0);
    // QA evidence — pre-filled edit form for the design-fidelity/round-3 review.
    await page.screenshot({ path: 'test-results/mc7-edit-modal-prefilled.png', fullPage: true });

    await titleInput.fill(BROUILLON_RENAMED);
    await editDialog.getByRole('button', { name: 'Enregistrer' }).click();

    // Edit dialog closes; the underlying detail modal refetches and shows the new title.
    await expect(editDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(detail.getByRole('heading', { level: 2 })).toHaveText(BROUILLON_RENAMED, { timeout: 10_000 });
    // getByText, not getByRole('button', {name:'Fermer'}) — the dialog ALSO has an icon-only header
    // close button with the same accessible name ("Fermer" via aria-label, no text content), which
    // makes the role-based query ambiguous (2 matches). getByText only matches rendered text, i.e.
    // the footer's labelled button.
    await detail.getByText('Fermer', { exact: true }).click();
    await expect(detail).not.toBeVisible();

    // The MC-7 selector option reflects the new title too (host refetch via onChanged).
    // toContainText (substring), not toHaveText — OnBrandSelect's trigger appends a decorative "▾"
    // affordance glyph in its own sibling span (see MC7-E1's comment on the same combobox).
    await expect(page.getByRole('combobox', { name: "Choisir l'appel" })).toContainText(
      `« ${BROUILLON_RENAMED} »`,
    );
    await expect(page).toHaveURL('/candidatures-recues');
  });

  test('MC7-E11: 409 refuses deleting a call with an accepted application; owner deletes « Brouillon d\'été » via the inline on-brand confirm (no window.confirm)', async ({
    page,
  }) => {
    await gotoReceived(page);

    // « Polar nocturne » is the default selection and — thanks to MC7-E5 above — now has an
    // ACCEPTED application (Léa). Deleting it must be refused server-side (409), call left intact.
    await page.getByRole('button', { name: 'Voir l\'appel « Polar nocturne »' }).click();
    let detail = page.getByRole('dialog').first();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Supprimer' }).click();
    let confirmGroup = detail.getByRole('group', { name: "Confirmer la suppression de l'appel" });
    await expect(confirmGroup).toBeVisible();
    await confirmGroup.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await expect(detail.getByRole('alert')).toContainText('Impossible de supprimer');
    await expect(detail.getByRole('alert')).toContainText('Clôturez l’appel plutôt.');
    await detail.getByRole('button', { name: 'Annuler' }).click();
    // getByText, not getByRole('button', {name:'Fermer'}) — see the note in MC7-E10 (the header's
    // icon-only close button shares the "Fermer" accessible name).
    await detail.getByText('Fermer', { exact: true }).click();
    await expect(detail).not.toBeVisible();
    // Still selectable — not deleted.
    await expect(page.getByRole('combobox', { name: "Choisir l'appel" })).toHaveText(/« Polar nocturne »/);

    // Now the successful path — the round-3 fixture (title from MC7-E10, zero accepted applications).
    await selectCall(page, `« ${BROUILLON_RENAMED} »`);
    await page.getByRole('button', { name: `Voir l'appel « ${BROUILLON_RENAMED} »` }).click();
    detail = page.getByRole('dialog').first();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Supprimer' }).click();
    confirmGroup = detail.getByRole('group', { name: "Confirmer la suppression de l'appel" });
    await expect(confirmGroup).toBeVisible();
    // QA evidence — the inline on-brand delete confirm (no window.confirm) for the round-3 review.
    await page.screenshot({ path: 'test-results/mc7-delete-confirm.png', fullPage: true });

    // Annuler backs out WITHOUT calling the API — the call is still there afterwards.
    await confirmGroup.getByRole('button', { name: 'Annuler' }).click();
    await expect(confirmGroup).toHaveCount(0);
    await expect(detail).toBeVisible();

    // Confirm — 204, modal closes, call disappears from the selector, "Polar nocturne" remains.
    await detail.getByRole('button', { name: 'Supprimer' }).click();
    await detail.getByRole('group', { name: "Confirmer la suppression de l'appel" }).getByRole('button', {
      name: 'Confirmer la suppression',
    }).click();
    await expect(detail).not.toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL('/candidatures-recues');
    // Selection falls back to the only remaining call.
    await expect(page.getByRole('combobox', { name: "Choisir l'appel" })).toHaveText(/« Polar nocturne »/);
    // The deleted call is gone from the options list entirely (open the popover to check — options
    // only render in the DOM while OnBrandSelect is open).
    await page.getByRole('combobox', { name: "Choisir l'appel" }).click();
    await expect(page.getByRole('option', { name: `« ${BROUILLON_RENAMED} »` })).toHaveCount(0);
    await expect(page.getByRole('option')).toHaveCount(1);
  });

  test('MC7-E12: CallDetailModal contrast fix — section headings + header eyebrow render ink, not washed ink2', async ({
    page,
  }) => {
    await gotoReceived(page);
    await page.getByRole('button', { name: 'Voir l\'appel « Polar nocturne »' }).click();
    const detail = page.getByRole('dialog').first();
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Détail de l'appel")).toHaveCSS('color', 'rgb(22, 19, 15)');
    await expect(detail.getByText('Postes', { exact: true })).toHaveCSS('color', 'rgb(22, 19, 15)');
  });
});

test('MC7-E8: empty state for an owner with zero received calls — copy + "Appels à projets" link', async ({
  page,
}) => {
  await login(page, MC2_SPARSE_EMAIL);
  await gotoReceived(page);
  await expect(page.getByText('Aucune candidature reçue pour le moment.')).toBeVisible();
  const link = page.getByRole('link', { name: 'Appels à projets' });
  await expect(link).toHaveAttribute('href', '/appels');
  await link.click();
  await expect(page).toHaveURL('/appels');
});

test('MC7-E9: logged-out visit to /candidatures-recues shows the connect prompt', async ({ page }) => {
  await page.goto('/candidatures-recues');
  await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible();
  await expect(page.getByText('Connectez-vous pour consulter les candidatures reçues sur vos appels.')).toBeVisible();
  // Scoped to <main> — the header also has its own "Se connecter" link (logged-out state).
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
    'href',
    '/connexion?redirect=/candidatures-recues',
  );
});
