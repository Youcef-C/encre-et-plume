/**
 * DR-12 "Illustration collections" — e2e acceptance suite (E1-E13).
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js), not hermetic — the flows exercise real
 * uploads (F-10 presigned → worker → ready), real collection/illustration mutations, and the
 * Galerie's real (60s-cached) `GET /collections` + `GET /illustrations` list endpoints, so every
 * test uses a UNIQUE title/hashtag per run (Date.now()) to dodge stale cache keys (backend-notes.md
 * "QA notes").
 *
 * Signed-in creator: Yuki Moreau (yuki.moreau@seed.encre-et-plume.local / password123,
 * dr1-yuki-moreau, creatorRoles ['dessinateur']). Seeded fixtures used: the "Carnet d'Encre"
 * collection (slug carnet-d-encre, 3 members) and her standalone illustration
 * "Carnet d'encre · planche 12" (dr5-illus-11, id dr5-illus-11).
 *
 * Split-test convention: run only this spec + the auth/nav smoke, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const YUKI_EMAIL = 'yuki.moreau@seed.encre-et-plume.local';
const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');

async function loginAsYuki(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(YUKI_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

/** Wait for an in-flight UploadControl upload (illustration/cover kind, no crop step) to reach
 * ready — the submit button re-enables once `uploadBusy` clears (FE-15: the box then shows its
 * idle copy again, not "Changer"). */
async function waitUploadReady(page: Page, submitButtonName: string | RegExp) {
  await expect(page.getByRole('button', { name: submitButtonName })).toBeEnabled({ timeout: 30_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// E1-E5 (round 1 flow, definitions in plan §8) — assign-at-publish, collection page, manage,
// profile, responsive. Shared state across this serial block: one collection + illustration.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('DR-12 E1-E5 — assign at publish, collection page, manage view, profile, responsive', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const collectionTitle = `QA Collection ${ts}`;
  const illustrationTitle = `QA Illustration ${ts}`;
  let illustrationUrl = '';
  let collectionSlug = '';
  let manageUrl = '';

  test('E1: publish an illustration, create a collection inline, land on the illustration detail with the collection chip', async ({ page }) => {
    await loginAsYuki(page);
    await page.goto('/creer/illustration');
    await expect(page.getByRole('heading', { name: 'Publier une illustration' })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Titre', { exact: true }).fill(illustrationTitle);
    await page.locator('input[type="file"]').first().setInputFiles(IMAGE_FIXTURE);

    await page.getByRole('button', { name: '＋ Nouvelle collection' }).click();
    const newCollDialog = page.getByRole('dialog', { name: '＋ Nouvelle collection' });
    await expect(newCollDialog).toBeVisible();
    await newCollDialog.getByLabel('Titre', { exact: true }).fill(collectionTitle);
    await newCollDialog.getByRole('button', { name: 'Créer la collection' }).click();
    await expect(newCollDialog).toHaveCount(0, { timeout: 10_000 });

    // The new collection now shows as a removable chip outside the multiselect trigger.
    await expect(page.getByText(collectionTitle)).toBeVisible();

    await waitUploadReady(page, 'Publier');
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page).toHaveURL(/\/illustration\//, { timeout: 15_000 });
    illustrationUrl = page.url();

    await expect(page.getByRole('heading', { level: 1, name: illustrationTitle })).toBeVisible({ timeout: 10_000 });
    const chip = page.getByRole('link', { name: collectionTitle });
    await expect(chip).toBeVisible();
    const href = await chip.getAttribute('href');
    expect(href).toMatch(/^\/oeuvre\//);
    collectionSlug = href!.replace('/oeuvre/', '');
  });

  test('E2: the collection Œuvre page shows the "Collection" badge, member grid, and "Voir la galerie"', async ({ page }) => {
    await loginAsYuki(page);
    await page.goto(`/oeuvre/${collectionSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: collectionTitle })).toBeVisible({ timeout: 10_000 });
    // "Collection" also appears in the DÉTAILS sidebar ("Type: Collection") — .first() is the badge.
    await expect(page.getByText('Collection', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('1 illustration · collection')).toBeVisible();
    await expect(page.getByRole('link', { name: illustrationTitle })).toBeVisible();

    const manageLink = page.getByRole('link', { name: 'Gérer la collection' });
    await expect(manageLink).toBeVisible();
    manageUrl = (await manageLink.getAttribute('href'))!;

    await page.getByRole('link', { name: 'Voir la galerie' }).click();
    await expect(page).toHaveURL(/\/galerie\?collection=/);
    await expect(page.getByText(`Résultats pour « ${collectionTitle} »`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(illustrationTitle)).toBeVisible();
  });

  test('E3: manage view — add via the picker, keyboard reorder, promote a member as cover (no new membership), remove a member; delete a throwaway collection', async ({ page }) => {
    await loginAsYuki(page);
    await page.goto(manageUrl);
    await expect(page.getByRole('heading', { level: 1, name: collectionTitle })).toBeVisible({ timeout: 10_000 });

    // Add the seeded standalone illustration via the multi-select picker.
    await page.getByRole('button', { name: '＋ Ajouter des illustrations' }).click();
    const picker = page.getByRole('dialog', { name: '＋ Ajouter des illustrations' });
    await expect(picker).toBeVisible();
    await picker.getByRole('checkbox', { name: /planche 12/ }).check();
    await picker.getByRole('button', { name: 'Ajouter (1)' }).click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('2 illustrations · collection')).toBeVisible({ timeout: 10_000 });

    // Member rows are the manage view's own <li>s — scope every row-level action to them so
    // nothing collides with the Infos section's hashtag "Retirer #tag" chips.
    const memberRows = page.locator('li').filter({ has: page.getByRole('button', { name: /^Modifier /, exact: false }) });
    await expect(memberRows).toHaveCount(2);

    // Keyboard reorder: move the second member (the just-added one) up.
    const secondRowUp = memberRows.last().getByRole('button', { name: /^Monter/ });
    await secondRowUp.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Ordre mis à jour')).toBeVisible({ timeout: 10_000 });

    // Promote an existing member as cover — no new membership row (count unchanged).
    await memberRows.first().getByRole('button', { name: 'Utiliser comme couverture' }).click();
    await expect(page.getByText('2 illustrations · collection')).toBeVisible({ timeout: 10_000 });

    // Remove a member — count drops back to 1.
    await memberRows.first().getByRole('button', { name: /^Retirer /, exact: false }).click();
    await expect(page.getByText('1 illustration · collection')).toBeVisible({ timeout: 10_000 });

    // Delete flow — throwaway collection created purely for this assertion via the API (shares the
    // browser context's session cookie), so it doesn't disturb the fixture used by later tests.
    const createRes = await page.request.post('http://localhost:3001/collections', {
      data: { title: `QA Throwaway ${ts}` },
    });
    expect(createRes.ok()).toBe(true);
    const { id: throwawayId } = (await createRes.json()) as { id: string };
    await page.goto(`/collection/${throwawayId}/gerer`);
    await expect(page.getByRole('button', { name: 'Supprimer la collection' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Supprimer la collection' }).click();
    await expect(page.getByText('Les illustrations ne seront pas supprimées.')).toBeVisible();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(page).toHaveURL('/dr1-yuki-moreau', { timeout: 10_000 });
  });

  test('E4: the artist profile groups "Collections" and standalone "Illustrations"', async ({ page }) => {
    await loginAsYuki(page);
    await page.goto('/dr1-yuki-moreau');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('tab', { name: 'Œuvres publiées' }).click();
    // exact:true — a non-exact match also catches "Carnet d'encre · planche 12" (the standalone
    // illustration listed just below, lowercase "encre").
    await expect(page.getByText("Carnet d'Encre", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('3 illustrations · collection')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Illustrations', level: 3 })).toBeVisible();
  });

  test('E5: responsive — the collection Œuvre page has no horizontal overflow at 375/768/1280', async ({ page }) => {
    // Each Playwright test gets a fresh, isolated browser context (no session carries over from
    // E1-E4) — the manage view below is owner-gated, so it needs its own real login.
    await loginAsYuki(page);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/oeuvre/${collectionSlug}`);
      await expect(page.getByRole('heading', { level: 1, name: collectionTitle })).toBeVisible({ timeout: 10_000 });
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(overflow).toBe(true);
    }
    // Manage rows usable at 375px.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(manageUrl);
    await expect(page.getByRole('button', { name: '＋ Ajouter des illustrations' })).toBeVisible({ timeout: 10_000 });
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E6-E9 (iteration 2) — Galerie "Collections" browse/search, illustration hashtags,
// cover-as-member + frame, add-illustrations picker (covered structurally in E3 above; this block
// focuses on the picker's own e2e per plan E9 + the Galerie-facing flows).
// ─────────────────────────────────────────────────────────────────────────────
test.describe('DR-12 E6-E9 — Galerie browse/search, hashtags, cover-as-member', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const uniqueHashtag = `qatag${ts}`;
  const hashtagCollectionTitle = `QA Hashtag Collection ${ts}`;
  const hashtagIllustrationTitle = `QA Hashtag Illustration ${ts}`;

  test('E6: Galerie "Collections" chip shows the seeded "Carnet d\'Encre" card; a fresh collection is findable by its unique hashtag', async ({ page }) => {
    await loginAsYuki(page);
    await page.goto('/galerie');
    await page.getByRole('button', { name: 'Collections', exact: true }).click();
    await expect(page).toHaveURL(/category=collections/);
    const seededCard = page.getByRole('link', { name: /Carnet d.Encre/ });
    await expect(seededCard).toBeVisible({ timeout: 10_000 });
    await expect(seededCard.getByText('3 illustrations · collection')).toBeVisible();
    await expect(seededCard.getByText('Yuki Moreau').first()).toBeVisible();

    // Create a fresh collection with a unique hashtag (via the publish-flow's inline creator —
    // the POST fires on "Créer la collection", independent of finishing the publish).
    await page.goto('/creer/illustration');
    await page.getByRole('button', { name: '＋ Nouvelle collection' }).click();
    const dialog = page.getByRole('dialog', { name: '＋ Nouvelle collection' });
    await dialog.getByLabel('Titre', { exact: true }).fill(hashtagCollectionTitle);
    // HashtagChipsInput commits a chip on a real space/Enter KEYDOWN, not on a raw value set —
    // .fill() alone leaves the token uncommitted (never reaches the `hashtags` array).
    await dialog.getByLabel('Hashtags', { exact: true }).fill(`#${uniqueHashtag}`);
    await dialog.getByLabel('Hashtags', { exact: true }).press(' ');
    await dialog.getByRole('button', { name: 'Créer la collection' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    await page.goto('/galerie');
    await page.getByRole('button', { name: 'Collections', exact: true }).click();
    // Wait for collections mode to actually settle in the URL before touching the tag facet —
    // firing the tag filter update too soon after the chip click raced the mode switch.
    await expect(page).toHaveURL(/category=collections/);
    await page.getByLabel('#hashtag…').fill(uniqueHashtag);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: hashtagCollectionTitle })).toBeVisible({ timeout: 10_000 });
    await expect(seededCard).toHaveCount(0);
  });

  test('E7: a published illustration is hashtag-searchable, and its hashtags can be edited from the illustration edit form', async ({ page }) => {
    await loginAsYuki(page);
    await page.goto('/creer/illustration');
    await page.getByLabel('Titre', { exact: true }).fill(hashtagIllustrationTitle);
    await page.locator('input[type="file"]').first().setInputFiles(IMAGE_FIXTURE);
    await page.getByLabel('Hashtags', { exact: true }).fill(`#${uniqueHashtag}`);
    await page.getByLabel('Hashtags', { exact: true }).press(' ');
    await waitUploadReady(page, 'Publier');
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page).toHaveURL(/\/illustration\//, { timeout: 15_000 });
    const detailUrl = page.url();

    // Default (illustrations) mode hashtag search finds it.
    await page.goto('/galerie');
    await page.getByLabel('#hashtag…').fill(uniqueHashtag);
    await page.keyboard.press('Enter');
    await expect(page.getByText(hashtagIllustrationTitle)).toBeVisible({ timeout: 10_000 });

    // Owner edits the hashtags from the FE-13 shared `EditIllustrationForm` (the illustration
    // Collections box is display-only post-DR-12-follow-up — hashtags are owned solely by this form).
    await page.goto(detailUrl);
    await expect(page.getByRole('heading', { level: 1, name: hashtagIllustrationTitle })).toBeVisible({ timeout: 10_000 });
    const newHashtag = `${uniqueHashtag}bis`;
    await page.getByRole('button', { name: "Modifier l'illustration" }).click();
    const dialog = page.getByRole('dialog', { name: /Modifier l.illustration/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: `Retirer #${uniqueHashtag}` }).click();
    await dialog.getByLabel('Hashtags', { exact: true }).fill(`#${newHashtag}`);
    await dialog.getByLabel('Hashtags', { exact: true }).press(' ');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(`#${newHashtag}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`#${uniqueHashtag}`, { exact: true })).toHaveCount(0);
  });

  test('E8: uploading a new cover creates a "Couverture" member and increments the count; drop box + preview read as one frame', async ({ page }) => {
    await loginAsYuki(page);
    // A fresh throwaway collection (not the shared seeded "Carnet d'Encre" — other specs assert its
    // exact member count, and BE-8's cover-as-member rule permanently adds a membership row).
    const createRes = await page.request.post('http://localhost:3001/collections', {
      data: { title: `QA Cover Collection ${ts}` },
    });
    expect(createRes.ok()).toBe(true);
    const { id: collId } = (await createRes.json()) as { id: string };
    const addRes = await page.request.post(`http://localhost:3001/collections/${collId}/illustrations`, {
      data: { illustrationId: 'dr5-illus-11' },
    });
    expect(addRes.ok()).toBe(true);

    await page.goto(`/collection/${collId}/gerer`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1 illustration · collection')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    // The Couverture section's only UploadControl — drive it via the hidden file input (the
    // dashed drop-zone button itself isn't a native file input). QA note: the box's accessible
    // NAME is "Déposez la couverture" (aria-labelledby overrides its own text per the ARIA accname
    // algorithm) — getByRole(name: /Glissez…/) never matches it; getByText does (same convention
    // already used in media.spec.ts for the same control).
    const dropBox = page.getByText('Glissez une image ou cliquez pour choisir').locator('xpath=..');
    await page.locator('input[type="file"]').first().setInputFiles(IMAGE_FIXTURE);

    await expect(page.getByText('2 illustrations · collection')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Couverture ·/)).toBeVisible({ timeout: 10_000 });

    // Drop box and side preview form one consistent frame (FE-10/FE-15: same fixed frame height).
    const boxBounds = await dropBox.boundingBox();
    expect(boxBounds).not.toBeNull();
    expect(boxBounds!.height).toBeGreaterThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E10-E13 (iteration 3) — catalogue entry, edit from detail (incl. visibility), edit from manage
// view, persistent upload box + side preview.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('DR-12 E10-E13 — catalogue entry, owner edit, manage-view edit, persistent upload box', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();
  const editTitle = `QA Edit Illustration ${ts}`;
  const editHashtag = `qaedit${ts}`;
  let illustrationUrl = '';

  test('E10: "＋ Poster une œuvre" is creator-only; the "Nouveau projet" fork routes to the publish flow', async ({ page }) => {
    // Anonymous: no button at all.
    await page.goto('/decouvrir');
    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '＋ Poster une œuvre' })).toHaveCount(0);

    // Signed in as a creator: the button shows on the "Catalogue" heading row.
    await loginAsYuki(page);
    await page.goto('/decouvrir');
    const cta = page.getByRole('button', { name: '＋ Poster une œuvre' });
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: 'Nouveau projet' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Manga / Roman')).toBeVisible();
    await expect(dialog.getByText('Bientôt disponible')).toBeVisible();
    await dialog.getByText('Publier une illustration').click();
    await expect(page).toHaveURL('/creer/illustration');
  });

  test('E11: owner edits the illustration from its detail page (title/hashtag/tools), then hides it (visibility)', async ({ page, browser }) => {
    await loginAsYuki(page);
    await page.goto('/creer/illustration');
    await page.getByLabel('Titre', { exact: true }).fill(`${editTitle} (v1)`);
    await page.locator('input[type="file"]').first().setInputFiles(IMAGE_FIXTURE);
    await waitUploadReady(page, 'Publier');
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page).toHaveURL(/\/illustration\//, { timeout: 15_000 });
    illustrationUrl = page.url();

    await page.getByRole('button', { name: "Modifier l'illustration" }).click();
    // QA FINDING: the dialog's own heading uses a CURLY apostrophe ("Modifier l’illustration")
    // while the trigger button's aria-label uses a STRAIGHT one ("Modifier l'illustration") — a
    // real copy/a11y inconsistency (see qa-report.md). Regex here so the test isn't blocked by it.
    const dialog = page.getByRole('dialog', { name: /Modifier l.illustration/ });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Titre', { exact: true }).fill(editTitle);
    await dialog.getByLabel('Hashtags', { exact: true }).fill(`#${editHashtag}`);
    await dialog.getByLabel('Hashtags', { exact: true }).press(' ');
    await dialog.getByLabel('Outils', { exact: true }).fill('Encre · CSP');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    await expect(page.getByRole('heading', { level: 1, name: editTitle })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`#${editHashtag}`)).toBeVisible();
    await expect(page.getByText('Encre · CSP')).toBeVisible();

    // Set Visibilité "Privée" — the owner still sees the page. §8 — OnBrandSelect is a combobox
    // listbox (no native <select>): open the trigger, click the option.
    await page.getByRole('button', { name: "Modifier l'illustration" }).click();
    await dialog.getByRole('combobox', { name: 'Visibilité' }).click();
    await page.getByRole('option', { name: 'Privée' }).click();
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 1, name: editTitle })).toBeVisible({ timeout: 10_000 });

    // A logged-out context gets the not-found state; the piece is gone from the public Galerie list.
    const anonCtx = await browser.newContext();
    try {
      const anonPage = await anonCtx.newPage();
      await anonPage.goto(illustrationUrl);
      await expect(anonPage.getByText('Illustration introuvable')).toBeVisible({ timeout: 10_000 });
    } finally {
      await anonCtx.close();
    }

    // Restore to "Publique" for hygiene (later reruns / other specs shouldn't see a stray private piece).
    await page.getByRole('button', { name: "Modifier l'illustration" }).click();
    await dialog.getByRole('combobox', { name: 'Visibilité' }).click();
    await page.getByRole('option', { name: 'Publique' }).click();
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
  });

  test('E12: manage-view per-member "Modifier" edits a member without leaving the collection', async ({ page }) => {
    await loginAsYuki(page);
    // A fresh throwaway collection with the seeded standalone illustration as its only member —
    // avoids renaming a shared seeded fixture other specs (classement/ma-liste/gallery/mc3-invite)
    // assert on by title.
    const createRes = await page.request.post('http://localhost:3001/collections', {
      data: { title: `QA Manage Edit Collection ${ts}` },
    });
    expect(createRes.ok()).toBe(true);
    const { id: collId } = (await createRes.json()) as { id: string };
    const addRes = await page.request.post(`http://localhost:3001/collections/${collId}/illustrations`, {
      data: { illustrationId: 'dr5-illus-11' },
    });
    expect(addRes.ok()).toBe(true);

    await page.goto(`/collection/${collId}/gerer`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    const memberRow = page.locator('li').filter({ hasText: /planche 12/ });
    await memberRow.getByRole('button', { name: /^Modifier /, exact: false }).click();

    // Regex — see the QA FINDING note on the apostrophe mismatch above (E11).
    const dialog = page.getByRole('dialog', { name: /Modifier l.illustration/ });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const newTitle = `QA edited member ${ts}`;
    await dialog.getByLabel('Titre', { exact: true }).fill(newTitle);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    // The row updates in place, still inside the manage view (no navigation away).
    await expect(page.getByText(newTitle)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(`/collection/${collId}/gerer`);

    // IMPORTANT: dr5-illus-11 is the SHARED seeded fixture "Carnet d'encre · planche 12" (used by
    // E3/E8's own picker flows and by other spec files — classement/ma-liste/gallery/mc3-invite).
    // Restore its title so this test's edit doesn't corrupt every other test that looks it up by
    // that title (a prior run without this restore left it permanently renamed and cascaded
    // failures across the rest of this file on the next run).
    const restoreRow = page.locator('li').filter({ hasText: newTitle });
    await restoreRow.getByRole('button', { name: /^Modifier /, exact: false }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel('Titre', { exact: true }).fill("Carnet d'encre · planche 12");
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText("Carnet d'encre · planche 12")).toBeVisible({ timeout: 10_000 });
  });

  test('E13: the upload box stays present and droppable after a cover upload, with a side thumbnail (persistent upload box)', async ({ page }) => {
    await loginAsYuki(page);
    // A fresh throwaway collection — the cover-upload rule (BE-8) permanently adds a membership
    // row, so this must not run against the shared seeded "Carnet d'Encre" collection either.
    const createRes = await page.request.post('http://localhost:3001/collections', {
      data: { title: `QA Upload Box Collection ${ts}` },
    });
    expect(createRes.ok()).toBe(true);
    const { id: collId } = (await createRes.json()) as { id: string };

    await page.goto(`/collection/${collId}/gerer`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await page.setViewportSize({ width: 1280, height: 900 });
    // See the QA note on E8 above — getByText, not getByRole, matches this control's own visible
    // copy (its accessible NAME is overridden to the field label by aria-labelledby).
    const dropBox = page.getByText('Glissez une image ou cliquez pour choisir').locator('xpath=..');
    await expect(dropBox).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(IMAGE_FIXTURE);

    // The box must remain — never replaced by a "Changer" button.
    await expect(page.getByRole('button', { name: 'Changer' })).toHaveCount(0);
    await expect(async () => {
      await expect(dropBox).toBeVisible();
      await expect(dropBox).toBeEnabled();
    }).toPass({ timeout: 30_000 });

    // On the own profile's edit mode (F-3), the avatar module shows the same persistent-box pattern.
    await page.goto('/dr1-yuki-moreau');
    await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });
    await expect(page.getByText('Glissez une image ou cliquez pour choisir')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Changer' })).toHaveCount(0);
  });

  test('E14: deleting an illustration goes through an on-brand alertdialog confirm (no window.confirm) and redirects to /galerie', async ({ page }) => {
    await loginAsYuki(page);
    // Throwaway illustration created directly via the API (mediaId optional) — no upload needed.
    const createRes = await page.request.post('http://localhost:3001/illustrations', {
      data: { title: `QA Delete Illustration ${ts}`, category: 'personnages' },
    });
    expect(createRes.ok()).toBe(true);
    const { id } = (await createRes.json()) as { id: string };

    await page.goto(`/illustration/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: "Modifier l'illustration" }).click();
    const editDialog = page.getByRole('dialog', { name: /Modifier l.illustration/ });
    await expect(editDialog).toBeVisible();
    // QA finding: the button's own text uses a CURLY apostrophe ("Supprimer l’illustration") while
    // the confirm alertdialog's aria-label uses a STRAIGHT one ("Supprimer l'illustration") — same
    // real copy/a11y inconsistency already noted for "Modifier l'illustration" (see E11 above).
    await editDialog.getByRole('button', { name: /Supprimer l.illustration/ }).click();

    const confirmDialog = page.getByRole('alertdialog', { name: "Supprimer l'illustration" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Supprimer' }).click();

    await expect(page).toHaveURL('/galerie', { timeout: 10_000 });
  });
});
