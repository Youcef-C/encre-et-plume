/**
 * CS-3 "Importer dessins & textes" — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB (reuses the CS-12/CS-13 fixtures already seeded for CS-2/CS-12/CS-13:
 * qa_e2e_cs12_owner@test.com / password123, scénariste, and qa_e2e_cs13_stranger@test.com for the
 * non-member authz checks — see e2e-seed.js). Creates a fresh project per describe block via the
 * /creer wizard (CS-1), same pattern as cs2-espace-projet.spec.ts.
 *
 * Fixtures: fixtures/avatar-50x50.jpg (image → Dessin), fixtures/cs3-notes.txt (→ Texte),
 * fixtures/cs3-scenario-brief.txt (filename matches /sc[eé]nario/i → Scénario, used for the
 * type-derivation/search/link/version flows below), fixtures/cs3-scenario.docx (a real minimal
 * valid docx — PK zip magic + parseable word/document.xml, needed for the docx-preview
 * worker/mammoth — used ONLY in the isolated ".docx import" describe block at the bottom: as of
 * this run, POST /media/uploads 400s for kind:'asset' + the docx content-type — see that block and
 * the qa-report for the confirmed root cause (RequestUploadDto's contentType allowlist was never
 * extended for CS-3's asset-only types) — kept out of the main serial chain so that one broken
 * upload type doesn't cascade-skip unrelated coverage (search/sort/versions/link/preview/validation).
 *
 * Split-test convention: run this spec + the auth/nav smoke only, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com';

const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');
const TXT_FIXTURE = path.join(__dirname, 'fixtures/cs3-notes.txt');
const SCENARIO_TXT_FIXTURE = path.join(__dirname, 'fixtures/cs3-scenario-brief.txt');
const DOCX_FIXTURE = path.join(__dirname, 'fixtures/cs3-scenario.docx');

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

async function createProject(page: Page, title: string, opts?: { public?: boolean }): Promise<string> {
  await page.goto('/creer');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByLabel('Titre du projet').fill(title);
  if (opts?.public) {
    await page.getByRole('radio', { name: 'Public' }).click();
  }
  await page.getByRole('button', { name: /Configurer plus tard/ }).click();
  await expect(page).toHaveURL(/\/projet\//, { timeout: 10_000 });
  return page.url().split('/projet/')[1];
}

function assetCard(page: Page, filename: string) {
  return page.locator('[data-asset-card]').filter({ hasText: filename });
}

test.describe('CS-3 Fichiers — signed in (e2e-cs12-owner)', () => {
  test.describe.configure({ mode: 'serial' });

  let slug = '';
  const title = `E2E CS3 Fichiers ${Date.now()}`;

  test('CS3-E1: layout replica — tabs, drop zone (4 sources, 2 disabled), heading, empty state; import an image → grid card v1 "Dessin"', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, title);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    await expect(page.getByText('Importer dessins & textes')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Déposez vos fichiers puis liez-les aux cartes du tableau de production.')).toBeVisible();

    // Filter tabs (proto: Tout / Dessins / Textes / Scénarios)
    const tabGroup = page.getByRole('group', { name: 'Filtrer par type' });
    for (const label of ['Tout', 'Dessins', 'Textes', 'Scénarios']) {
      await expect(tabGroup.getByRole('button', { name: label })).toBeVisible();
    }
    await expect(tabGroup.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');

    // Dashed drop zone + accepted-types hint + 4 source buttons (Tablette/Cloud disabled stubs, D7)
    await expect(page.getByText('Glissez vos fichiers ici')).toBeVisible();
    await expect(page.getByText('images (.png .jpg) · dessin (.psd .clip .kra .procreate …) · textes (.txt .docx) · scénarios')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Parcourir…' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Tablette' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Lien · URL' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Cloud' })).toBeDisabled();

    await expect(page.getByText('Importés récemment')).toBeVisible();
    await expect(page.getByText('Aucun fichier importé')).toBeVisible();

    // Upload an image via the hidden multi-file input (labelled, keyboard-reachable drop-zone target)
    await page.getByLabel('Importer des fichiers').setInputFiles(IMAGE_FIXTURE);

    const card = assetCard(page, 'avatar-50x50.jpg');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Dessin ·/)).toBeVisible();
    await expect(card.getByText('v1')).toBeVisible();
    await expect(card.getByRole('button', { name: /Aperçu de avatar-50x50\.jpg/ })).toBeEnabled();
    await expect(card.getByRole('button', { name: /Lier avatar-50x50\.jpg à une carte/ })).toBeVisible();
  });

  test('CS3-E2: import .txt → "Texte" chip; import a filename matching /scénario/ → "Scénario" chip; tabs filter by type', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    // NB: uses a .txt fixture whose filename matches the scenario regex, NOT the .docx fixture —
    // see the top-of-file note and the isolated ".docx import" describe block: real .docx uploads
    // currently 400 at POST /media/uploads for every project member, a confirmed backend bug, so this
    // test keeps its (unrelated) coverage of the type-tabs/chips/scénario-derivation flow un-blocked.
    await page.getByLabel('Importer des fichiers').setInputFiles([TXT_FIXTURE, SCENARIO_TXT_FIXTURE]);

    const txtCard = assetCard(page, 'cs3-notes.txt');
    const scenarioCard = assetCard(page, 'cs3-scenario-brief.txt');
    await expect(txtCard).toBeVisible({ timeout: 30_000 });
    await expect(scenarioCard).toBeVisible({ timeout: 30_000 });
    await expect(txtCard.getByText(/Texte ·/)).toBeVisible();
    await expect(scenarioCard.getByText(/Scénario ·/)).toBeVisible();

    const tabGroup = page.getByRole('group', { name: 'Filtrer par type' });
    await tabGroup.getByRole('button', { name: 'Dessins' }).click();
    await expect(tabGroup.getByRole('button', { name: 'Dessins' })).toHaveAttribute('aria-pressed', 'true');
    await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible();
    await expect(assetCard(page, 'cs3-notes.txt')).toHaveCount(0);
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toHaveCount(0);

    await tabGroup.getByRole('button', { name: 'Scénarios' }).click();
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toBeVisible();
    await expect(assetCard(page, 'avatar-50x50.jpg')).toHaveCount(0);
    await expect(assetCard(page, 'cs3-notes.txt')).toHaveCount(0);

    await tabGroup.getByRole('button', { name: 'Tout' }).click();
    await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible();
  });

  test('CS3-E3: search + sort + card filter compose (AND); "Réinitialiser" clears all; no-match → "Aucun fichier ne correspond"', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    // Debounced filename search, auto-applies (no Appliquer button).
    await page.getByLabel('Rechercher un fichier').fill('scenario');
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toBeVisible({ timeout: 5_000 });
    await expect(assetCard(page, 'avatar-50x50.jpg')).toHaveCount(0);
    await expect(assetCard(page, 'cs3-notes.txt')).toHaveCount(0);

    // No "Appliquer" button anywhere in the filter bar.
    await expect(page.getByRole('button', { name: 'Appliquer' })).toHaveCount(0);

    // No-match search.
    await page.getByLabel('Rechercher un fichier').fill('zzz-nope-zzz');
    await expect(page.getByText('Aucun fichier ne correspond')).toBeVisible({ timeout: 5_000 });

    // Sort control — OnBrandSelect custom listbox (no native <select>).
    await page.getByLabel('Rechercher un fichier').fill('');
    await page.getByLabel('Trier les fichiers').click();
    await page.getByRole('option', { name: 'Nom A–Z' }).click();
    await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible();

    // "Réinitialiser" appears once a filter is active and clears search + tabs + sort + card filter.
    await expect(page.getByRole('button', { name: 'Réinitialiser' })).toBeVisible();
    await page.getByRole('button', { name: 'Réinitialiser' }).click();
    await expect(page.getByRole('button', { name: 'Réinitialiser' })).toHaveCount(0);
    await expect(page.getByLabel('Rechercher un fichier')).toHaveValue('');
  });

  test('CS3-E4: re-importing the same filename appends a version (v1 → v2), not a new asset; version history shows both with author + date', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible({ timeout: 10_000 }); // wait for the initial list fetch
    const before = await page.locator('[data-asset-card]').count();
    await page.getByLabel('Importer des fichiers').setInputFiles(IMAGE_FIXTURE); // re-import avatar-50x50.jpg
    const card = assetCard(page, 'avatar-50x50.jpg');
    await expect(card.getByText('v2')).toBeVisible({ timeout: 30_000 });

    // No second card was created — same total card count as before the re-import.
    await expect(page.locator('[data-asset-card]')).toHaveCount(before);

    await card.getByText('v2').click(); // opens the version-history modal (Historique des versions de …)
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('v1')).toBeVisible();
    await expect(dialog.getByText('v2')).toBeVisible();
    await expect(dialog.getByText('E2E CS12_OWNER').first()).toBeVisible(); // author name on each version row
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('CS3-E5: "Aperçu" opens an in-app preview overlay — image and .txt (no download required); Esc dismisses; "Télécharger" present', async ({ page }) => {
    // NB: the .docx→HTML preview mode is exercised in the isolated ".docx import" describe block
    // below — it currently can't even be uploaded (see that block), so it's not covered here.
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    // Image preview.
    await assetCard(page, 'avatar-50x50.jpg').getByRole('button', { name: /Aperçu de/ }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'avatar-50x50.jpg' })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('link', { name: /Télécharger/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // .txt preview — inline text, no download needed.
    await assetCard(page, 'cs3-notes.txt').getByRole('button', { name: /Aperçu de/ }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Notes de production CS-3 e2e.')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('CS3-E6: "＋ Lier à une carte" links an asset to a Tableau card; the scénario file tag surfaces on the kanban card; re-linking a scénario (multi-link type, 2026-07-14) ADDS a second card', async ({ page }) => {
    // NB: cs3-scenario-brief.txt derives to type "scenario", which the 2026-07-14 multi-card-linking
    // rule makes a MULTI-LINK type (add, not replace) — see cs3-multilink.spec.ts for the full
    // add/per-card-unlink/delete-removes-all-links/picker-copy acceptance suite. This test only
    // re-verifies the base CS-3 "link a file to a card" flow still works and reflects the new rule
    // instead of the pre-2026-07-14 "one card max" assumption it used to encode.
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);

    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });
    await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.goto(`/projet/${slug}?tab=fichiers`);
    await assetCard(page, 'cs3-scenario-brief.txt').getByRole('button', { name: /Lier cs3-scenario-brief\.txt à une carte/ }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Page 1/ }).click();
    // Multi-linking QOL: the grid picker stays open after a pick; the row reflects the link
    // (aria-pressed), and an explicit "Terminé" dismisses it.
    await expect(dialog.getByRole('button', { name: /Page 1/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Terminé' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(assetCard(page, 'cs3-scenario-brief.txt').getByText('Page 1')).toBeVisible();

    // The link is a real data-level seam into CS-2: the Tableau card now carries the "scénario" file tag.
    await page.goto(`/projet/${slug}`);
    const page1Card = page.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    await expect(page1Card.getByText('scénario')).toBeVisible({ timeout: 10_000 });

    // Linking to Page 2 ADDS a second link (scenario = multi-link type, A1/A4) — Page 1 KEEPS the tag.
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await assetCard(page, 'cs3-scenario-brief.txt').getByRole('button', { name: /Lier cs3-scenario-brief\.txt à une carte/ }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('actuellement liée à')).toBeVisible();
    await expect(dialog.getByText('Un scénario/une référence peut être liée à plusieurs cartes.')).toBeVisible();
    await dialog.getByRole('button', { name: /Page 2/ }).click();
    await expect(dialog.getByRole('button', { name: /Page 2/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Terminé' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(assetCard(page, 'cs3-scenario-brief.txt').getByText('Liée à 2 cartes')).toBeVisible();

    await page.goto(`/projet/${slug}`);
    const page1CardAfter = page.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    const page2CardAfter = page.locator('div[draggable="true"]').filter({ hasText: 'Page 2' });
    await expect(page1CardAfter.getByText('scénario')).toBeVisible({ timeout: 10_000 });
    await expect(page2CardAfter.getByText('scénario')).toBeVisible();

    // Filter-by-card composes: scoping the grid to EITHER card shows the (now dual-linked) file.
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await page.getByLabel('Filtrer par carte').click();
    await page.getByRole('option', { name: 'Page 2' }).click();
    await expect(assetCard(page, 'cs3-scenario-brief.txt')).toBeVisible();
    await expect(assetCard(page, 'avatar-50x50.jpg')).toHaveCount(0);
  });

  test('CS3-E7: validation — oversize and unsupported-extension files are rejected inline before any network call, with "Réessayer"', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    const fileInput = page.getByLabel('Importer des fichiers');

    await fileInput.setInputFiles({
      name: 'trop-gros.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(11 * 1024 * 1024, 0x41),
    });
    await expect(page.getByText(/Fichier trop volumineux/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();

    await fileInput.setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ fake exe'),
    });
    await expect(page.getByText(/Format non pris en charge/)).toBeVisible({ timeout: 5_000 });

    // Rejected files never reached the grid.
    await expect(assetCard(page, 'trop-gros.png')).toHaveCount(0);
    await expect(assetCard(page, 'malware.exe')).toHaveCount(0);
  });

  test('CS3-E8: "Lien · URL" — SSRF-guarded import rejects a private-network URL with an inline French error', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    await page.getByRole('button', { name: 'Lien · URL' }).click();
    await page.getByLabel('Adresse du fichier à importer').fill('http://169.254.169.254/latest/meta-data/');
    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  });
});

// Isolated on purpose (own project, no shared state with the serial chain above): the story requires
// ".docx" to be an accepted, previewable upload type ("images (.png .jpg .psd) · textes (.txt .docx) ·
// scénarios" hint; ".docx is an accepted upload type… and is previewable, not just downloadable").
// Round 1 found POST /media/uploads 400s for ANY .docx (or .psd) asset upload — root cause:
// apps/api/src/media/dto/request-upload.dto.ts's `@IsIn(...)` on `contentType` never got the CS-3
// asset-only types (DOCX_CONTENT_TYPE, PSD_CONTENT_TYPE). Fixed round 2 (R-B1): the DTO now spreads
// ASSET_ALLOWED_CONTENT_TYPES into the @IsIn union — see apps/api/src/media/dto/request-upload.dto.spec.ts
// (was RED, now green) for the minimal repro/regression anchor. This e2e test now passes end to end.
test.describe('CS-3 Fichiers — .docx import', () => {
  test('CS3-DOCX: uploading a .docx registers a "Scénario" asset and its "Aperçu" renders the HTML derivative', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const slug = await createProject(page, `E2E CS3 Docx ${Date.now()}`);
    await page.goto(`/projet/${slug}?tab=fichiers`);

    await page.getByLabel('Importer des fichiers').setInputFiles(DOCX_FIXTURE);
    const docxCard = assetCard(page, 'cs3-scenario.docx');
    await expect(docxCard).toBeVisible({ timeout: 30_000 });
    await expect(docxCard.getByText(/Scénario ·/)).toBeVisible();

    await docxCard.getByRole('button', { name: /Aperçu de/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const processing = dialog.getByText('Conversion en cours…');
    const rendered = dialog.getByText('Scenario e2e CS-3');
    await expect(processing.or(rendered)).toBeVisible({ timeout: 15_000 });
    if (await processing.isVisible()) {
      await expect(async () => {
        await dialog.getByRole('button', { name: 'Actualiser' }).click();
        await expect(rendered).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
    }
    await expect(rendered).toBeVisible();
  });
});

test.describe('CS-3 Fichiers — authorization (non-member)', () => {
  test.describe.configure({ mode: 'serial' });

  let privateSlug = '';
  let publicSlug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    privateSlug = await createProject(page, `E2E CS3 Privé ${Date.now()}`);
    publicSlug = await createProject(page, `E2E CS3 Public ${Date.now()}`, { public: true });
    await page.close();
  });

  test('CS3-E9a: non-member on a private project → "Projet introuvable" (no Fichiers panel leak)', async ({ page }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/projet/${privateSlug}?tab=fichiers`);
    await expect(page.getByText('Projet introuvable')).toBeVisible({ timeout: 10_000 });
  });

  test('CS3-E9b: non-member on a public project → Fichiers list 403s server-side, panel shows the fetch-error + "Réessayer" state (not the file grid)', async ({ page }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/projet/${publicSlug}?tab=fichiers`);
    await expect(page.getByText('Importer dessins & textes')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Impossible de charger les fichiers.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(page.getByLabel('Importer des fichiers')).toHaveCount(0);
  });
});

test.describe('CS-3 Fichiers — responsive sweep (375/768/1280)', () => {
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS3 Responsive ${Date.now()}`);
    await page.close();
  });

  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label} — Fichiers panel + preview overlay: no horizontal overflow, grid reflows`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, OWNER_EMAIL);
      await page.goto(`/projet/${slug}?tab=fichiers`);
      await expect(page.getByText('Importer dessins & textes')).toBeVisible({ timeout: 10_000 });

      await page.getByLabel('Importer des fichiers').setInputFiles(IMAGE_FIXTURE);
      await expect(assetCard(page, 'avatar-50x50.jpg')).toBeVisible({ timeout: 30_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        await page.screenshot({ path: `test-results/cs3-fichiers-${width}.png`, fullPage: true });
      }

      await assetCard(page, 'avatar-50x50.jpg').getByRole('button', { name: /Aperçu de/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('img', { name: 'avatar-50x50.jpg' })).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByRole('button', { name: /Fermer/ })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        await page.screenshot({ path: `test-results/cs3-preview-overlay-${width}.png`, fullPage: true });
      }
    });
  }
});
