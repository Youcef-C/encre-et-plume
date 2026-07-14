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

async function typeIntoCase(page: Page, no: number, text: string) {
  await caseBlock(page, no).locator('[data-case-description] p').first().click();
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

    // Canvas: "Planche N / M" + a blank CASE 1.
    await expect(page.getByText(/Planche \d+ \/ \d+/)).toBeVisible();
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
    const posted = sidebar.locator('div', { hasText: 'On raccourcit la réplique ?' }).last();
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
    await expect(page.getByText('1 en ligne')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('aside').getByText('E2E CS12_OWNER')).toHaveCount(1);
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

    // Presence: both header counts should read "2 en ligne" and each member should appear EXACTLY
    // ONCE in the sidebar roster. FAILS TODAY (real bug, kept as a real assertion, not skipped):
    // `CollaborationCaret`'s ProseMirror-view mount overwrites the app's own richer
    // `{id,name,color,role}` Yjs-awareness "user" field with `{name,color}` only (see
    // @tiptap/extension-collaboration-caret's `addProseMirrorPlugins().view()` →
    // `provider.awareness.setLocalStateField("user", user)`), which strips `id` and breaks the
    // self-exclusion filter in `readPeers()` (`components/editeur/EditorClient.tsx`) — each client
    // double-counts itself, so 2 real members show as "3 en ligne" with one name listed twice. See
    // the qa-report for the fix direction.
    const rosterA = a.locator('aside', { hasText: 'En ligne' });
    const rosterB = b.locator('aside', { hasText: 'En ligne' });
    await expect(a.getByText('2 en ligne')).toBeVisible({ timeout: 15_000 });
    await expect(b.getByText('2 en ligne')).toBeVisible({ timeout: 15_000 });
    await expect(rosterA.getByText('E2E CS12_OWNER')).toHaveCount(1);
    await expect(rosterA.getByText('E2E CS12_COLLAB')).toHaveCount(1);
    await expect(rosterB.getByText('E2E CS12_OWNER')).toHaveCount(1);
    await expect(rosterB.getByText('E2E CS12_COLLAB')).toHaveCount(1);

    // A's autosave materializes the scenario (v1) — B's toolbar picks up the version chip too.
    // FAILS TODAY (a second, separate real bug — see the qa-report): `ScenarioDocumentsService`'s
    // create-when-none path calls `MediaService.ingestAsset(html, 'text/html')`, but
    // `ASSET_ALLOWED_CONTENT_TYPES` (packages/shared/src/media.ts) never got `'text/html'` added, so
    // the autosave PATCH 400s ("Format non pris en charge") and the scenario never materializes.
    await expect(a.getByText('Enregistré ✓')).toBeVisible({ timeout: 15_000 });
    await expect(a.getByText('v1')).toBeVisible({ timeout: 10_000 });

    // Comments: A posts a comment → it appears live in B, anchored to the right case, no reload.
    await a.getByLabel(/Ajouter un commentaire à la case/).fill('Yuki: on garde cette version ?');
    await a.getByRole('button', { name: '＋ Commentaire' }).click();
    await expect(a.getByText('Yuki: on garde cette version ?')).toBeVisible({ timeout: 10_000 });
    const postedInB = b.locator('aside').locator('div', { hasText: 'Yuki: on garde cette version ?' }).last();
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
        // sidebar stacks below the canvas, still reachable (scope to the aside — "En ligne"/"en ligne"
        // also substring-matches the header count and the unrelated global "Le Comptoir" widget).
        await expect(page.locator('aside').getByText('En ligne', { exact: true })).toBeVisible();
        await page.screenshot({ path: `test-results/cs4-editeur-${width}.png`, fullPage: true });
      }
    });
  }
});
