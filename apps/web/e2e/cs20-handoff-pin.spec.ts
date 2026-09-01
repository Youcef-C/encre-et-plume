/**
 * CS-20 — « Passation du scénario » (scenario handoff pin) — scoped e2e acceptance suite.
 *
 * Real backend, real editor, real versions. The card is dragged out of Scénario (which stamps the
 * pin server-side), the scenarist then snapshots a new version, and the board/card modal must say so
 * without ever blocking anything.
 *
 * Fixture: qa_e2e_cs12_owner@test.com creates its OWN fresh project (timestamped title) — the pin is
 * per card and this spec mutates the card's stage and its scenario's version chain, so sharing a
 * seeded project with another spec would cross-contaminate under parallel workers.
 *
 * Split-test convention (CLAUDE.md): this spec + the auth/nav smoke only.
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
const MARKER = 'Le scénario a changé depuis la passation';

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

async function ensureChapter(page: Page) {
  const add = page.getByRole('button', { name: '＋ Ajouter une carte' }).first();
  const cta = page.getByRole('button', { name: 'Créer un chapitre' });
  await expect(add.or(cta).first()).toBeVisible({ timeout: 15_000 });
  if (await add.isVisible().catch(() => false)) return;
  await cta.click();
  await expect(add).toBeVisible({ timeout: 8_000 });
}

function kanbanCard(page: Page, title: string) {
  return page.locator('div[draggable="true"]').filter({ hasText: title });
}

function caseBlock(page: Page, no: number) {
  return page.locator(`[data-case-block][data-case-no="${no}"]`);
}

async function typeIntoCase(page: Page, no: number, text: string) {
  const para = caseBlock(page, no).locator('[data-case-description] p').first();
  const box = await para.boundingBox();
  if (box) await para.click({ position: { x: box.width - 2, y: box.height - 2 } });
  else await para.click();
  await page.keyboard.type(text, { delay: 15 });
}

// CS-21 — no save button: the client compacts ~5s after the last edit. Wait for that PATCH.
async function saveDoc(page: Page) {
  await page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && /\/pages\/[^/]+\/document/.test(r.url()) && r.ok(),
    { timeout: 20_000 },
  );
  await expect(page.getByText('Enregistré', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function openEditor(page: Page, slug: string, cardTitle: string) {
  await page.goto(`/projet/${slug}`);
  await kanbanCard(page, cardTitle).getByRole('link', { name: 'Éditer le scénario' }).click();
  await expect(page).toHaveURL(new RegExp(`/projet/${slug}/editeur/`), { timeout: 10_000 });
}

test.describe('CS-20 — scenario handoff pin', () => {
  test.describe.configure({ mode: 'serial' });

  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS20 Passation ${Date.now()}`);
    await ensureChapter(page);
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });
    await page.close();
  });

  test('CS20-E1: a card with no scenario at all moves out of Scénario with no prompt and no pin', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 5_000 });

    const card = kanbanCard(page, 'Page 2');
    await card.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
    await page.getByRole('menuitem', { name: 'Nemu' }).click();

    const nemuCol = page.getByRole('group').filter({ hasText: 'Nemu' });
    await expect(nemuCol.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(MARKER)).toHaveCount(0);
  });

  test('CS20-E2: an unsaved scenario offers « Créer une version »; « Passer sans version » still moves and pins the head', async ({ page }) => {
    await login(page, OWNER_EMAIL);

    // v1 — the first real content materializes the scenario asset.
    await openEditor(page, slug, 'Page 1');
    await typeIntoCase(page, 1, 'Rin pousse la porte du sanctuaire.');
    await saveDoc(page);
    await expect(page.getByRole('combobox', { name: 'Version affichée' })).toBeVisible({ timeout: 10_000 });

    // A further save moves the draft AHEAD of v1 without creating a version → the offer's signal.
    // The server ignores edits landing within 5s of a version write (the materialize path inserts the
    // document row AFTER v1, so a bare `>` would flag every freshly-versioned card, and interrupting a
    // move that has nothing to answer is the worse of the two errors). A human never types that fast;
    // this test does.
    await page.waitForTimeout(5_500);
    await typeIntoCase(page, 1, ' Le vent claque derrière elle.');
    await saveDoc(page);

    await page.goto(`/projet/${slug}`);
    const card = kanbanCard(page, 'Page 1');
    await card.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
    await page.getByRole('menuitem', { name: 'Nemu' }).click();

    const offer = page.getByRole('alertdialog');
    await expect(offer).toBeVisible({ timeout: 5_000 });
    await expect(offer.getByRole('link', { name: 'Créer une version' })).toHaveAttribute(
      'href',
      new RegExp(`/projet/${slug}/editeur/`),
    );
    // Feedback 2026-09-01 — the three actions fit on ONE row (short labels + wider panel).
    const boxes = await Promise.all(
      [
        offer.getByRole('button', { name: 'Annuler' }),
        offer.getByRole('button', { name: 'Passer sans version' }),
        offer.getByRole('link', { name: 'Créer une version' }),
      ].map((l) => l.boundingBox()),
    );
    expect(new Set(boxes.map((b) => Math.round(b!.y))).size).toBe(1);
    await offer.getByRole('button', { name: 'Passer sans version' }).click();

    const nemuCol = page.getByRole('group').filter({ hasText: 'Nemu' });
    await expect(nemuCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });

    // The pin is at head → the card modal states it, and no marker anywhere.
    await page.reload();
    await expect(page.getByText(MARKER)).toHaveCount(0);
    await kanbanCard(page, 'Page 1').getByText('Page 1', { exact: true }).click();
    await expect(page.getByText('dessiné d’après v1')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Fermer' }).first().click();
  });

  test('CS20-E3: saving a NEW version raises the marker with the right pair on the board face and in the card modal', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openEditor(page, slug, 'Page 1');
    await typeIntoCase(page, 1, ' Une ombre bouge au fond.');
    await saveDoc(page);
    await page.getByRole('button', { name: 'Enregistrer une nouvelle version' }).click();
    // Feedback 2026-09-01 — the version flow confirms through the base-preview modal.
    await page.getByRole('dialog', { name: 'Enregistrer une nouvelle version' }).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('combobox', { name: 'Version affichée' })).toContainText('v2', { timeout: 10_000 });

    await page.goto(`/projet/${slug}`);
    const card = kanbanCard(page, 'Page 1');
    await expect(card.getByText(MARKER)).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('v1 → v2')).toBeVisible();

    // …and the same marker in the card modal, on the SCÉNARIO files block.
    await card.getByText('Page 1', { exact: true }).click();
    await expect(page.getByRole('dialog').getByText(MARKER)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog').getByText('v1 → v2')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).first().click();
  });

  test('CS20-E4: responsive — 375 / 768 / 1280, the marker wraps and never overflows the board', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    for (const [w, h, name] of [
      [375, 812, 'mobile-375'],
      [768, 1024, 'tablet-768'],
      [1280, 900, 'desktop-1280'],
    ] as [number, number, string][]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/projet/${slug}`);
      const card = kanbanCard(page, 'Page 1');
      await expect(card.getByText(MARKER)).toBeVisible({ timeout: 10_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      // F7 — the marker WRAPS inside the card; it never widens it (the card would then push the
      // column and the board's own scroller instead of reflowing).
      const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(fits).toBe(true);
      await page.screenshot({ path: `e2e/screenshots/cs20-handoff-${name}.png`, fullPage: true });
    }
  });

  test('CS20-E5: the marker opens the EXISTING compare modal on pinned ↔ head, and « J’ai pris connaissance » clears it', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await kanbanCard(page, 'Page 1').getByText(MARKER).click();

    const compare = page.getByRole('dialog', { name: /Comparer les versions/i });
    await expect(compare).toBeVisible({ timeout: 10_000 });
    await expect(compare.getByRole('combobox', { name: 'Version à gauche' })).toContainText('v1');
    await expect(compare.getByRole('combobox', { name: 'Version à droite' })).toContainText('v2');
    await page.screenshot({ path: 'e2e/screenshots/cs20-compare-from-pin.png' });

    await compare.getByRole('button', { name: 'J’ai pris connaissance' }).click();
    await expect(page.getByText(MARKER)).toHaveCount(0, { timeout: 10_000 });

    // Persisted, not just optimistic.
    await page.reload();
    await expect(page.getByText(MARKER)).toHaveCount(0);
    await kanbanCard(page, 'Page 1').getByText('Page 1', { exact: true }).click();
    await expect(page.getByText('dessiné d’après v2')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Fermer' }).first().click();
  });

  test('CS20-E6: « Retirer la passation » drops the pin behind a confirmation', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await kanbanCard(page, 'Page 1').getByText('Page 1', { exact: true }).click();
    await expect(page.getByText('dessiné d’après v2')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Retirer la passation' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Retirer' }).click();

    await expect(page.getByText('dessiné d’après v2')).toHaveCount(0, { timeout: 10_000 });
    await page.reload();
    await kanbanCard(page, 'Page 1').getByText('Page 1', { exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Retirer la passation' })).toHaveCount(0, { timeout: 10_000 });
  });
});
