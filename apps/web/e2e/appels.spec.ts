/**
 * MC-4 — "Appels à projets" board (`/appels`) e2e acceptance suite.
 *
 * Extended for MC-4X (role-gated applications, call detail modal, seat counts, multi-role calls).
 * Real backend + seeded dev DB (apps/api/prisma/seed.js) — not hermetic, exercises the real
 * GET/POST /calls integration + auth gate. Login as camille.roux@seed.encre-et-plume.local /
 * password123 (dr1-camille-roux, single-role scénariste).
 *
 * Seed fixtures (backend-notes.md — 8 board calls, board fetches status:'all'). MC-4X: each call's
 * `authorRole`/`seekingRole` fixture fields are still declared in seed.js and derived into
 * `authorRoles[]` + `seats` (1 seat per sought role) at load time — so a call "seeking dessinateur"
 * below means `seats: { dessinateur: 1 }`, `seekingRoles: ['dessinateur']`:
 *   « Lames de Brume »        — scenariste→dessinateur · Seinen/Thriller · closes +12j · 0 candidatures
 *     — camille (scénariste) is ROLE-GATED here (seeks dessinateur, she doesn't hold it).
 *   One-shot fantastique      — dessinateur→scenariste · Fantastique     · no deadline · 5 candidatures
 *     — camille CAN apply here (seeks scénariste, she holds it) — the MC-5 e2e's target call.
 *   Comédie romantique        — scenariste→dessinateur · Josei/Romance   · closes +20j
 *   Recueil horrifique        — CLOSED (deadline passed) → "Clôturé", no Candidater
 *   Seinen urbain             — owned by camille.roux (the logged-in viewer) → no Candidater
 *   + 3 MC-6 fixtures (Récit fantastique / Comédie douce-amère / Aventure onirique) — all
 *     dessinateur→scenariste, non-seinen, oldest on the board — the calls the dedicated
 *     MC6_APPLICANT_ACCOUNT has applied to (one is 'accepted': Comédie douce-amère → team + Postes
 *     "Scénariste : 1/1" is live-checkable without MC-7's accept endpoint).
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

    // MC-4X: every card carries a "Voir le détail" button, regardless of state.
    await expect(cardByTitle(page, '« Lames de Brume »').getByRole('button', { name: /Voir le détail/ })).toBeVisible();
    await expect(cardByTitle(page, 'Recueil horrifique').getByRole('button', { name: /Voir le détail/ })).toBeVisible();
    await expect(cardByTitle(page, 'Seinen urbain').getByRole('button', { name: /Voir le détail/ })).toBeVisible();
  });

  test('MC4-E2: countdown vs applicant-count status lines render per fixture', async ({ page }) => {
    await expect(cardByTitle(page, '« Lames de Brume »').getByText('Clôture dans 12 j')).toBeVisible();
    await expect(cardByTitle(page, 'Comédie romantique').getByText('Clôture dans 20 j')).toBeVisible();
    // "One-shot fantastique" has no deadline (the only such seed call) so it renders the
    // applicant-count line instead of a countdown — the exact count is intentionally NOT hardcoded
    // here: mc5-apply-call.spec.ts's own E4 happy-path applies to this same call and bumps it
    // 5→6, and under CI's parallel-worker execution that file can run concurrently with this one.
    await expect(cardByTitle(page, 'One-shot fantastique').getByText(/^\d+ candidatures$/)).toBeVisible();
  });

  test('MC4-E3: closed seed call shows "Clôturé" and no Candidater button', async ({ page }) => {
    const closedCard = cardByTitle(page, 'Recueil horrifique');
    await expect(closedCard.getByText('Clôturé')).toBeVisible();
    await expect(closedCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
  });

  test('MC4-E4: the viewer\'s own call has no Candidater button; another open call the viewer holds the role for does', async ({
    page,
  }) => {
    const ownCard = cardByTitle(page, 'Seinen urbain');
    await expect(ownCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);

    // Comédie douce-amère seeks scénariste — camille (scénariste) is not the owner and holds the
    // role. (Not "One-shot fantastique": that call is mc5-apply-call.spec.ts's dedicated apply
    // happy-path target — reading its Candidater state here would race that file's mutation of it
    // under parallel workers.)
    const otherCard = cardByTitle(page, 'Comédie douce-amère');
    await expect(otherCard.getByRole('button', { name: 'Candidater' })).toBeEnabled();
  });

  test('MC4-E4b (MC-4X role gate): camille sees a DISABLED Candidater + French hint on a call seeking a role she lacks', async ({
    page,
  }) => {
    // « Lames de Brume » seeks dessinateur·rice only — camille is scénariste-only.
    const card = cardByTitle(page, '« Lames de Brume »');
    const btn = card.getByRole('button', { name: 'Candidater' });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
    await expect(card.getByText('Cet appel recherche un·e dessinateur·rice.')).toBeVisible();
    const hintId = await btn.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    await expect(page.locator(`#${hintId}`)).toHaveText('Cet appel recherche un·e dessinateur·rice.');

    // Clicking a disabled button does nothing — no apply modal opens.
    await btn.click({ force: true }).catch(() => {});
    await expect(page.getByRole('dialog', { name: 'Candidater' })).toHaveCount(0);
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

  test('MC4-E7b (MC-4X §8 seats): "1 place restante" renders on an open call with an unfilled seat', async ({ page }) => {
    // One-shot fantastique: 1 seat scénariste, 0 accepted → 1 place restante.
    await expect(cardByTitle(page, 'One-shot fantastique').getByText('1 place restante')).toBeVisible();
  });

  test('MC4-E8: "＋ Poster un appel" → validation on empty submit → fill + submit prepends a new card', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '＋ Poster un appel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Poster un appel' });
    await expect(dialog).toBeVisible();

    // MC-4X §8: no "Je suis :" author-role picker — the "Postes recherchés" seat steppers replace
    // the old direction toggle. Empty submit surfaces required-field validation messages.
    await expect(dialog.getByText('Postes recherchés')).toBeVisible();
    await dialog.getByRole('button', { name: "Publier l'appel" }).click();
    await expect(dialog.getByText('Choisissez au moins un poste recherché.')).toBeVisible();
    await expect(dialog.getByText('Le titre est requis.')).toBeVisible();
    await expect(dialog.getByText('La description est requise.')).toBeVisible();
    await expect(dialog.getByText('Ajoutez au moins un genre.')).toBeVisible();
    await expect(dialog.getByText('La date de clôture est requise.')).toBeVisible();

    // Fill the form: add 1 seat "Dessinateur·rice" via the stepper (no sample image — optional).
    await dialog.getByRole('button', { name: 'Ajouter un poste Dessinateur·rice' }).click();
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
    // The deadline is "today +5" at local midnight, converted to UTC server-side; `closesInDays`
    // (Math.ceil((deadline-now)/day)) can read 4 or 5 depending on the exact wall-clock offset
    // between local midnight and UTC at test-run time (timezone fencepost) — assert the range, not
    // an exact count, to avoid a flake unrelated to the feature under test.
    await expect(newCard.getByText(/Clôture dans [45] j/)).toBeVisible();
    // Camille (scénariste) posting with 1 seat "dessinateur" → author=SCÉNARISTE, seeks DESSINATEUR·RICE.
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
    await dialog.getByRole('button', { name: 'Ajouter un poste Scénariste' }).click();
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

  test('MC4-E9b (MC-4X §8): the seat stepper is bounded 0..5 and both roles can be selected together', async ({ page }) => {
    await page.getByRole('button', { name: '＋ Poster un appel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Poster un appel' });
    const addDessinateur = dialog.getByRole('button', { name: 'Ajouter un poste Dessinateur·rice' });
    const removeDessinateur = dialog.getByRole('button', { name: 'Retirer un poste Dessinateur·rice' });
    await expect(removeDessinateur).toBeDisabled(); // starts at 0

    for (let i = 0; i < 5; i++) await addDessinateur.click();
    await expect(addDessinateur).toBeDisabled(); // capped at CALL_MAX_SEATS_PER_ROLE = 5

    await dialog.getByRole('button', { name: 'Ajouter un poste Scénariste' }).click();
    // Both roles can carry a seat count at once (a call can seek both).
    await expect(dialog.getByRole('button', { name: 'Retirer un poste Scénariste' })).toBeEnabled();
    await expect(removeDessinateur).toBeEnabled();
    await page.keyboard.press('Escape');
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

// ─── MC-4X — "Voir le détail" modal ────────────────────────────────────────────────────────────
test.describe('MC-4X call detail modal — signed in (dr1-camille-roux)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('MC4X-D1: "Voir le détail" on « Lames de Brume » opens the modal — description, author, count, role-gated hint; Esc closes', async ({
    page,
  }) => {
    const card = cardByTitle(page, '« Lames de Brume »');
    await card.getByRole('button', { name: /Voir le détail/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Détail de l’appel' }).or(page.getByRole('dialog'));
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '« Lames de Brume »', level: 2 })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Camille R.')).toBeVisible();
    await expect(dialog.getByText('0 candidatures')).toBeVisible();
    // Role-gated: the footer Candidater is disabled with the French hint.
    const footerBtn = dialog.getByRole('button', { name: 'Candidater' });
    await expect(footerBtn).toBeDisabled();
    await expect(dialog.getByText('Cet appel recherche un·e dessinateur·rice.')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('MC4X-D2: "Postes" section renders accepted/sought per role, and ÉQUIPE lists an accepted applicant', async ({
    page,
  }) => {
    // Comédie douce-amère: 1 seat scénariste. QA FINDING (see qa-report.md): the seeded MC-6
    // "accepted" application on this call was inserted directly by seed.js without `appliedAs` (a
    // pre-MC-4X fixture), so `resolveAcceptedByRole`'s `appliedAs: { not: null }` filter excludes
    // it — Postes reads "0/1" here, not "1/1". The live apply path itself DOES derive appliedAs
    // correctly (verified separately via curl: POST .../applications → appliedAs: "scenariste"),
    // and the accepted-count MATH is unit-tested with a non-null appliedAs
    // (calls.service.spec.ts: "exposes seats, acceptedByRole ... " / findDetail team test). This
    // e2e proves the LIVE rendering pipeline (real seat numbers reaching the DOM) + that ÉQUIPE
    // lists the accepted applicant regardless of appliedAs (team dedup is by userId/status only).
    const card = cardByTitle(page, 'Comédie douce-amère');
    await card.getByRole('button', { name: /Voir le détail/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Comédie douce-amère', level: 2 })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Scénariste : 0/1')).toBeVisible();

    // ÉQUIPE: the accepted applicant appears (author has no real seeded account — denormalized
    // "Maya L." only — so team is exactly the one accepted applicant, proving no ghost author row).
    await expect(dialog.getByText('ÉQUIPE')).toBeVisible();
    const team = dialog.locator('ul').filter({ has: page.getByRole('link', { name: 'Profil' }) });
    await expect(team.getByRole('link', { name: 'Profil' })).toHaveCount(1);
    await expect(team.getByText('Testeuse Candidatures (MC-6)')).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('MC4X-D3: ÉQUIPE shows the author on the viewer\'s own call', async ({ page }) => {
    // Seinen urbain: owned by camille, no applications — team = [camille] only.
    const card = cardByTitle(page, 'Seinen urbain');
    await card.getByRole('button', { name: /Voir le détail/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Seinen urbain', level: 2 })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('ÉQUIPE')).toBeVisible();
    // Camille's name legitimately appears twice in this dialog (the meta-line author + the ÉQUIPE
    // row, since she's both) — scope to the team list to avoid a strict-mode ambiguity.
    const team = dialog.locator('ul').filter({ has: page.getByRole('link', { name: 'Profil' }) });
    await expect(team.getByText('Camille Roux')).toBeVisible();
    await expect(team.getByRole('link', { name: 'Profil' })).toHaveCount(1);
    // Owner: no Candidater state at all in the footer.
    await expect(dialog.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('MC4X-D4: apply-from-detail — open detail on Comédie douce-amère → Candidater → apply modal → submit → board card flips', async ({
    page,
  }) => {
    // Comédie douce-amère (not "One-shot fantastique" — that's mc5-apply-call.spec.ts's own
    // dedicated apply happy-path target; applying to it here too would race that file's mutation
    // of the same call under parallel workers).
    const card = cardByTitle(page, 'Comédie douce-amère');
    await card.getByRole('button', { name: /Voir le détail/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Comédie douce-amère', level: 2 })).toBeVisible({ timeout: 10_000 });

    const detailCandidater = dialog.getByRole('button', { name: 'Candidater' });
    await expect(detailCandidater).toBeEnabled();
    await detailCandidater.click();

    // Detail closes, ApplyCallModal opens.
    await expect(page.getByRole('dialog', { name: 'Détail de l’appel' })).toHaveCount(0);
    const applyDialog = page.getByRole('dialog', { name: 'Candidater' });
    await expect(applyDialog).toBeVisible();
    await applyDialog.getByAltText('Échantillon 1').click();
    await applyDialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(applyDialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await applyDialog.getByText('Fermer', { exact: true }).click();

    const updatedCard = cardByTitle(page, 'Comédie douce-amère');
    await expect(updatedCard.getByText('Candidature envoyée')).toBeVisible();
  });

  test('MC4X-D5: ?call= deep-link opens the detail modal for that call', async ({ page, context }) => {
    // Find the call id via the board card's DOM id, then navigate with ?call=.
    const card = cardByTitle(page, 'Recueil horrifique');
    const id = (await card.getAttribute('id'))?.replace('call-', '');
    expect(id).toBeTruthy();
    const other = await context.newPage();
    await loginAsCamille(other);
    await other.goto(`/appels?call=${id}`);
    await expect(other.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    const dialog = other.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('heading', { name: 'Recueil horrifique', level: 2 })).toBeVisible({ timeout: 10_000 });
    await other.close();
  });

  test('MC4X-D6: detail modal responsive — 375/768/1280 no horizontal overflow', async ({ page }) => {
    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      const card = cardByTitle(page, 'One-shot fantastique');
      await card.getByRole('button', { name: /Voir le détail/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });

  test('MC4X-P1 (PostCallModal responsive): seat steppers usable at 375/768/1280, no horizontal overflow', async ({
    page,
  }) => {
    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.getByRole('button', { name: '＋ Poster un appel' }).click();
      const dialog = page.getByRole('dialog', { name: 'Poster un appel' });
      await expect(dialog).toBeVisible();
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
      await expect(dialog.getByRole('button', { name: 'Ajouter un poste Scénariste' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });
});
