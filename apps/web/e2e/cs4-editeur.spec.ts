/**
 * CS-4 — Real-time collaborative script editor "Éditeur" — scoped e2e acceptance suite.
 *
 * Real backend + Redis adapter (no mocks) — the realtime block proves the `/editor` socket.io
 * namespace actually fans out across two independent browser contexts, same pattern as
 * mc9-messaging.spec.ts / mc13-comptoir-roster.spec.ts. Hermeticity traps heeded (repo memory):
 * kill a stale API on :3001 + flush `rl:*` before running (a stale server silently serves
 * pre-CS-4 code and every realtime/materialization assertion fails confusingly).
 *
 * Fixture accounts:
 *  - qa_e2e_cs12_owner@test.com / qa_e2e_cs13_stranger@test.com (existing fixtures, reused for the
 *    single-member blank/version/comments/entry-point flows + the non-member authz check).
 *  - The seeded `e2e-cs2-multi` project (CS12_OWNER scénariste + CS12_COLLAB dessinateur — 2 real
 *    WorkCreators, `apps/api/prisma/e2e-seed.js`) is the ONLY fixture with a second real project
 *    member, so it's reused for the two-context realtime collaboration block. e2e-seed.js resets
 *    that project's pages on every run, so each run gets a fresh card.
 *
 * Split-test convention (CLAUDE.md): this spec + the auth/nav smoke only, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
const COLLAB_EMAIL = 'qa_e2e_cs12_collab@test.com';
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com';
const MULTI_SLUG = 'e2e-cs2-multi';

const SCENARIO_TXT_FIXTURE = path.join(__dirname, 'fixtures/cs3-scenario-brief.txt');

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

async function createProject(page: Page, title: string): Promise<string> {
  await page.goto('/creer');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByLabel('Titre du projet').fill(title);
  await page.getByRole('button', { name: /Configurer plus tard/ }).click();
  await expect(page).toHaveURL(/\/projet\//, { timeout: 10_000 });
  return page.url().split('/projet/')[1];
}

async function addCard(page: Page, index = 1): Promise<string> {
  const title = `Page ${index}`;
  const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
  await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
  await expect(scenarioCol.getByText(title, { exact: true })).toBeVisible({ timeout: 5_000 });
  return title;
}

function kanbanCard(page: Page, title: string) {
  return page.locator('div[draggable="true"]').filter({ hasText: title });
}

function caseBlock(page: Page, no: number) {
  return page.locator(`[data-case-block][data-case-no="${no}"]`);
}

// Scoped to DIRECT children of the comments list (`.ep-comments-scroll > div`, one per comment) — NOT
// `aside.locator('div', { hasText }).last()`, which over-matches: a case-level comment's own `{c.text}`
// div also satisfies `hasText` and sits deeper in DOM order, so `.last()` resolves to that inner text-only
// div instead of the comment card, silently losing the sibling "case N" / quote / "voir dans le texte"
// markup the test actually wants to assert on.
function commentItem(page: Page, text: string) {
  return page.locator('aside .ep-comments-scroll > div').filter({ hasText: text }).last();
}

async function typeIntoCase(page: Page, no: number, text: string) {
  // A plain click lands the caret wherever it hits (the paragraph's centre when the line already has
  // text) — appending to a non-empty case would then splice the new run mid-word. `End` is NOT a
  // reliable fix: on macOS the End key doesn't move the caret in a contenteditable. Instead click at the
  // paragraph's right edge, which places the caret at the end of the text (or the empty tail) cross-
  // platform (harmless on an empty case).
  const para = caseBlock(page, no).locator('[data-case-description] p').first();
  const box = await para.boundingBox();
  if (box) await para.click({ position: { x: box.width - 2, y: box.height - 2 } });
  else await para.click();
  await page.keyboard.type(text, { delay: 20 });
}

test.describe('CS-4 Éditeur — blank scenario, autosave, versions, comments', () => {
  test.describe.configure({ mode: 'serial' });
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS4 Éditeur ${Date.now()}`);
    await addCard(page);
    await page.close();
  });

  test('CS4-E1: kanban ✎ opens the editor on a card with no scenario — shell replica, blank CASE 1, toolbar, disabled comment', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);

    const card = kanbanCard(page, 'Page 1');
    await card.getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    // Header replica: back link, project title, Partager. (Presence count is asserted separately in
    // CS4-E1b — a known bug inflates it for a single connected user, see the qa-report.)
    await expect(page.getByRole('link', { name: '‹ Projet' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Partager' })).toBeVisible();

    // Toolbar: Style ▾ / B / I / U / align / • Liste / Ouvrir un fichier ▾ — no version chip yet
    // (not materialized) and comments disabled until the first save.
    const toolbar = page.getByRole('toolbar', { name: 'Mise en forme' });
    await expect(toolbar.getByRole('button', { name: 'Style ▾' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Gras' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Italique' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Souligné' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Liste à puces' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: /Ouvrir un fichier/ })).toBeVisible();
    await expect(page.getByText('v1')).toHaveCount(0);
    await expect(page.getByText('Enregistrez d’abord le scénario pour commenter.')).toBeVisible();

    // Canvas: a blank CASE 1 (item 15 — the "Planche N / M" counter was removed).
    await expect(caseBlock(page, 1)).toBeVisible();

    // No emojis anywhere in the shell chrome (user rule) — the file-dropdown/comment glyphs are SVGs.
    await expect(page.locator('body')).not.toContainText('📄');
  });

  test('CS4-E2: typing in CASE 1 autosaves in place and materializes a scenario asset — v1 chip + "scénario" tag on the kanban card', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    await typeIntoCase(page, 1, 'Rin pénètre dans le sanctuaire abandonné.');
    await expect(page.getByText('Enregistré ✓')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v1')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Enregistrer une nouvelle version' })).toBeVisible();

    await page.goto(`/projet/${slug}`);
    await expect(kanbanCard(page, 'Page 1').getByText('scénario')).toBeVisible({ timeout: 10_000 });
    await expect(kanbanCard(page, 'Page 1').getByLabel('Version 1')).toBeVisible();
  });

  test('CS4-E3: comment validation (empty rejected) + a valid per-case comment persists and anchors to the caret\'s case', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    // Comments are now enabled (materialized in CS4-E2).
    const sidebar = page.locator('aside');
    const commentBox = page.getByLabel('Ajouter un commentaire à la case 1');
    await expect(commentBox).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '＋ Commentaire' }).click();
    await expect(sidebar.getByRole('alert')).toHaveText('Le commentaire ne peut pas être vide');

    await commentBox.fill('On raccourcit la réplique ?');
    await page.getByRole('button', { name: '＋ Commentaire' }).click();
    const posted = commentItem(page, 'On raccourcit la réplique ?');
    await expect(posted).toBeVisible({ timeout: 10_000 });
    await expect(posted.getByText('case 1', { exact: true })).toBeVisible();
  });

  test('CS4-E4: "Enregistrer une nouvelle version" snapshots vN explicitly; a further autosave does NOT bump it again', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    await expect(page.getByText('v1')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Enregistrer une nouvelle version' }).click();
    await expect(page.getByText('Nouvelle version enregistrée')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v2')).toBeVisible();

    // Another autosave (plain edit, no explicit version action) must NOT bump the chip past v2.
    await typeIntoCase(page, 1, ' Encore une phrase.');
    await expect(page.getByText('Enregistré ✓')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v2')).toBeVisible();
    await expect(page.getByText('v3')).toHaveCount(0);

    await page.goto(`/projet/${slug}`);
    await expect(kanbanCard(page, 'Page 1').getByLabel('Version 2')).toBeVisible({ timeout: 10_000 });
  });

  test('CS4-E5: reopening the editor loads the persisted draft (content survives a reload)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    await expect(caseBlock(page, 1)).toContainText('Rin pénètre dans le sanctuaire abandonné.', { timeout: 10_000 });
    await expect(caseBlock(page, 1)).toContainText('Encore une phrase.');
  });
});

// Isolated on purpose (own project, own describe block — NOT chained into the serial flow above): a
// failure here must not cascade-skip the unrelated autosave/version/comment coverage in that block.
test.describe('CS-4 Éditeur — presence count (single connected user)', () => {
  test('CS4-E1b: a single connected browser shows exactly "1 en ligne" and lists itself once (no self-duplication)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const slug = await createProject(page, `E2E CS4 Présence ${Date.now()}`);
    await addCard(page);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 }); // editor mounted, awareness settled
    await page.waitForTimeout(1500); // let the CollaborationCaret ProseMirror view finish mounting
    // Presence is the header count (the named roster was removed — see EditorClient.test.tsx). A single
    // connected browser must read EXACTLY "1 en ligne": if self were double-counted (the old caret-clobber
    // bug) readPeers would leak the self clientID back in and the header would read "2 en ligne".
    await expect(page.getByText('1 en ligne')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('2 en ligne')).toHaveCount(0);
  });
});

test.describe('CS-4 Éditeur — edit an existing linked scenario file (no duplicate asset)', () => {
  test.describe.configure({ mode: 'serial' });
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS4 Fichier existant ${Date.now()}`);
    await addCard(page);
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await page.getByLabel('Importer des fichiers').setInputFiles(SCENARIO_TXT_FIXTURE);
    await expect(page.locator('[data-asset-card]').filter({ hasText: 'cs3-scenario-brief.txt' })).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-asset-card]').filter({ hasText: 'cs3-scenario-brief.txt' })
      .getByRole('button', { name: /Lier cs3-scenario-brief\.txt à une carte/ }).click();
    const linkDialog = page.getByRole('dialog');
    await linkDialog.getByRole('button', { name: /Page 1/ }).click();
    await expect(linkDialog.getByRole('button', { name: /Page 1/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await linkDialog.getByRole('button', { name: 'Terminé' }).click();
    await page.close();
  });

  test('CS4-E6: CardModal Scénario "Éditer" loads the linked .txt content; editing + autosave does not spawn a duplicate asset', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText('SCÉNARIO', { exact: true })).toBeVisible();
    await modal.getByRole('link', { name: /Éditer cs3-scenario-brief\.txt/ }).click();

    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });
    // .txt content is converted to <p> paragraphs and seeded into CASE 1's description.
    await expect(caseBlock(page, 1)).toContainText('Brief de scenario e2e CS-3.', { timeout: 10_000 });

    await typeIntoCase(page, 1, ' Ajout édition.');
    await expect(page.getByText('Enregistré ✓')).toBeVisible({ timeout: 10_000 });

    await page.goto(`/projet/${slug}?tab=fichiers`);
    await expect(page.locator('[data-asset-card]').filter({ hasText: 'cs3-scenario-brief.txt' })).toHaveCount(1, { timeout: 10_000 });
  });
});

test.describe('CS-4 Éditeur — entry point: "＋ Nouveau scénario" from an empty Scénario section', () => {
  test('CS4-E7: an empty Scénario section shows "＋ Nouveau scénario", which opens a blank editor', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const slug = await createProject(page, `E2E CS4 Nouveau scénario ${Date.now()}`);
    await addCard(page);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText('Aucun fichier lié').first()).toBeVisible();
    await modal.getByRole('link', { name: 'Créer un nouveau scénario' }).click();

    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });
    await expect(caseBlock(page, 1)).toBeVisible();
    await expect(page.getByText('v1')).toHaveCount(0);
  });
});

test.describe('CS-4 Éditeur — version-note split button (item 22)', () => {
  test('CS4-E22: the chevron opens a note form; submitting snapshots WITH the note, visible in the CS-3 version history', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const slug = await createProject(page, `E2E CS4 Note version ${Date.now()}`);
    await addCard(page);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    await typeIntoCase(page, 1, 'Kenji observe le quartier depuis le pont.');
    await expect(page.getByText('Enregistré ✓')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v1')).toBeVisible({ timeout: 10_000 });

    // Primary split-button click (no chevron) snapshots immediately, without a note — v1 → v2.
    await page.getByRole('button', { name: 'Enregistrer une nouvelle version' }).click();
    await expect(page.getByText('Nouvelle version enregistrée')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v2')).toBeVisible();

    // The attached chevron opens an inline "NOTE (optionnelle)" form; submitting snapshots WITH the note.
    await page.getByRole('button', { name: 'Ajouter une note à la version' }).click();
    const noteForm = page.getByRole('dialog', { name: 'Note de version' });
    await expect(noteForm).toBeVisible();
    await noteForm.getByLabel('NOTE (optionnelle)').fill('Version stable pour relecture');
    await noteForm.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Nouvelle version enregistrée')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v3')).toBeVisible();
    await expect(noteForm).not.toBeVisible();

    // The note rides onto the CS-3 AssetVersion — verify it in the Fichiers version-history modal.
    await page.goto(`/projet/${slug}?tab=fichiers`);
    const scenarioCard = page.locator('[data-asset-card]').filter({ hasText: 'scenario-page-1' });
    await expect(scenarioCard).toBeVisible({ timeout: 10_000 });
    await scenarioCard.getByText('v3').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Version stable pour relecture')).toBeVisible();
    // v1/v2 have no note ("—" placeholder).
    await expect(dialog.locator('li').filter({ hasText: 'v1' }).getByText('—')).toBeVisible();
  });
});

test.describe('CS-4 Éditeur — highlight-anchored comments (item 5)', () => {
  test('CS4-E5it: selecting text switches the composer to "Commenter la sélection", posts an anchored comment, paints an inline highlight, and "voir dans le texte" jumps to it', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const slug = await createProject(page, `E2E CS4 Highlight ${Date.now()}`);
    await addCard(page);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });

    await typeIntoCase(page, 1, 'Rin observe la ville depuis le toit.');
    await expect(page.getByText('Enregistré ✓')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('v1')).toBeVisible({ timeout: 10_000 }); // materialized → comments enabled

    // Select the whole line the cursor is already on (typeIntoCase left the caret at its end).
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Commenter la sélection')).toBeVisible({ timeout: 5_000 });
    await expect(sidebar.getByText('« Rin observe la ville depuis le toit. »')).toBeVisible();

    const commentBox = page.getByLabel('Commenter la sélection');
    await commentBox.fill('Préciser : quel toit ?');
    await page.getByRole('button', { name: '＋ Commentaire' }).click();

    const posted = commentItem(page, 'Préciser : quel toit ?');
    await expect(posted).toBeVisible({ timeout: 10_000 });
    await expect(posted.getByText('« Rin observe la ville depuis le toit. »')).toBeVisible();
    const jumpBtn = posted.getByRole('button', { name: 'voir dans le texte' });
    await expect(jumpBtn).toBeVisible();

    // Inline highlight decoration painted in the canvas over the anchored run.
    const highlight = caseBlock(page, 1).locator('.ep-comment-highlight');
    await expect(highlight).toBeVisible({ timeout: 5_000 });
    await expect(highlight).toHaveText('Rin observe la ville depuis le toit.');

    // "voir dans le texte" re-selects the run and returns focus to the canvas without erroring.
    await jumpBtn.click();
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.ProseMirror:focus, .ProseMirror-focused')).toHaveCount(1);

    // Case-level (no-selection) comments still work unchanged (range optional): click into the
    // (empty) dialogue field — a plain click collapses any active selection reliably, unlike a
    // keyboard nav key on top of a decoration-driven ProseMirror selection.
    await caseBlock(page, 1).locator('[data-case-dialogue] p').first().click();
    await expect(sidebar.getByText('Commentaire — case 1')).toBeVisible({ timeout: 5_000 });
    await page.getByLabel(/Ajouter un commentaire à la case 1/).fill('Commentaire de case, pas de sélection.');
    await page.getByRole('button', { name: '＋ Commentaire' }).click();
    const posted2 = commentItem(page, 'Commentaire de case, pas de sélection.');
    await expect(posted2).toBeVisible({ timeout: 10_000 });
    await expect(posted2.getByText('«', { exact: false })).toHaveCount(0); // no quote block for a case-level comment
  });
});

// Reads the live pagination geometry of CASE `no` from the DOM: the case-block's measured A4 page
// height (`--ep-page-h`), the number of bordered A4 sheet frames (`.ep-page-frame`), the number of
// non-zero reflow spacers (`.ep-page-spacer`), and the second frame's top offset (to prove the sheets
// are stacked with a real inter-sheet gap, not overlaid).
async function paginationGeometry(page: Page, no: number) {
  return page.evaluate((caseNo) => {
    const block = document.querySelector(`[data-case-block][data-case-no="${caseNo}"]`) as HTMLElement | null;
    if (!block) return null;
    const brect = block.getBoundingClientRect();
    const frames = Array.from(block.querySelectorAll('.ep-page-frame')) as HTMLElement[];
    const spacers = Array.from(block.querySelectorAll('.ep-page-spacer')) as HTMLElement[];
    const pageH = parseFloat(getComputedStyle(block).getPropertyValue('--ep-page-h')) || 0;
    return {
      blockHeight: block.offsetHeight,
      pageH,
      frameCount: frames.length,
      nonZeroSpacers: spacers.filter((s) => s.getBoundingClientRect().height > 1).length,
      secondFrameTop: frames[1] ? Math.round(frames[1].getBoundingClientRect().top - brect.top) : 0,
    };
  }, no);
}

// Types `lines` Enter-separated single-line paragraphs into CASE `no`'s description — reliably taller
// than one A4 page and, crucially, MADE OF MANY BLOCKS (so the paginator can break BETWEEN paragraphs;
// a single giant block can't be split, that's the documented limit). Each line is its own block.
async function fillPastOnePage(page: Page, no: number, lines: number) {
  const content = caseBlock(page, no).locator('.ep-case-content').first();
  await content.click({ position: { x: 40, y: 40 } });
  for (let i = 0; i < lines; i++) {
    await page.keyboard.type(`Ligne ${i} de description assez longue pour bien remplir la planche.`);
    await page.keyboard.press('Enter');
  }
}

// Asserts CASE 1 reflowed onto ≥2 bordered A4 sheets with a real gap and ≥1 reflow spacer. Retries the
// read (pagination measures on rAF after the last keystroke settles) so the check is deterministic.
async function expectMultiSheetReflow(page: Page) {
  await expect
    .poll(async () => (await paginationGeometry(page, 1))?.frameCount ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  const geo = (await paginationGeometry(page, 1))!;
  expect(geo.pageH).toBeGreaterThan(0);
  // Content grew past one page → the block is taller than a single A4 sheet.
  expect(geo.blockHeight).toBeGreaterThan(geo.pageH);
  // A block that would cross the page boundary was pushed down → at least one real reflow spacer.
  expect(geo.nonZeroSpacers).toBeGreaterThanOrEqual(1);
  // The 2nd sheet is stacked below the 1st with the inter-sheet gap (top ≈ one page + gap, > pageH).
  expect(geo.secondFrameTop).toBeGreaterThan(geo.pageH);
}

test.describe('CS-4 Éditeur — A4 content reflow across bordered sheets (item 24)', () => {
  test.describe.configure({ mode: 'serial' });
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS4 A4 ${Date.now()}`);
    await addCard(page);
    await page.close();
  });

  test('CS4-E24: content past one A4 page reflows onto successive bordered sheets in BOTH Manga and Prose; caret stays put on Enter', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
    await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });
    await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 });

    // Pick the Manga scheme, then fill past one page — content must reflow onto a 2nd bordered sheet.
    await page.getByRole('button', { name: 'Manga', exact: true }).click();
    await fillPastOnePage(page, 1, 55);
    await expect(page.getByText('Enregistré ✓')).toBeVisible({ timeout: 20_000 });
    await expectMultiSheetReflow(page);

    // Switch to Prose — the SAME long document must paginate identically (this is the blocker-1 fix:
    // prose hid the case chrome and pagination stopped reflowing; it must now behave like Manga).
    await page.getByRole('button', { name: 'Prose', exact: true }).click();
    await expect(page.locator('.ep-planche-canvas.ep-mode-prose')).toBeVisible({ timeout: 5_000 });
    await expectMultiSheetReflow(page);

    // Caret stability: with the doc paginated, press Enter then type a marker — it lands right after
    // the caret (the frames/spacers are view-only decorations that never touch the doc position).
    const lastPara = caseBlock(page, 1).locator('[data-case-description] p').last();
    await lastPara.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('MARQUEUR-FIN', { delay: 20 });
    await expect(caseBlock(page, 1).locator('[data-case-description] p').last()).toHaveText('MARQUEUR-FIN');
  });
});

test.describe('CS-4 Éditeur — realtime collaboration (two browser contexts)', () => {
  let pageId = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}`);
    await addCard(page);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    // Grab the pageId from the kanban ✎ link href (avoids relying on the modal's own routing).
    const href = await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).getAttribute('href');
    pageId = href!.split('/editeur/')[1];
    await page.close();
  });

  test('CS4-RT: presence, named colored carets, live CRDT merge, typing indicator, live comment', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    await login(a, OWNER_EMAIL); // "E2E CS12_OWNER"
    await login(b, COLLAB_EMAIL); // "E2E CS12_COLLAB"

    // Staggered joins (not simultaneous `goto`s): avoids the plan's documented pre-materialization
    // double-join race (D-seeding) so the CRDT/caret/typing/comment assertions below get a clean
    // signal independent of the presence-count bug asserted next.
    await a.goto(`/projet/${MULTI_SLUG}/editeur/${pageId}`);
    await expect(caseBlock(a, 1)).toBeVisible({ timeout: 10_000 });
    await a.waitForTimeout(1000);
    await b.goto(`/projet/${MULTI_SLUG}/editeur/${pageId}`);
    await expect(caseBlock(b, 1)).toBeVisible({ timeout: 10_000 });
    await a.waitForTimeout(1500);
    await b.waitForTimeout(1500);

    // CRDT merge: A types into CASE 1 → the text (and A's named colored caret) appear live in B,
    // with no error UI (conflict is a merge, not a rejection). Asserted BEFORE the presence-count
    // block below so a failure there can't cascade-skip this coverage.
    await typeIntoCase(a, 1, 'Camille : tu savais que je viendrais.');
    await expect(caseBlock(b, 1)).toContainText('Camille : tu savais que je viendrais.', { timeout: 15_000 });
    await expect(b.locator('.collaboration-carets__label', { hasText: 'E2E CS12_OWNER' })).toBeVisible({ timeout: 10_000 });
    // No error UI (conflict is a merge, not a rejection) — scoped to `main` since the app shell
    // carries its own always-present (empty) global toast `role="alert"` region unrelated to CS-4.
    await expect(b.locator('main').getByRole('alert')).toHaveCount(0);

    // Typing indicator: while A is actively typing, B's sidebar shows "{A} écrit…".
    const typingLocator = caseBlock(a, 1).locator('[data-case-dialogue] p').first();
    await typingLocator.click();
    await a.keyboard.type('Encore une réplique en train de s’écrire', { delay: 80 });
    await expect(b.getByText(/écrit…/)).toBeVisible({ timeout: 5_000 });

    // Presence: with two real members joined, BOTH header counts must read EXACTLY "2 en ligne" — no
    // more, no less. This is the self-duplication regression guard: `CollaborationCaret`'s ProseMirror
    // view mount overwrites the app's `{id,name,color,role}` Yjs-awareness "user" field with `{name,color}`
    // only, stripping `id`, so `readPeers()` (EditorClient.tsx) MUST self-exclude on the Yjs clientID, not
    // user.id. If it regressed to id-keyed exclusion each client would re-count itself and read "3 en
    // ligne". (The named presence roster was removed — presence now lives in the header count + the avatar
    // stack; see EditorClient.test.tsx "the En ligne presence roster is intentionally gone".)
    await expect(a.getByText('2 en ligne')).toBeVisible({ timeout: 15_000 });
    await expect(b.getByText('2 en ligne')).toBeVisible({ timeout: 15_000 });
    await expect(a.getByText('3 en ligne')).toHaveCount(0);
    await expect(b.getByText('3 en ligne')).toHaveCount(0);

    // A's autosave materializes the scenario (v1) — B's toolbar picks up the version chip too.
    await expect(a.getByText('Enregistré ✓')).toBeVisible({ timeout: 15_000 });
    await expect(a.getByText('v1')).toBeVisible({ timeout: 10_000 });

    // Comments: A posts a comment → it appears live in B, anchored to the right case, no reload.
    await a.getByLabel(/Ajouter un commentaire à la case/).fill('Yuki: on garde cette version ?');
    await a.getByRole('button', { name: '＋ Commentaire' }).click();
    await expect(a.getByText('Yuki: on garde cette version ?')).toBeVisible({ timeout: 10_000 });
    const postedInB = commentItem(b, 'Yuki: on garde cette version ?');
    await expect(postedInB).toBeVisible({ timeout: 10_000 });
    await expect(postedInB.getByText('case 1', { exact: true })).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('CS-4 Éditeur — authorization (non-member)', () => {
  test('CS4-E8: a non-member opening a private project\'s editor URL sees "Éditeur indisponible" (no leak)', async ({ page }) => {
    const ownerPage = await page.context().browser()!.newPage();
    await login(ownerPage, OWNER_EMAIL);
    const slug = await createProject(ownerPage, `E2E CS4 Privé ${Date.now()}`);
    await addCard(ownerPage);
    const href = await kanbanCard(ownerPage, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).getAttribute('href');
    await ownerPage.close();

    await login(page, STRANGER_EMAIL);
    await page.goto(href!);
    await expect(page.getByText('Éditeur indisponible')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Cette page n’existe pas ou vous n’y avez pas accès.')).toBeVisible();
  });
});

test.describe('CS-4 Éditeur — responsive sweep (375/768/1280)', () => {
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS4 Responsive ${Date.now()}`);
    await addCard(page);
    await page.close();
  });

  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label} — editor shell: no horizontal overflow, sidebar adapts`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, OWNER_EMAIL);
      await page.goto(`/projet/${slug}`);
      await kanbanCard(page, 'Page 1').getByRole('link', { name: 'Éditer le scénario' }).click();
      await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });
      await expect(caseBlock(page, 1)).toBeVisible({ timeout: 10_000 });

      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        // The comments sidebar stacks below the canvas, still reachable (the aside is aria-label
        // "Commentaires" — the removed presence roster no longer renders an "En ligne" heading here).
        await expect(page.locator('aside').getByText('Commentaires', { exact: true })).toBeVisible();
        await page.screenshot({ path: `test-results/cs4-editeur-${width}.png`, fullPage: true });
      }
    });
  }
});
