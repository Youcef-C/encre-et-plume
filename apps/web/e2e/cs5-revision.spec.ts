/**
 * CS-5 — "Révision & corrections" — scoped e2e acceptance suite (iteration 4/5 rework).
 *
 * r4 (scope reversal, Option B): the revision page is DESSIN-ONLY — no Scénario/Dessin toggle, no
 * scenario two-pane diff, no scenario rows in the list. Scenario corrections are filed AND managed
 * (status stepper) in the CS-4 EDITOR as tagged pinned comments; that flow is covered in
 * `cs4-editeur.spec.ts`. Here we only need ONE scenario correction (filed via the editor) to prove the
 * cross-type "Valider les modifications" gate — it must still block on ALL corrections, scenario AND
 * dessin, per r4's explicit requirement.
 *
 * r5 (UI polish): the dessin frame hugs the fitted image and the whole surface fits without scrolling;
 * correction cards are restyled on-brand; a drawn draft box is movable (pointer drag + arrow-key nudge)
 * before submission.
 *
 * r6 (UI + 2 features): (A1) the "＋ Nouvelle correction" TOGGLE is gone — the draw-a-box composer is
 * ALWAYS active; (A2) no "Type" row in the composer (dessin is the only type); (A3) the composer
 * textarea is white (--card); (A4) the dessin correction list carries a status stepper (already existed,
 * now restyled with a status stripe/pill); (A5) a "＋ Nouvelle version du dessin" upload refreshes the
 * old↔new compare; (B6) the delete-confirmation "Supprimer" button uses the on-brand accent red.
 *
 * CI fix (2026-07-15): this spec used to reuse the `e2e-cs2-multi` fixture project, ALSO shared by
 * `cs2-card-modal.spec.ts` and `cs4-editeur.spec.ts`. Under CI's file-level parallelism (workers:2), two
 * of those specs could run CONCURRENTLY against the SAME kanban board, each mutating it (adding "Page
 * N" cards, importing files) while another read it — duplicate/contended DOM elements → strict-mode
 * "resolved to 2 elements" failures in ALL THREE specs' setup (reproduced live: 6 failures under
 * `--workers=2 --repeat-each=2` across cs2/cs4/cs5). Fix: this spec now runs against its OWN dedicated
 * fixture project (`e2e-cs5-review`, `e2e-seed.js`) that no other spec touches — never a shared mutable
 * board, so cross-spec parallelism can't contend on it. Same shape as e2e-cs2-multi (owner = CS12
 * scénariste, a second real member = CS12 dessinateur) so the authz-negative checks (forged status
 * change by a member who is neither author nor assignee; validate by a true non-member) are unchanged.
 *
 * Hermeticity traps heeded (repo memory): kill a stale API on :3001 + flush `rl:*` before running.
 * Split-test convention (CLAUDE.md): this spec + the auth/nav smoke only, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com'; // scénariste, owner of e2e-cs5-review — files every correction
const COLLAB_EMAIL = 'qa_e2e_cs12_collab@test.com'; // dessinateur, a REAL member — neither author nor assignee
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com'; // signed-in, NOT a project member
const MULTI_SLUG = 'e2e-cs5-review'; // this spec's OWN dedicated fixture — never shared with another spec
const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

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

function noVerticalOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight + 1);
}

// CI retry-hardening: `e2e-cs5-review` (this spec's own dedicated fixture, never shared with another
// spec — see the file header) is still only reset by e2e-seed.js ONCE at suite start, never between a
// Playwright RETRY of this whole serial block. A failed attempt's `addCard` calls already created
// "Page 1"/"Page 2" before the failure — without this reset, the retry's `addCard` would create a
// SECOND "Page 2" card, and `scenarioCol.getByText('Page 2', { exact: true })` (and every downstream
// `kanbanCard` lookup) would resolve to 2 elements → a strict-mode violation, not a real bug. Delete any
// pre-existing card with this exact title FIRST (looping — a card could exist 0, 1, or more times if
// several retries stacked before this fix existed) so every attempt — first try or retry — starts from
// the same clean slate. Cheap and safe even with nothing to delete (loop runs 0 times).
async function resetCard(page: Page, title: string): Promise<void> {
  const scenarioCol = page.getByRole('group').filter({ hasText: /^Scénario/ });
  while ((await scenarioCol.getByText(title, { exact: true }).count()) > 0) {
    await kanbanCard(page, title).first().click();
    const cardModal = page.getByRole('dialog', { name: title });
    await expect(cardModal).toBeVisible({ timeout: 10_000 });
    await cardModal.getByRole('button', { name: 'Supprimer la carte' }).click();
    // ConfirmDialog portals to <body> (a sibling of the card modal's own portal target, not a DOM
    // descendant of it) — scope to the page, not to `cardModal`.
    await page.getByRole('alertdialog', { name: 'Supprimer la carte ?' }).getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect(cardModal).toHaveCount(0, { timeout: 10_000 });
  }
}

/**
 * R2-1 (CS-7): a card needs a chapter first. On a chapterless board the R2-3 empty state REPLACES
 * the board (no « ＋ Ajouter une carte » at all), so create one before adding cards.
 */
async function ensureChapter(page: Page) {
  const add = page.getByRole('button', { name: '＋ Ajouter une carte' }).first();
  const cta = page.getByRole('button', { name: 'Créer un chapitre' });
  await expect(add.or(cta).first()).toBeVisible({ timeout: 15_000 });
  if (await add.isVisible().catch(() => false)) return;
  await cta.click();
  await expect(add).toBeVisible({ timeout: 8_000 });
}

async function addCard(page: Page, index: number): Promise<string> {
  const title = `Page ${index}`;
  const scenarioCol = page.getByRole('group').filter({ hasText: /^Scénario/ });
  await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
  await expect(scenarioCol.getByText(title, { exact: true })).toBeVisible({ timeout: 10_000 });
  return title;
}

// `.first()` — a defensive backstop: even if a duplicate ever slipped through (e.g. some OTHER spec
// file sharing this fixture project left a stray card), any locator built on top of `kanbanCard` stays
// single-element instead of hitting Playwright's strict-mode violation.
function kanbanCard(page: Page, title: string) {
  return page.locator('div[draggable="true"]').filter({ hasText: title }).first();
}

function caseBlock(page: Page, no: number) {
  return page.locator(`[data-case-block][data-case-no="${no}"]`);
}

function assetCard(page: Page, filename: string) {
  return page.locator('[data-asset-card]').filter({ hasText: filename });
}

async function typeIntoCase(page: Page, no: number, text: string) {
  const para = caseBlock(page, no).locator('[data-case-description] p').first();
  const box = await para.boundingBox();
  if (box) await para.click({ position: { x: box.width - 2, y: box.height - 2 } });
  else await para.click();
  await page.keyboard.type(text, { delay: 20 });
}

// CS-21 — there is no « Enregistrer » button any more: the client compacts ~5s after the last edit
// (and on hide/unmount). Wait for THAT request to land rather than pressing anything.
async function saveDoc(page: Page) {
  await page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && /\/pages\/[^/]+\/document/.test(r.url()) && r.ok(),
    { timeout: 20_000 },
  );
  await expect(page.getByText('Enregistré', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function pageIdOf(page: Page, title: string): Promise<string> {
  const href = await kanbanCard(page, title).getByRole('link', { name: 'Éditer le scénario' }).getAttribute('href');
  return href!.split('/editeur/')[1]!;
}

test.describe('CS-5 Révision & corrections (dessin-only, r4/r5)', () => {
  test.describe.configure({ mode: 'serial' });

  let pageId1 = ''; // "Page 1" — the main test card (scenario correction via editor + dessin corrections)
  let pageId2 = ''; // "Page 2" — an untouched card (empty list state)

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}`);
    await ensureChapter(page);
    // CI retry-hardening (see `resetCard`) — always start from zero "Page 1"/"Page 2" cards, whether
    // this is the first attempt or a Playwright retry of this whole serial block after a prior failure.
    await resetCard(page, 'Page 1');
    await resetCard(page, 'Page 2');
    await addCard(page, 1);
    await addCard(page, 2);
    pageId1 = await pageIdOf(page, 'Page 1');
    pageId2 = await pageIdOf(page, 'Page 2');

    // Page 1: materialize a v1 scenario document (so a scenario correction can be filed from the editor).
    await page.goto(`/projet/${MULTI_SLUG}/editeur/${pageId1}`);
    await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await typeIntoCase(page, 1, "Rin pénètre dans le sanctuaire abandonné, noyé d'ombre.");
    await saveDoc(page);
    await expect(page.getByText('v1')).toBeVisible({ timeout: 10_000 });

    // Page 1: attach a dessin (image) asset so the Dessin surface has something to annotate.
    await page.goto(`/projet/${MULTI_SLUG}?tab=fichiers`);
    await page.getByLabel('Importer des fichiers').setInputFiles(IMAGE_FIXTURE);
    await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible({ timeout: 30_000 });
    await assetCard(page, 'avatar-50x50.jpg').getByRole('button', { name: /Lier avatar-50x50\.jpg à une carte/ }).click();
    const linkDialog = page.getByRole('dialog');
    await linkDialog.getByRole('button', { name: /Page 1/ }).click();
    await expect(linkDialog.getByRole('button', { name: /Page 1/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await linkDialog.getByRole('button', { name: 'Terminé' }).click();

    // Page 1: move the kanban card into the "Corrections" stage (validate() 409s on any other stage).
    await page.goto(`/projet/${MULTI_SLUG}`);
    const card = kanbanCard(page, 'Page 1');
    await card.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
    // The board renders the move OPTIMISTICALLY, so the card appears under Corrections before
    // `PATCH /pages/:id/stage` has committed — and the card modal opened right below re-reads the card
    // with `GET /pages/:id`. Without waiting for the PATCH's response that read can still return the
    // pre-move row, and « Voir les corrections → » (stage-gated) is legitimately absent. Wait for the
    // write, not for the optimistic paint.
    const stagePatch = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/pages\/[^/]+\/stage$/.test(new URL(r.url()).pathname),
    );
    await page.getByRole('menuitem', { name: 'Corrections' }).click();
    await stagePatch;
    await expect(kanbanCard(page, 'Page 1')).toBeVisible({ timeout: 10_000 });

    // CS-2 entry point: the kanban CardModal's "Voir les corrections →" link.
    await kanbanCard(page, 'Page 1').click();
    const cardModal = page.getByRole('dialog', { name: 'Page 1' });
    await expect(cardModal).toBeVisible({ timeout: 5_000 });
    await expect(cardModal.getByRole('link', { name: 'Voir les corrections →' })).toHaveAttribute(
      'href',
      `/projet/${MULTI_SLUG}/revision/${pageId1}`,
    );
    await page.keyboard.press('Escape');

    // Page 2: materialize a v1 scenario document too, but leave it untouched (no correction filed) —
    // this is the AC-6 "empty list" fixture.
    await page.goto(`/projet/${MULTI_SLUG}/editeur/${pageId2}`);
    await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await typeIntoCase(page, 1, 'Une planche neuve, sans annotation.');
    await saveDoc(page);
    await expect(page.getByText('v1')).toBeVisible({ timeout: 10_000 });

    await page.close();
  });

  test('CS5-1: the revision page is DESSIN-ONLY — no Scénario/Dessin toggle, no scenario rows; a dessin correction needs BOTH a region and a description; the draft box is movable before submit', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);

    // r4 — header replica: back link, title, "En révision" pill, Fichier picker, member avatars, the
    // green Valider button — but NO Scénario/Dessin surface toggle anywhere.
    await expect(page.getByRole('link', { name: '‹ Projet' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('En révision')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Surface de révision' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Scénario' })).toHaveCount(0);
    await expect(page.getByLabel('Choisir le fichier à réviser')).toBeVisible();
    // No correction exists yet on this fresh page — Valider is vacuously ENABLED (all([]).every ⇒ true,
    // per backend-notes D3/"zero corrections = vacuously allowed"); the disabled-while-open case is
    // covered thoroughly in CS5-4 once real corrections exist.
    const validateBtn = page.getByRole('button', { name: 'Valider les modifications', exact: true });
    await expect(validateBtn).toBeVisible();

    await expect(page.getByText('v1 · révisée')).toBeVisible({ timeout: 10_000 });

    // C (r3) / Item 3 (r5) — the nemu image is fitted to the viewport, frame hugs it.
    const nemuImg = page.getByAltText(/Planche révisée/);
    await expect(nemuImg).toBeVisible({ timeout: 10_000 });
    const objectFit = await nemuImg.evaluate((el) => (el as HTMLElement).style.objectFit);
    expect(objectFit).toBe('contain');

    // AC-3: submitting without a description is rejected (no region drawn, no text typed yet).
    const composer = page.getByLabel('Décrire la correction (dessin)');
    await page.getByRole('button', { name: 'Demander' }).click();
    await expect(page.getByText('Description requise')).toBeVisible({ timeout: 5_000 });

    // AC-3: a description with no drawn region is also rejected. r6 A1 — the draw surface has no
    // "armed" concept any more; it's always interactive, `.fill()` just fills the textarea.
    await composer.fill("Agrandir le plan, on perd l'échelle.");
    await page.getByRole('button', { name: 'Demander' }).click();
    await expect(page.getByText('Tracez d’abord un cadre sur l’image')).toBeVisible({ timeout: 5_000 });

    // C (r3) — no camera movement: draw via the keyboard fallback, scroll position must never change.
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const surface = page.getByRole('application', { name: 'Tracer une zone de correction' });
    await surface.focus();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Zone : 38,38 · 25×25')).toBeVisible({ timeout: 5_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    // Item 6 (r5) — the committed draft box is movable via the keyboard (arrow keys), clamped to the
    // image bounds; the composer's "Zone :" readout reflects the move live. The mover's onPointerDown
    // suppresses default click-to-focus (same pattern as the draw surface, item F2/C) — focus it
    // explicitly (a real user would Tab to it) to reach the keyboard-nudge path.
    const mover = page.getByRole('button', { name: /Déplacer la zone/ });
    await expect(mover).toBeVisible({ timeout: 5_000 });
    await mover.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Zone : 40,38 · 25×25')).toBeVisible({ timeout: 5_000 }); // +2% (MOVE_STEP)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore); // still no camera movement

    await page.getByRole('button', { name: 'Demander' }).click();
    await expect(page.getByText('Correction demandée.')).toBeVisible({ timeout: 10_000 });

    // r4 — the list row carries NO type chip (dessin-only list — the chip is redundant and was removed).
    const row = page.locator('li').filter({ hasText: "Agrandir le plan" });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Dessin', { exact: true })).toHaveCount(0);
    // The box is numbered "1" and painted at the MOVED position (x=0.375+0.02=0.395 → pct() keeps one
    // decimal, "39.5%" — NOT the original 37.5%/"37.5%"; the "Zone :" readout rounds to a whole percent
    // ("40", already asserted above), a different (coarser) rounding than the CSS `left` — both correct.
    const box = page.locator('[data-correction-id]', { hasText: '1' }).first();
    await expect(box).toBeVisible();
    expect(await box.evaluate((el) => (el as HTMLElement).style.left)).toBe('39.5%');

    // Item 4 (r5) — on-brand restyle: 3px ink border + hard offset shadow on the correction card.
    const card = page.locator('.ep-correction-card').first();
    await expect(card).toHaveCSS('border-width', '3px');
    // r6 A4 — the card's left status stripe + number badge + pill all carry the à-corriger colour
    // (var(--accent), rgb(232,38,28)) for a freshly-filed correction.
    await expect(card).toHaveAttribute('data-status', 'a_corriger');
    const stripe = card.locator('.ep-correction-stripe');
    await expect(stripe).toHaveCSS('background-color', 'rgb(232, 38, 28)');

    await page.screenshot({ path: 'e2e/screenshots/cs5-dessin-fitted-box.png', fullPage: true });
  });

  // r6 A1/A2/A3 — the composer is ALWAYS active (no "＋ Nouvelle correction" toggle anywhere on the
  // page), carries no "Type" row (dessin is the only type here), and its textarea is white (--card).
  test('CS5-8 (r6 A1/A2/A3): the dessin composer has no activation toggle, no type row, and a white textarea', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    await expect(page.getByText('v1 · révisée')).toBeVisible({ timeout: 10_000 });

    // A1 — no toggle button anywhere; the draw surface (role=application) is already interactive.
    await expect(page.getByRole('button', { name: '＋ Nouvelle correction' })).toHaveCount(0);
    const surface = page.getByRole('application', { name: 'Tracer une zone de correction' });
    await expect(surface).toBeVisible();

    // A2 — no "Type :" row / Scénario / Dessin chips next to the composer textarea.
    const composer = page.getByLabel('Décrire la correction (dessin)');
    await expect(composer).toBeVisible();
    await expect(page.getByText('Type :')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Scénario', exact: true })).toHaveCount(0);

    // A3 — the textarea background is white/on-brand (--card, #fffefb), not the paper tone.
    const bg = await composer.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(255, 254, 251)');
  });

  // r6 A5 — "＋ Nouvelle version du dessin" reuses the CS-3 AssetVersionsModal (presigned upload →
  // POST /assets/:id/versions); on success the review payload refetches and the old↔new compare shows
  // the fresh art (a "→" compare + the new head's own frame appear).
  test('CS5-9 (r6 A5): uploading a new dessin version from Révision refreshes the old↔new compare', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    await expect(page.getByText('v1 · révisée')).toBeVisible({ timeout: 10_000 });

    // No newer version yet — the compare arrow / second frame aren't rendered.
    await expect(page.getByAltText(/Nouvelle planche/)).toHaveCount(0);

    await page.getByRole('button', { name: '＋ Nouvelle version du dessin' }).click();
    const modal = page.getByRole('dialog', { name: 'Versions' });
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.getByLabel('Choisir un fichier pour la nouvelle version').setInputFiles(IMAGE_FIXTURE);
    await expect(modal.getByText('v2')).toBeVisible({ timeout: 15_000 }); // new version row appended
    await modal.getByRole('button', { name: 'Fermer' }).click();

    // The payload refetches (A5's reloadKey bump) — the compare now shows OLD (v1, with boxes) ↔ NEW (v2).
    await expect(page.getByAltText(/Planche révisée \(v1\)/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByAltText(/Nouvelle planche \(v2\)/)).toBeVisible({ timeout: 10_000 });
  });

  // r6 B6 — the comment/correction deletion confirm modal's "Supprimer" button uses the on-brand
  // destructive accent red (#e8261c / rgb(232,38,28)), not the old off-brand muted red.
  test('CS5-10 (r6 B6): the delete-confirmation "Supprimer" button is the on-brand accent red', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    await expect(page.getByText('v1 · révisée')).toBeVisible({ timeout: 10_000 });

    const card = page.locator('.ep-correction-card').first();
    await card.getByRole('button', { name: /Supprimer la demande/ }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Supprimer cette demande ?' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const confirmBtn = dialog.getByRole('button', { name: 'Supprimer', exact: true });
    await expect(confirmBtn).toHaveCSS('background-color', 'rgb(232, 38, 28)');
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('CS5-2: Item 3 (r5) — the whole dessin surface (frame + composer) fits the viewport without scrolling at 1280', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    await expect(page.getByText('v1 · révisée')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => noVerticalOverflow(page)).toBe(true);
  });

  test('CS5-3: status filter composes/auto-applies (no "Appliquer" button); no type filter (dessin-only list)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);

    const dessinRow = page.locator('li').filter({ hasText: 'Agrandir le plan' });
    await expect(dessinRow).toBeVisible({ timeout: 10_000 });

    // r4 — the Toutes/Scénario/Dessin type radiogroup is GONE (dessin-only list, status is the only filter).
    await expect(page.getByRole('radiogroup', { name: 'Filtrer par type' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Appliquer' })).toHaveCount(0);

    await page.getByLabel('Filtrer par statut').click();
    await page.getByRole('option', { name: 'En cours' }).click();
    await expect(dessinRow).toHaveCount(0); // still à corriger, filtered out

    await page.getByLabel('Filtrer par statut').click();
    await page.getByRole('option', { name: 'À corriger' }).click();
    await expect(dessinRow).toBeVisible();

    await page.getByLabel('Filtrer par statut').click();
    await page.getByRole('option', { name: 'Tous les statuts' }).click();
    await expect(dessinRow).toBeVisible();
  });

  test('CS5-4: "Valider les modifications" gates on ALL corrections — a scenario tagged-comment (filed + resolved in the EDITOR) AND a dessin correction — then transitions Corrections → Propre', async ({ page }) => {
    await login(page, OWNER_EMAIL);

    // File a scenario correction from the editor (r4 — the only place scenario corrections live now).
    await page.goto(`/projet/${MULTI_SLUG}/editeur/${pageId1}`);
    await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 });
    await caseBlock(page, 1).locator('[data-case-description] p').first().click({ clickCount: 3 });
    await page.getByLabel('Commenter la sélection').fill("Remplacer « abandonné, noyé d'ombre » — trop chargé.");
    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await expect(page.getByText('Demande de correction envoyée')).toBeVisible({ timeout: 10_000 });

    // Back on the revision page: the dessin correction (from CS5-1) is still open; the scenario one
    // (just filed) is invisible here (dessin-only list) but STILL counts toward the gate.
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    const dessinRow = page.locator('li').filter({ hasText: 'Agrandir le plan' });
    const validateBtn = page.getByRole('button', { name: 'Valider les modifications', exact: true });
    await expect(validateBtn).toBeDisabled();

    // Direct API call while corrections are open → 409 with the unresolved count (≥2: scenario + dessin).
    const forbiddenValidate = await page.request.post(`${API}/pages/${pageId1}/review/validate`);
    expect(forbiddenValidate.status()).toBe(409);
    const body409 = await forbiddenValidate.json();
    expect(body409.unresolved).toBeGreaterThanOrEqual(2);

    // Resolve the DESSIN correction here on the revision page. The list shows the OPTIMISTIC status
    // text the instant a click fires — waiting on that text alone doesn't prove the PATCH actually
    // committed server-side yet (only `busyId`/disabled-button state does, and that's a subtler thing to
    // assert reliably under load). Wait on the real PATCH response instead, so the second click can never
    // race the first one's server-side commit — the exact condition the `unresolved` count below depends on.
    // Feedback 2026-09-01 — the cycler is now an explicit radiogroup: click the target status chip.
    // The card's data-status is the unambiguous state read (the chip labels repeat the pill text).
    const chipOnDessinRow = (label: string) => dessinRow.getByRole('radio', { name: label });
    const patchResp = (status: string) =>
      page.waitForResponse(
        async (r) => {
          if (!/\/corrections\/[^/]+$/.test(r.url()) || r.request().method() !== 'PATCH') return false;
          const body = r.request().postDataJSON() as { status?: string };
          return body.status === status;
        },
      );
    const toEnCours = patchResp('en_cours');
    await chipOnDessinRow('En cours').click();
    expect((await toEnCours).status()).toBe(200);
    await expect(dessinRow.locator('.ep-correction-card')).toHaveAttribute('data-status', 'en_cours', { timeout: 10_000 });
    const toCorrige = patchResp('corrige');
    await chipOnDessinRow('Corrigé').click();
    expect((await toCorrige).status()).toBe(200);
    await expect(dessinRow.locator('.ep-correction-card')).toHaveAttribute('data-status', 'corrige', { timeout: 10_000 });

    // Valider STAYS blocked — the scenario correction (not shown here) is still à corriger.
    await expect(validateBtn).toBeDisabled();
    const stillOpen = await page.request.post(`${API}/pages/${pageId1}/review/validate`);
    expect(stillOpen.status()).toBe(409);
    expect((await stillOpen.json()).unresolved).toBe(1);

    // Resolve the SCENARIO correction from the EDITOR panel (r4 — its only remaining home).
    await page.goto(`/projet/${MULTI_SLUG}/editeur/${pageId1}`);
    const scenarioComment = page.locator('aside .ep-comments-scroll > div').filter({ hasText: "Remplacer « abandonné" });
    await expect(scenarioComment).toBeVisible({ timeout: 10_000 });
    await expect(scenarioComment.getByText('Correction · À corriger')).toBeVisible();
    // Tagged highlight is visually differentiated from a plain comment highlight (double-underline class).
    await expect(caseBlock(page, 1).locator('.ep-correction-highlight')).toBeVisible({ timeout: 5_000 });
    await scenarioComment.getByRole('radio', { name: 'En cours' }).click();
    await expect(scenarioComment.getByText('Correction · En cours')).toBeVisible({ timeout: 10_000 });
    await scenarioComment.getByRole('radio', { name: 'Corrigé' }).click();
    await expect(scenarioComment.getByText('Correction · Corrigé')).toBeVisible({ timeout: 10_000 });

    // Now Valider succeeds — both corrections are corrigé.
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    await expect(validateBtn).toBeEnabled({ timeout: 10_000 });

    // Screenshot evidence: the fully-populated, on-brand dessin-only revision screen.
    await page.screenshot({ path: 'e2e/screenshots/cs5-revision-populated-1280.png', fullPage: true });

    await validateBtn.click();
    await expect(page).toHaveURL(new RegExp(`/projet/${MULTI_SLUG}$`), { timeout: 10_000 });
    const propreCol = page.getByRole('group').filter({ hasText: 'PROPRE' });
    await expect(propreCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('CS5-5: empty "Aucune demande" state renders for an untouched page', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId2}`);
    await expect(page.getByText('Aucune demande')).toBeVisible({ timeout: 10_000 });
  });

  test('CS5-6: responsive at 375 / 768 / 1280 — no horizontal overflow, dessin frame + aside stack on narrow widths', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}/revision/${pageId2}`);
    // Page 2 has no dessin file linked at all (the empty-list fixture), so the "Fichier :" picker
    // doesn't render (dessin-only, no dessin files to choose from) — wait on the always-present header.
    await expect(page.getByText('En révision')).toBeVisible({ timeout: 10_000 });

    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => noHorizontalOverflow(page)).toBe(true);
    }
    await page.screenshot({ path: 'e2e/screenshots/cs5-revision-375.png', fullPage: true });

    await page.setViewportSize({ width: 768, height: 1000 });
    await page.screenshot({ path: 'e2e/screenshots/cs5-revision-populated-768.png', fullPage: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    const wideDir = await page.evaluate(() => getComputedStyle(document.querySelector('.ep-review-layout')!).flexDirection);
    expect(wideDir).toBe('row');

    await page.setViewportSize({ width: 375, height: 800 });
    const narrowDir = await page.evaluate(() => getComputedStyle(document.querySelector('.ep-review-layout')!).flexDirection);
    expect(narrowDir).toBe('column');
  });

  // Kept IN the serial chain so it can't race the beforeAll/CS5-1..6 steps that add "Page 1"/"Page 2"
  // to the SAME shared project (card titles are server-assigned by count).
  test('CS5-7: a member who is neither author nor assignee cannot change a correction\'s status (403); a true non-member cannot validate (403)', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const strangerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const collab = await collabCtx.newPage();
    const stranger = await strangerCtx.newPage();
    await login(owner, OWNER_EMAIL);
    await login(collab, COLLAB_EMAIL);
    await login(stranger, STRANGER_EMAIL);

    // Fresh card + fresh scenario correction (filed from the editor, r4) so this test doesn't depend on
    // the CS5-1..4 chain's final state (that page is already validated/Propre by the time this runs).
    // CI retry-hardening (see `resetCard`) — this test is itself part of the serial block, so a whole-
    // group retry re-runs it too; without a reset, `addCard(owner, 3)` would create a 2nd "Page 3".
    await owner.goto(`/projet/${MULTI_SLUG}`);
    await resetCard(owner, 'Page 3');
    await addCard(owner, 3);
    const pid = await pageIdOf(owner, 'Page 3');
    await owner.goto(`/projet/${MULTI_SLUG}/editeur/${pid}`);
    await expect(caseBlock(owner, 1)).toBeVisible({ timeout: 10_000 });
    await owner.waitForTimeout(500);
    await typeIntoCase(owner, 1, 'Une case à corriger pour le test authz.');
    await saveDoc(owner);
    await caseBlock(owner, 1).locator('[data-case-description] p').first().click({ clickCount: 3 });
    await owner.getByLabel('Commenter la sélection').fill('Corriger cette case.');
    const createResp = owner.waitForResponse(
      (r) => r.url().includes('/corrections') && r.request().method() === 'POST',
    );
    await owner.getByRole('button', { name: 'Demander une correction' }).click();
    const correctionId = (await (await createResp).json()).id as string;

    // Forged PATCH by COLLAB (a real project member, but neither author nor assignee) → 403.
    const forgedPatch = await collab.request.patch(`${API}/corrections/${correctionId}`, {
      data: { status: 'corrige' },
    });
    expect(forgedPatch.status()).toBe(403);

    // Client-side: COLLAB opening the same editor sees the tagged comment but NO status stepper.
    await collab.goto(`/projet/${MULTI_SLUG}/editeur/${pid}`);
    const commentAsCollab = collab.locator('aside .ep-comments-scroll > div').filter({ hasText: 'Corriger cette case.' });
    await expect(commentAsCollab).toBeVisible({ timeout: 10_000 });
    await expect(commentAsCollab.getByRole('radiogroup', { name: /Statut de la correction/ })).toHaveCount(0);

    // Validate by STRANGER (signed in, NOT a project member) → 403.
    const forgedValidate = await stranger.request.post(`${API}/pages/${pid}/review/validate`);
    expect(forgedValidate.status()).toBe(403);

    await ownerCtx.close();
    await collabCtx.close();
    await strangerCtx.close();
  });

  // ── CS-26 — the terminal column is gated the way Corrections → PROPRE already is ──────────
  test('CS26: a card with an open correction against the CURRENT version is refused by VALIDÉ (409 + count + link), and moves once it is resolved', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    // Reuse "Page 2" — beforeAll already gave it a v1 scenario document and no correction (the CS5-5
    // fixture). Reset its stage first so a Playwright RETRY of this test alone can't start from the
    // `valide` it ended in (the guard is skipped for an already-`valide` card, by design).
    const pid = pageId2;
    expect((await page.request.patch(`${API}/pages/${pid}/stage`, { data: { stage: 'scenario' } })).status()).toBe(200);

    // One open scenario correction, filed from the editor against the document's CURRENT version.
    await page.goto(`/projet/${MULTI_SLUG}/editeur/${pid}`);
    await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await caseBlock(page, 1).locator('[data-case-description] p').first().click({ clickCount: 3 });
    await page.getByLabel('Commenter la sélection').fill('Revoir cette case avant validation.');
    const createResp = page.waitForResponse((r) => r.url().includes('/corrections') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Demander une correction' }).click();
    const correctionId = (await (await createResp).json()).id as string;

    // The card face pre-empts the block: the open-correction count is on the card before any move.
    await page.goto(`/projet/${MULTI_SLUG}`);
    await expect(kanbanCard(page, 'Page 2').getByTitle('Corrections ouvertes', { exact: true })).toHaveText('1', { timeout: 10_000 });

    // The blocked move: 409 « Corrections non résolues », the board reverts, the banner names the
    // count and links to the card's review screen.
    const moveToValide = async () => {
      await kanbanCard(page, 'Page 2').getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
      await page.getByRole('menuitem', { name: 'VALIDÉ' }).click();
    };
    const blocked = page.waitForResponse((r) => r.url().includes(`/pages/${pid}/stage`) && r.request().method() === 'PATCH');
    await moveToValide();
    expect((await blocked).status()).toBe(409);
    const alert = page.getByRole('alert').filter({ hasText: 'Corrections non résolues' });
    await expect(alert).toContainText('Corrections non résolues (1)', { timeout: 10_000 });
    await expect(alert.getByRole('link', { name: 'Voir les corrections' })).toHaveAttribute('href', `/projet/${MULTI_SLUG}/revision/${pid}`);
    // Reverted — the card is back in Scénario, never in VALIDÉ.
    await expect(page.getByRole('group').filter({ hasText: 'VALIDÉ' }).getByText('Page 2', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('group').filter({ hasText: /^Scénario/ }).getByText('Page 2', { exact: true })).toBeVisible();

    // The banner + the card chip survive the narrow breakpoints without overflowing, and F5's
    // "dismissible at every width" half: the « Fermer » control is visible and ≥44px at each.
    const dismiss = alert.getByRole('button', { name: 'Fermer' });
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(alert).toBeVisible();
      await expect(dismiss).toBeVisible();
      const box = await dismiss.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await noHorizontalOverflow(page)).toBe(true);
      await page.screenshot({ path: `e2e/screenshots/cs26-valide-blocked-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    // Clicking it removes the banner.
    await dismiss.click();
    await expect(alert).toHaveCount(0);

    // Resolve it → the same move now succeeds and the chip is gone.
    expect((await page.request.patch(`${API}/corrections/${correctionId}`, { data: { status: 'corrige' } })).status()).toBe(200);
    await page.reload();
    await expect(kanbanCard(page, 'Page 2').getByTitle('Corrections ouvertes', { exact: true })).toHaveCount(0, { timeout: 10_000 });
    await moveToValide();
    await expect(page.getByRole('group').filter({ hasText: 'VALIDÉ' }).getByText('Page 2', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Idempotence + the unguarded reverse move: valide → valide is a no-op, valide → Encrage is free.
    expect((await page.request.patch(`${API}/pages/${pid}/stage`, { data: { stage: 'valide' } })).status()).toBe(200);
    expect((await page.request.patch(`${API}/pages/${pid}/stage`, { data: { stage: 'encrage' } })).status()).toBe(200);
  });

  // CS-26 follow-up — the OTHER half of the VALIDÉ rule, and the half that makes it usable: a
  // correction filed against a version that has since been superseded must NOT block the terminal move.
  // Without this the column becomes unreachable for any long-lived page (there is always some old open
  // correction). Round 1 left this unit-covered only, on the belief that e2e could not append a real
  // version — CS5-9 and CS25 both do, so that belief was simply wrong.
  test('CS26b: corrections filed against a SUPERSEDED version do not block VALIDÉ (the move succeeds with them still open)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const pid = pageId2;
    expect((await page.request.patch(`${API}/pages/${pid}/stage`, { data: { stage: 'scenario' } })).status()).toBe(200);

    // One open scenario correction against the document's CURRENT version.
    await page.goto(`/projet/${MULTI_SLUG}/editeur/${pid}`);
    await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await caseBlock(page, 1).locator('[data-case-description] p').first().click({ clickCount: 3 });
    await page.getByLabel('Commenter la sélection').fill('À revoir — filed against the current head.');
    const createResp = page.waitForResponse((r) => r.url().includes('/corrections') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await createResp;

    // Control: while it is against the CURRENT version, the terminal move is refused.
    const blocked = await page.request.patch(`${API}/pages/${pid}/stage`, { data: { stage: 'valide' } });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).unresolved).toBeGreaterThanOrEqual(1);

    // A new version lands. The correction is untouched — still `a_corriger` — but now filed against a
    // version that is no longer head. (An edit first: the snapshot dedupe guard refuses to clone a head.)
    await caseBlock(page, 1).locator('[data-case-description] p').first().click();
    await page.keyboard.type(' Une ombre bouge au fond.');
    await page.waitForTimeout(6_000); // CS-21: idle compaction persists the edit before the snapshot
    await page.getByRole('button', { name: 'Enregistrer une nouvelle version' }).click();
    // Feedback 2026-09-01 — the version flow confirms through the base-preview modal.
    await page.getByRole('dialog', { name: 'Enregistrer une nouvelle version' }).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('combobox', { name: 'Version affichée' })).toContainText('v2', { timeout: 15_000 });

    // The card face stops pre-empting a block that no longer applies…
    await page.goto(`/projet/${MULTI_SLUG}`);
    await expect(kanbanCard(page, 'Page 2').getByTitle('Corrections ouvertes', { exact: true })).toHaveCount(0, { timeout: 15_000 });

    // …and the move succeeds — with the correction still OPEN. Superseded is not resolved: the rule is
    // "this file still has known problems AGAINST THE BYTES IT SHIPS", not "no correction ever existed".
    const ok = await page.request.patch(`${API}/pages/${pid}/stage`, { data: { stage: 'valide' } });
    expect(ok.status()).toBe(200);
    const list = await (await page.request.get(`${API}/pages/${pid}/corrections`)).json();
    expect((list.items as { status: string }[]).some((c) => c.status !== 'corrige')).toBe(true);

    // Leave the fixture where the next test expects it.
    expect((await page.request.patch(`${API}/pages/${pid}/stage`, { data: { stage: 'scenario' } })).status()).toBe(200);
  });

  // ── CS-24 — the correction verification loop ──────────────────────────────────────────────
  // The whole point: the filer is told when SOMEONE ELSE closes their correction, sees before/after,
  // and can reopen it in one click. The resolving member must be the correction's ASSIGNEE (the
  // author-or-assignee gate is unchanged). Follow-up 6 — the whole loop now runs THROUGH THE UI: A
  // files it with the composer's « Assignée à » picker, B closes it from B's own row, A is notified.
  test('CS24: a correction filed with an assignee and closed by them notifies the filer, deep-links to the review row (crops removed 2026-09-01), and « Rouvrir » puts it back to à-corriger', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const collab = await collabCtx.newPage();
    await login(owner, OWNER_EMAIL);
    await login(collab, COLLAB_EMAIL);

    // Page 1 is in `propre` after CS5-4 — put it back in Corrections so validation can be exercised.
    expect((await owner.request.patch(`${API}/pages/${pageId1}/stage`, { data: { stage: 'corrections' } })).status()).toBe(200);

    const me = await (await owner.request.get(`${API}/auth/me`)).json();
    const review = await (await owner.request.get(`${API}/pages/${pageId1}/review`)).json();
    const assignee = (review.members as { accountId: string; displayName: string }[]).find((m) => m.accountId !== me.id)!;

    // A files the correction from the composer and hands it to B with « Assignée à ».
    await owner.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    await expect(owner.getByLabel('Décrire la correction (dessin)')).toBeVisible({ timeout: 15_000 });
    await owner.getByRole('application', { name: 'Tracer une zone de correction' }).focus();
    await owner.keyboard.press('Enter'); // keyboard fallback for the drawn region
    await owner.getByLabel('Décrire la correction (dessin)').fill('La main de la case 3 est à l’envers.');
    const picker = owner.getByRole('combobox', { name: 'Assignée à' });
    await expect(picker).toContainText('Non assignée');
    await picker.click();
    await owner.getByRole('option', { name: assignee.displayName }).click();
    const posted = owner.waitForResponse(
      (r) => r.url().endsWith(`/pages/${pageId1}/corrections`) && r.request().method() === 'POST',
    );
    await owner.getByRole('button', { name: 'Demander' }).click();
    const createdRes = await posted;
    expect(createdRes.status()).toBe(201);
    const createdBody = await createdRes.json();
    expect(createdBody.assigneeId).toBe(assignee.accountId); // the picker really wrote the assignee
    const correctionId = createdBody.id as string;
    await expect(picker).toContainText('Non assignée'); // reset after a successful send

    // B — the ASSIGNEE, not the filer — closes it from B's own review screen. Without the picker this
    // row would carry no status control for B at all, and CS-24 could never fire.
    await collab.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    const collabRow = collab.locator(`.ep-correction-card[data-correction-id="${correctionId}"]`);
    await expect(collabRow).toBeVisible({ timeout: 15_000 });
    for (const [next, label] of [['en_cours', 'En cours'], ['corrige', 'Corrigé']] as const) {
      const patched = collab.waitForResponse(async (r) => {
        if (!/\/corrections\/[^/]+$/.test(r.url()) || r.request().method() !== 'PATCH') return false;
        return (r.request().postDataJSON() as { status?: string }).status === next;
      });
      await collabRow.getByRole('radio', { name: label }).click();
      expect((await patched).status()).toBe(200);
    }
    await expect(collabRow).toHaveAttribute('data-status', 'corrige', { timeout: 10_000 });

    // The filer is told, in the notification centre, with the CS-24 copy.
    await owner.goto('/notifications');
    const notif = owner.getByRole('button', { name: 'Votre correction a été marquée corrigée' });
    await expect(notif).toBeVisible({ timeout: 10_000 });

    // Clicking it deep-links through the resolver to the review screen with THAT correction selected.
    await notif.click();
    await expect(owner).toHaveURL(new RegExp(`/projet/${MULTI_SLUG}/revision/${pageId1}\\?correction=${correctionId}`), { timeout: 15_000 });
    // Scope to the list card — the surface's numbered box carries the same data-correction-id.
    const row = owner.locator(`.ep-correction-card[data-correction-id="${correctionId}"]`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toHaveAttribute('data-selected', 'true');

    // The unverified marker + the version transition; the Avant/Après crop pair was removed on
    // user feedback (2026-09-01).
    await expect(row.getByText('en attente de vérification')).toBeVisible();
    await expect(row.getByText(/^v\d+ → v\d+$/)).toBeVisible();
    await expect(row.locator('.ep-crop')).toHaveCount(0);

    for (const width of [1280, 768, 375]) {
      await owner.setViewportSize({ width, height: 900 });
      expect(await noHorizontalOverflow(owner)).toBe(true);
      await owner.screenshot({ path: `e2e/screenshots/cs24-verification-${width}.png`, fullPage: true });
    }
    await owner.setViewportSize({ width: 1280, height: 900 });

    // « Vu » clears the marker WITHOUT changing the status.
    await row.getByRole('button', { name: /^Vu/ }).click();
    await expect(row.getByText('en attente de vérification')).toHaveCount(0, { timeout: 10_000 });
    await expect(row.getByText('Corrigé', { exact: true })).toBeVisible();

    // « Rouvrir » — one click, no confirmation — puts it back to à corriger and re-blocks validation.
    // The row paints the new status OPTIMISTICALLY, so wait on the PATCH itself: the validate below
    // depends on the server having committed the reopen, not on the optimistic text.
    const reopened = owner.waitForResponse(
      (r) => /\/corrections\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH',
    );
    await row.getByRole('button', { name: /Rouvrir/ }).click();
    expect((await reopened).status()).toBe(200);
    await expect(row).toHaveAttribute('data-status', 'a_corriger', { timeout: 10_000 });
    const refused = await owner.request.post(`${API}/pages/${pageId1}/review/validate`);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).unresolved).toBeGreaterThanOrEqual(1);

    // Clean up so a retry (and any later spec) starts from the same slate.
    expect((await owner.request.delete(`${API}/corrections/${correctionId}`)).status()).toBe(204);
    await ownerCtx.close();
    await collabCtx.close();
  });

  // ── CS-25 — new-version triage ────────────────────────────────────────────────────────────
  // A new version lands on a page carrying open corrections filed against an older one: the header
  // offers « Passer en revue (n) », the walkthrough draws the current region on BOTH panes, and each
  // key is the EXISTING PATCH /corrections/:id — a real write that survives a reload.
  test('CS25: « Passer en revue (n) » walks the corrections filed against an older version, writes each decision, and fades the new version over the old', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const collab = await collabCtx.newPage();
    await login(owner, OWNER_EMAIL);
    await login(collab, COLLAB_EMAIL);

    expect((await owner.request.patch(`${API}/pages/${pageId1}/stage`, { data: { stage: 'corrections' } })).status()).toBe(200);
    const before = await (await owner.request.get(`${API}/pages/${pageId1}/review`)).json();
    const assetId = before.selected.assetId as string;

    // Two corrections filed against TODAY's head…
    const ids: string[] = [];
    for (const description of ['Le décor de la case 1 manque de profondeur.', 'La trame du fond est trop dense.']) {
      const created = await owner.request.post(`${API}/pages/${pageId1}/corrections`, {
        data: { type: 'dessin', assetId, anchor: { region: { x: 0.15, y: 0.15, w: 0.35, h: 0.3 } }, description },
      });
      expect(created.status()).toBe(201);
      ids.push((await created.json()).id as string);
    }

    // …then a NEWER version lands (the exact moment this story exists for).
    await owner.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    await owner.getByRole('button', { name: '＋ Nouvelle version du dessin' }).click();
    const modal = owner.getByRole('dialog', { name: 'Versions' });
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.getByLabel('Choisir un fichier pour la nouvelle version').setInputFiles(IMAGE_FIXTURE);
    await expect(modal.getByRole('button', { name: 'Fermer' })).toBeVisible();
    await owner.waitForTimeout(2_000);
    await modal.getByRole('button', { name: 'Fermer' }).click();
    await owner.reload();

    // A1 — the count is the server's own arithmetic: open corrections filed against < head.
    const after = await (await owner.request.get(`${API}/pages/${pageId1}/review`)).json();
    const head = (after.files as { assetId: string; currentVersion: number }[]).find((f) => f.assetId === assetId)!.currentVersion;
    const expected = (after.corrections.items as { type: string; assetId: string; status: string; filedAgainstVersion: number }[]).filter(
      (c) => c.type === 'dessin' && c.assetId === assetId && c.status !== 'corrige' && c.filedAgainstVersion < head,
    ).length;
    expect(expected).toBeGreaterThanOrEqual(2);
    const entry = owner.getByRole('button', { name: `Passer en revue (${expected})` });
    await expect(entry).toBeVisible({ timeout: 15_000 });

    // A5 — the onion-skin is opacity over two UNMODIFIED images: no canvas, no derivative.
    const slider = owner.getByLabel(/^Fondu v\d+ → v\d+$/);
    await expect(slider).toBeVisible();
    const srcsBefore = await owner.locator('.ep-dessin-compare img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    await slider.fill('70');
    await expect(owner.getByText('70 %')).toBeVisible();
    expect(await owner.locator('[data-onion-skin]').evaluate((e) => getComputedStyle(e).opacity)).toBe('0.7');
    expect(await owner.locator('.ep-dessin-compare img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src))).toEqual(srcsBefore);
    expect(await owner.locator('.ep-dessin-compare canvas').count()).toBe(0);

    // A2/A8 — enter: the mode announces its progress and draws the region on BOTH panes.
    await entry.click();
    const mode = owner.getByRole('region', { name: 'Passage en revue des corrections' });
    await expect(mode).toBeVisible();
    await expect(mode.getByText(`Correction 1 sur ${expected}`)).toBeVisible();
    const firstId = await owner.locator('.ep-dessin-compare [data-correction-id]').first().getAttribute('data-correction-id');
    await expect(owner.locator(`.ep-dessin-compare [data-correction-id="${firstId}"]`)).toHaveCount(2);
    const [oldBox, newBox] = await owner.locator(`.ep-dessin-compare [data-correction-id="${firstId}"]`).evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).style.left + '|' + (e as HTMLElement).style.top),
    );
    expect(newBox).toBe(oldBox);

    // A3/A4 — « C » is the existing PATCH, and it survives a reload.
    const patched = owner.waitForResponse((r) => /\/corrections\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH');
    await owner.keyboard.press('c');
    expect((await patched).status()).toBe(200);
    await expect(mode.getByText(`Correction 2 sur ${expected}`)).toBeVisible({ timeout: 10_000 });
    await owner.reload();
    await expect(owner.getByRole('button', { name: `Passer en revue (${expected - 1})` })).toBeVisible({ timeout: 15_000 });

    // A7 — at 375 the panes stack, the slider is usable and every action target is ≥44px.
    await owner.getByRole('button', { name: `Passer en revue (${expected - 1})` }).click();
    for (const width of [1280, 768, 375]) {
      await owner.setViewportSize({ width, height: 900 });
      expect(await noHorizontalOverflow(owner)).toBe(true);
      for (const name of [/^Corrigé/, /^Toujours à revoir/, /^En cours/]) {
        const box = await mode.getByRole('button', { name }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await owner.screenshot({ path: `e2e/screenshots/cs25-walkthrough-${width}.png`, fullPage: true });
    }
    await owner.setViewportSize({ width: 375, height: 900 });
    expect(
      await owner.locator('.ep-dessin-compare').evaluate((e) => getComputedStyle(e).flexDirection),
    ).toBe('column');
    await expect(owner.getByLabel(/^Fondu v\d+ → v\d+$/)).toBeVisible();
    await owner.setViewportSize({ width: 1280, height: 900 });

    // A3 — Escape leaves the mode; the decision already written stays written.
    await owner.keyboard.press('Escape');
    await expect(mode).toHaveCount(0);
    await expect(owner.getByRole('button', { name: `Passer en revue (${expected - 1})` })).toBeFocused();

    // A6 — a member who is neither author nor assignee enters the mode read-only and is refused (403).
    await collab.goto(`/projet/${MULTI_SLUG}/revision/${pageId1}`);
    const collabEntry = collab.getByRole('button', { name: /^Passer en revue \(/ });
    await expect(collabEntry).toBeVisible({ timeout: 15_000 });
    await collabEntry.click();
    const collabMode = collab.getByRole('region', { name: 'Passage en revue des corrections' });
    await expect(collabMode).toBeVisible();
    const refused = collab.waitForResponse((r) => /\/corrections\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH');
    await collab.keyboard.press('c');
    expect((await refused).status()).toBe(403);
    await expect(collabMode.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(collabMode.getByText('Correction 1 sur')).toBeVisible(); // did not advance

    for (const id of ids) await owner.request.delete(`${API}/corrections/${id}`);
    await ownerCtx.close();
    await collabCtx.close();
  });
});
