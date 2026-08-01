/**
 * CS-2 "Espace projet" — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB. The CS-12 owner fixture (qa_e2e_cs12_owner@test.com /
 * password123, scénariste) creates FRESH projects via the /creer wizard for this spec: CS-2's
 * `GET /projects/:slug` requires a linked Work (the CS-1 create transaction), and the CS-12 seed
 * fixtures (e2e-cs12-*) are plain Project rows with no Work — they 404 the workspace endpoint by
 * design, so they can't be reused here. Non-member gating uses qa_e2e_cs13_stranger@test.com
 * (signed-in, owns/collaborates on nothing here).
 *
 * No project-delete endpoint exists yet — titles are timestamp-uniquified and left in place.
 * Split-test convention: run this spec + the auth/nav smoke only.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com';
const COVER_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');

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

/** Creates a project via the /creer wizard's fast "Configurer plus tard" path (Manga, step 2 —
 *  title only), optionally toggling visibility to Public first. Returns the slug parsed from the
 *  resulting /projet/{slug} redirect (F6: wizard success now routes to the workspace, not /projets). */
async function createProject(page: Page, title: string, opts?: { public?: boolean }): Promise<string> {
  await page.goto('/creer');
  await page.getByRole('button', { name: /Continuer/ }).click(); // step 1 → 2
  await page.getByLabel('Titre du projet').fill(title);
  if (opts?.public) {
    await page.getByRole('radio', { name: 'Public' }).click();
  }
  await page.getByRole('button', { name: /Configurer plus tard/ }).click();
  await expect(page).toHaveURL(/\/projet\//, { timeout: 10_000 });
  return page.url().split('/projet/')[1];
}

test('CS2-E0: logged out /projet/{slug} redirects to sign-in', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.goto('/projet/whatever-slug');
  await expect(page).toHaveURL(/\/connexion\?next=\/projet\/whatever-slug/, { timeout: 10_000 });
  await ctx.close();
});

/**
 * R2-1: a card needs a chapter first. On a chapterless board the R2-3 empty state REPLACES the board
 * (no chip row at all), so the only affordance is its « Créer un chapitre » CTA. Wait for whichever
 * of the two renders before deciding — the board is fetched client-side, and checking too early used
 * to fall through to a chip that does not exist.
 */
async function ensureChapter(page: Page) {
  const add = page.getByRole('button', { name: '＋ Ajouter une carte' }).first();
  const cta = page.getByRole('button', { name: 'Créer un chapitre' });
  await expect(add.or(cta).first()).toBeVisible({ timeout: 15_000 });
  if (await add.isVisible().catch(() => false)) return;
  await cta.click();
  await expect(add).toBeVisible({ timeout: 8_000 });
}

test.describe('CS-2 Espace projet — signed in (e2e-cs12-owner)', () => {
  test.describe.configure({ mode: 'serial' });

  let slug = '';
  const baseTitle = `E2E CS2 Workspace ${Date.now()}`;
  let currentTitle = baseTitle;

  test('CS2-E1: creating a project lands on /projet/{slug} — header + 6-tab ARIA tablist replica', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, baseTitle);

    // Header (proto 1295–1304).
    await expect(page.getByRole('link', { name: '‹ Projets' })).toHaveAttribute('href', '/projets');
    await expect(page.getByText(baseTitle, { exact: true })).toBeVisible();
    await expect(page.getByText('E2E CS12_OWNER')).toBeVisible(); // member label (owner's display name)
    await expect(page.getByRole('button', { name: 'Gérer le groupe' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Éditeur' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' })).toBeVisible(); // aria-label overrides "Publier ▾"

    // Tab bar — ARIA tablist, 6 tabs, Tableau active by default.
    const tablist = page.getByRole('tablist', { name: 'Sections du projet' });
    await expect(tablist.getByRole('tab')).toHaveCount(6);
    for (const label of ['Tableau', 'Chapitres', 'Fichiers', 'Discussion', 'Soutien', 'Infos']) {
      await expect(tablist.getByRole('tab', { name: label })).toBeVisible();
    }
    await expect(tablist.getByRole('tab', { name: 'Tableau' })).toHaveAttribute('aria-selected', 'true');

    // Fresh project: no chapters yet. CS-7 R2-1/R2-3 — a card needs a chapter, so the empty state
    // REPLACES the board entirely (no chip row, no columns) instead of showing an inert one.
    await expect(page.getByText('Aucun chapitre pour l’instant')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Créer un chapitre' })).toBeVisible();
    await expect(page.getByRole('group')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '＋ Ajouter une carte' })).toHaveCount(0);
  });

  test('CS2-E2: TABLEAU — "＋ Ajouter une carte" creates a card; dragging it to Nemu changes its stage and persists', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);

    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    const nemuCol = page.getByRole('group').filter({ hasText: 'Nemu' });

    await ensureChapter(page);
  await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });

    const card = page.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    await card.dragTo(nemuCol);

    await expect(nemuCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toHaveCount(0);

    // Reload — stage change persisted server-side (PATCH /pages/:id/stage), not just optimistic local state.
    await page.reload();
    const nemuColAfter = page.getByRole('group').filter({ hasText: 'Nemu' });
    await expect(nemuColAfter.getByText('Page 1', { exact: true })).toBeVisible();
  });

  test('CS2-E3: keyboard move — ⋯ menu "Déplacer vers → Corrections" moves the card (also seeds the F-5 notification path)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);

    const nemuCol = page.getByRole('group').filter({ hasText: 'Nemu' });
    const card = nemuCol.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    await card.getByRole('button', { name: 'Menu' }).click();
    // R5-3: the stage move lives in the « Déplacer vers une colonne » submenu now.
    await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
    await page.getByRole('menuitem', { name: 'Corrections' }).click();

    const correctionsCol = page.getByRole('group').filter({ hasText: 'Corrections' });
    await expect(correctionsCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.reload();
    const correctionsColAfter = page.getByRole('group').filter({ hasText: 'Corrections' });
    await expect(correctionsColAfter.getByText('Page 1', { exact: true })).toBeVisible();
  });

  test('CS2-E4: INFOS — edit TITRE/SYNOPSIS/HASHTAGS, "Enregistré" appears, values persist on reload; header title updates', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=infos`);

    const newTitle = `${baseTitle} — modifié`;
    await page.getByLabel('TITRE').fill(newTitle);
    await page.getByLabel('SYNOPSIS').fill('Un synopsis e2e CS-2.');
    await page.getByLabel(/HASHTAGS/).fill('mangaqa e2e');

    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('#mangaqa')).toBeVisible();
    await expect(page.getByText('#e2e')).toBeVisible();
    // Header title in the workspace shell updates live from the save response.
    await expect(page.getByText(newTitle, { exact: true })).toBeVisible();

    await page.reload();
    await page.goto(`/projet/${slug}?tab=infos`);
    await expect(page.getByLabel('TITRE')).toHaveValue(newTitle);
    await expect(page.getByLabel('SYNOPSIS')).toHaveValue('Un synopsis e2e CS-2.');
    await expect(page.getByText(newTitle, { exact: true })).toBeVisible();

    currentTitle = newTitle;
  });

  test('CS2-E5: COVER — upload via the drop slot shows "Enregistré" and the cover persists on reload (Work.coverImage write)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=infos`);

    await expect(page.getByText('Déposez la couverture').first()).toBeVisible();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(COVER_FIXTURE);

    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByAltText("Couverture de l'œuvre")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retirer la couverture' })).toBeVisible();

    // Reload: `GET /projects/:slug` returns `cover: work.coverImage` (projects.service.ts getWorkspace) —
    // so a persisted cover after reload proves the write landed on Work.coverImage, the same field
    // DR-3's Œuvre hero reads. The hero itself is unobservable end-to-end here because the project's
    // linked Work is unpublished (`publishedAt: null` at creation — CS-9 publish is a separate,
    // unbuilt story) and `WorksService.getWork` 404s any unpublished slug regardless of viewer.
    await page.reload();
    await page.goto(`/projet/${slug}?tab=infos`);
    await expect(page.getByAltText("Couverture de l'œuvre")).toBeVisible({ timeout: 10_000 });
  });

  test('CS2-E6: deep-link ?tab=infos opens on INFOS; tab click updates the URL', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=infos`);
    await expect(page.getByRole('tab', { name: 'Infos' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('TITRE')).toBeVisible();

    await page.getByRole('tab', { name: 'Chapitres' }).click();
    await expect(page).toHaveURL(/\?tab=chapitres/);
    // The CS-2 placeholder was replaced by the real CS-7 "Chapitres" panel.
    await expect(page.getByRole('button', { name: '＋ Ajouter un chapitre' })).toBeVisible();

    await page.getByRole('tab', { name: 'Fichiers' }).click();
    await expect(page).toHaveURL(/\?tab=fichiers/);
    // The CS-2 placeholder was replaced by the real CS-3 "Importer dessins & textes" panel.
    await expect(page.getByText('Importer dessins & textes')).toBeVisible();

    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page).toHaveURL(/\?tab=discussion/);
    await expect(page.getByText("La discussion d'équipe arrive bientôt.")).toBeVisible();

    await page.getByRole('tab', { name: 'Soutien' }).click();
    await expect(page).toHaveURL(/\?tab=soutien/);
    await expect(page.getByText('Le panneau de soutien arrive bientôt.')).toBeVisible();

    await page.getByRole('tab', { name: 'Tableau' }).click();
    await expect(page).not.toHaveURL(/\?tab=/);
  });
});

test.describe('CS-2 Espace projet — authorization (non-member)', () => {
  test.describe.configure({ mode: 'serial' });

  let privateSlug = '';
  let publicSlug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    privateSlug = await createProject(page, `E2E CS2 Privé ${Date.now()}`);
    publicSlug = await createProject(page, `E2E CS2 Public ${Date.now()}`, { public: true });
    await page.close();
  });

  test('CS2-E7a: non-member on a private (default) project → "Projet introuvable" error card, no leak', async ({ page }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/projet/${privateSlug}`);
    await expect(page.getByText('Projet introuvable')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: '‹ Projets' })).toBeVisible();
  });

  test('CS2-E7b: non-member on a public project → read-only workspace (no header actions, no add-card, INFOS read-only)', async ({ page }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/projet/${publicSlug}`);

    await expect(page.getByRole('tablist', { name: 'Sections du projet' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Gérer le groupe' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Éditeur' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publier' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '＋ Ajouter une carte' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajouter un chapitre' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Infos' }).click();
    await expect(page.getByLabel('TITRE')).toHaveAttribute('readonly', '');
    // The 240×330 cover frame still shows its "Déposez la couverture" empty-state placeholder (no cover
    // set) for a read-only viewer — that's expected copy, not the control. The interactive drop control
    // (UploadControl's hidden file input) must be entirely absent for a non-member.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retirer la couverture' })).toHaveCount(0);
  });
});

test.describe('CS-2 Espace projet — responsive sweep (375/768/1280)', () => {
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS2 Responsive ${Date.now()}`);
    // Seed one card so the board has content to lay out.
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await ensureChapter(page);
  await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });
    await page.close();
  });

  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label} — TABLEAU + INFOS: no page-level horizontal overflow; board scrolls internally`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, OWNER_EMAIL);

      await page.goto(`/projet/${slug}`);
      await expect(page.getByRole('tablist', { name: 'Sections du projet' })).toBeVisible({ timeout: 10_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      await page.screenshot({ path: `test-results/cs2-tableau-${width}.png`, fullPage: true });

      await page.getByRole('tab', { name: 'Infos' }).click();
      await expect(page.getByLabel('TITRE')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      await page.screenshot({ path: `test-results/cs2-infos-${width}.png`, fullPage: true });
    });
  }
});
