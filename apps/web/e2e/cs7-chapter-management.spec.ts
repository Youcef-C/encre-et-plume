/**
 * CS-7 "Espace projet → Chapitres" — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB. Same fixture/pattern as cs2-espace-projet.spec.ts: the CS-12 owner
 * (qa_e2e_cs12_owner@test.com / password123) creates a FRESH project per describe block via the
 * /creer wizard, because CS-7's routes need a Project with a linked Work.
 *
 * Split-test convention: run this spec + the auth/nav smoke only, not the full e2e suite.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
/** R6-1: a real image to link as a PAGE asset — the same fixture CS-3/CS-2 iter2 import. */
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

async function createProject(page: Page, title: string): Promise<string> {
  await page.goto('/creer');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByLabel('Titre du projet').fill(title);
  await page.getByRole('button', { name: /Configurer plus tard/ }).click();
  await expect(page).toHaveURL(/\/projet\//, { timeout: 10_000 });
  return page.url().split('/projet/')[1];
}

async function openChapitres(page: Page, slug: string) {
  await page.goto(`/projet/${slug}?tab=chapitres`);
  await expect(page.getByRole('tab', { name: 'Chapitres' })).toHaveAttribute('aria-selected', 'true');
}

/** Fill the add/edit form and save. */
async function fillChapterForm(page: Page, values: { title?: string; number?: string; resume?: string }) {
  if (values.title !== undefined) {
    await page.getByLabel('TITRE').fill(values.title);
  }
  if (values.number !== undefined) {
    await page.getByLabel('N°').fill(values.number);
  }
  if (values.resume !== undefined) {
    await page.getByLabel('RÉSUMÉ').fill(values.resume);
  }
  await page.getByRole('button', { name: 'Enregistrer' }).click();
}

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

test.describe.serial('CS-7 · chapter management', () => {
  let slug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    // A bare project: zero chapters, zero cards. R2-1 makes a chapter a prerequisite for a card, so
    // the board card CS7-E4 links is created there, once its chapter exists.
    slug = await createProject(page, `E2E CS7 Chapitres ${Date.now()}`);
    await page.close();
  });

  test('CS7-E1: empty state, then "＋ Ajouter un chapitre" creates a chapter', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openChapitres(page, slug);

    await expect(page.getByText('Aucun chapitre pour le moment')).toBeVisible();

    await page.getByRole('button', { name: '＋ Ajouter un chapitre' }).click();
    await fillChapterForm(page, { title: 'Prologue — L’orage', number: '0', resume: 'Sous l’orage.' });

    await expect(page.getByText('Prologue — L’orage')).toBeVisible({ timeout: 5_000 });
    // R3-2 (reverses R2-7c): every chapter has a planned length, so the pill always carries a number.
    await expect(page.getByText('En cours · 0%')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Prologue — L’orage')).toBeVisible();
  });

  test('CS7-E2: inline edit of title / N° / résumé persists after reload', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openChapitres(page, slug);

    await page.getByRole('button', { name: 'Modifier' }).click();
    await fillChapterForm(page, { title: 'Prologue — La foudre', number: '1', resume: 'Rin trouve le sanctuaire.' });

    await expect(page.getByText('Prologue — La foudre')).toBeVisible({ timeout: 5_000 });
    await page.reload();
    await expect(page.getByText('Prologue — La foudre')).toBeVisible();
    await expect(page.getByText('Rin trouve le sanctuaire.')).toHaveCount(0); // collapsed by default
  });

  test('CS7-E3: a duplicate number is refused with a collision warning and nothing is saved', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openChapitres(page, slug);

    // A second chapter, then try to steal the first one's number.
    await page.getByRole('button', { name: '＋ Ajouter un chapitre' }).click();
    await fillChapterForm(page, { title: 'Ch. 2 — La rencontre', number: '2' });
    await expect(page.getByText('Ch. 2 — La rencontre')).toBeVisible({ timeout: 5_000 });

    const secondCard = page.getByRole('listitem').filter({ hasText: 'Ch. 2 — La rencontre' });
    await secondCard.getByRole('button', { name: 'Modifier' }).click();
    await secondCard.getByLabel('N°').fill('1');
    await secondCard.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(secondCard.getByRole('alert')).toContainText('déjà utilisé');
    await expect(secondCard.getByLabel('N°')).toHaveAttribute('aria-invalid', 'true');

    await page.reload();
    await expect(page.getByText('Ch. 2 — La rencontre')).toBeVisible();
  });

  // R5-5 — the dashed tile CREATES a page in this chapter (it used to open a link picker, retiring
  // story criterion F6). Crossing the tab boundary, per round 4's lesson: the new page must also be
  // on the Tableau board under the same chapter.
  test('CS7-E4: the dashed tile creates a page in this chapter, visible on the board too', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openChapitres(page, slug);
    const card = page.getByRole('listitem').filter({ hasText: 'Prologue — La foudre' });
    await card.getByRole('button', { name: /Prologue — La foudre/ }).click();

    // The picker is gone; only a create affordance remains.
    await expect(card.getByRole('button', { name: /Lier une page/ })).toHaveCount(0);
    await card.getByRole('button', { name: /Nouvelle page/ }).click();

    await expect(card.getByText('1 planche')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // …and it is a real board card in THIS chapter (tab boundary). CS7-E2 renumbered the Prologue
    // to 1, so its chip reads « Ch. 1 ».
    await page.getByRole('tab', { name: 'Tableau' }).click();
    await page.getByRole('button', { name: 'Ch. 1' }).click();
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  // R2-6 (retracts round 1's orphan-and-recover): deleting a chapter that still holds cards is
  // refused. The user empties it with R2-5's chapter->chapter move, and only then may delete it.
  test('CS7-E5: a chapter holding cards refuses deletion; moving the card out unblocks it', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openChapitres(page, slug);

    // 1 · blocked — the dialog states why and offers no destroy at all.
    const card = page.getByRole('listitem').filter({ hasText: 'Prologue — La foudre' });
    await card.getByRole('button', { name: 'Modifier' }).click();
    await card.getByRole('button', { name: 'Supprimer le chapitre' }).click();
    const blocked = page.getByRole('alertdialog');
    await expect(blocked).toContainText('déplacez-les ou supprimez-les d’abord');
    await expect(blocked.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
    await blocked.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByText('Prologue — La foudre')).toBeVisible();

    // 2 · move the card to the other chapter from the card modal (R2-5).
    await page.getByRole('tab', { name: 'Tableau' }).click();
    await page.getByRole('button', { name: 'Ch. 1' }).click();
    await page.getByRole('button', { name: 'Ouvrir Page 1' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByText('CHAPITRE')).toBeVisible({ timeout: 10_000 });
    await modal.getByRole('combobox', { name: 'Chapitre' }).click();
    await page.getByRole('option', { name: /La rencontre/ }).click();
    await modal.getByRole('button', { name: 'Fermer' }).click();

    // 3 · now empty → the delete goes through.
    await openChapitres(page, slug);
    const emptied = page.getByRole('listitem').filter({ hasText: 'Prologue — La foudre' });
    await emptied.getByRole('button', { name: 'Modifier' }).click();
    await emptied.getByRole('button', { name: 'Supprimer le chapitre' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Supprimer le chapitre ?');
    await confirm.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Prologue — La foudre')).toHaveCount(0, { timeout: 5_000 });
    await page.reload();
    await expect(page.getByText('Prologue — La foudre')).toHaveCount(0);

    // 4 · the card was never destroyed — it lives under the chapter it was moved to.
    await page.getByRole('tab', { name: 'Tableau' }).click();
    await page.getByRole('button', { name: 'Ch. 2' }).click();
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('CS7-E6: usable at 375 / 768 / 1280 with no horizontal overflow', async ({ page }) => {
    await login(page, OWNER_EMAIL);

    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 900 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await openChapitres(page, slug);
      await expect(page.getByText('Ch. 2 — La rencontre')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);

      // The edit form is reachable and its fields usable at every width.
      await page.getByRole('button', { name: 'Modifier' }).first().click();
      await expect(page.getByLabel('TITRE')).toBeVisible();
      await expect(page.getByLabel('N°')).toBeVisible();
      await expect(page.getByLabel('RÉSUMÉ')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      await page.getByRole('button', { name: 'Annuler' }).click();
    }
  });
});

/**
 * Round 2 — a chapter is a prerequisite for a card (R2-1), the Tableau "＋" chip quick-creates one
 * (R2-2) and the zero-chapter board says so (R2-3). Own fresh project: these assertions need a
 * project that has never had a chapter.
 */
test.describe.serial('CS-7 R2 · chapter prerequisite on the Tableau', () => {
  let slug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS7 R2 ${Date.now()}`);
    await page.close();
  });

  test('CS7-E7: zero chapters → inert board + message; the CTA creates « Chapitre 1 » in one click', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);

    await expect(page.getByText('Aucun chapitre pour l’instant')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Créez un premier chapitre pour organiser vos planches.')).toBeVisible();
    await expect(page.getByRole('button', { name: '＋ Ajouter une carte' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Créer un chapitre' }).click();

    // The board is live again and the new chapter is the selected one — no form, no tab switch.
    await expect(page.getByRole('button', { name: 'Ch. 1' })).toHaveAttribute('aria-pressed', 'true', { timeout: 8_000 });
    await expect(page.getByText('Aucun chapitre pour l’instant')).toHaveCount(0);

    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('CS7-E8: the "＋" chip creates « Chapitre 2 » and switches the board to it', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Ajouter un chapitre' }).click();

    await expect(page.getByRole('button', { name: 'Ch. 2' })).toHaveAttribute('aria-pressed', 'true', { timeout: 8_000 });
    // Ch. 1's card is out of scope now that Ch. 2 is selected.
    await expect(page.getByText('Page 1', { exact: true })).toHaveCount(0);
  });

  // R3-3 (bug): the chip's bar was a server-derived prop while the board mutates its pages locally,
  // so it froze until a manual reload. It is now derived from the board's own pages — assert it moves
  // WITHIN the same page load, with no reload anywhere in this test.
  test('CS7-E10: moving a card to VALIDÉ advances the chip bar in the same page load', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);

    await page.getByRole('button', { name: 'Ch. 1' }).click();
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 10_000 });
    const bar = page.getByRole('progressbar', { name: 'Avancement Ch. 1' });
    await expect(bar).toHaveAttribute('aria-valuenow', '0');

    // Scope to the card — the global header has a "Menu" button too.
    const cardEl = page.locator('[draggable="true"]').filter({ hasText: 'Page 1' });
    await cardEl.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
    await page.getByRole('menuitem', { name: 'VALIDÉ' }).click();

    // 1 done of the default 20 planned → 5 %, without touching the network for the workspace.
    await expect(bar).toHaveAttribute('aria-valuenow', '5', { timeout: 8_000 });

    // R3-1: the chips are smaller now, but the 44px tap-target floor at ~375px is not negotiable.
    await page.setViewportSize({ width: 375, height: 800 });
    const chip = page.getByRole('button', { name: 'Ch. 1' });
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test('CS7-E9: the auto-named chapters are listed and renamable from the Chapitres tab', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openChapitres(page, slug);

    await expect(page.getByText('Chapitre 1')).toBeVisible({ timeout: 10_000 });
    const second = page.getByRole('listitem').filter({ hasText: 'Chapitre 2' });
    await second.getByRole('button', { name: 'Modifier' }).click();
    await second.getByLabel('TITRE').fill('La rencontre');
    await second.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText('La rencontre')).toBeVisible({ timeout: 5_000 });
    await page.reload();
    await expect(page.getByText('La rencontre')).toBeVisible();
  });
});

/**
 * Round 4 — R4-1, the blocking bug: the board is rendered only while the Tableau tab is active, so
 * leaving the tab UNMOUNTS it and returning re-seeds it from the once-fetched workspace payload.
 * Card mutations lived in the board's local state only, so a freshly created card was there until
 * you came back from another tab, then gone (while its auto-number kept climbing — it WAS saved).
 *
 * Every one of these assertions is made AFTER a Chapitres → Tableau round trip. Mutating and
 * asserting inside a single tab, which is what CS7-E1…E10 do, cannot see this class of bug at all.
 */
test.describe.serial('CS-7 R4 · board mutations survive a tab round trip', () => {
  let slug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS7 R4 ${Date.now()}`);
    await page.close();
  });

  /** Leave the Tableau for the Chapitres tab and come back — the board unmounts and remounts. */
  async function tabRoundTrip(page: Page) {
    await page.getByRole('tab', { name: 'Chapitres' }).click();
    await expect(page.getByRole('tab', { name: 'Chapitres' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Tableau' }).click();
    await expect(page.getByRole('tab', { name: 'Tableau' })).toHaveAttribute('aria-selected', 'true');
  }

  /**
   * Run a mutation and wait for the `onWorkspaceStale` refetch it triggers to land, so the round
   * trip that follows reads a payload that already includes the write (the seam is asynchronous:
   * the write, then the GET the board is re-seeded from).
   */
  async function mutateAndSettle(page: Page, act: () => Promise<void>) {
    const refreshed = page.waitForResponse(
      (r) => r.url().endsWith(`/projects/${slug}`) && r.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await act();
    await refreshed;
  }

  test('CS7-E11: a created card, and its stage change, are still there after Chapitres → Tableau', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await ensureChapter(page);

    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await mutateAndSettle(page, async () => {
      await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
      await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 8_000 });
    });

    await tabRoundTrip(page);

    // The bug: this card used to be gone here. Its title is unchanged too — the auto-number
    // climbing was the tell that the card had been saved all along.
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 8_000 });

    // Same for a stage change: the card must be in NEMU, not back in SCÉNARIO.
    const cardEl = page.locator('[draggable="true"]').filter({ hasText: 'Page 1' });
    await mutateAndSettle(page, async () => {
      await cardEl.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
      await page.getByRole('menuitem', { name: 'Nemu' }).click();
    });

    await tabRoundTrip(page);

    const nemuCol = page.getByRole('group').filter({ hasText: 'Nemu' });
    await expect(nemuCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toHaveCount(0);
  });

  test('CS7-E12: an R2-5 chapter move survives the round trip', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 10_000 });

    // A second chapter to move into — the quick-create chip selects it, so go back to Ch. 1.
    await mutateAndSettle(page, async () => {
      await page.getByRole('button', { name: 'Ajouter un chapitre' }).click();
      await expect(page.getByRole('button', { name: 'Ch. 2' })).toHaveAttribute('aria-pressed', 'true', { timeout: 8_000 });
    });
    await page.getByRole('button', { name: 'Ch. 1' }).click();

    await mutateAndSettle(page, async () => {
      await page.getByRole('button', { name: 'Ouvrir Page 1' }).click();
      const modal = page.getByRole('dialog');
      // Wait on the control, not its « CHAPITRE » label: these chapters are auto-named
      // « Chapitre N », so the label text also matches the combobox's own value.
      const chapterField = modal.getByRole('combobox', { name: 'Chapitre' });
      await expect(chapterField).toBeVisible({ timeout: 10_000 });
      await chapterField.click();
      await page.getByRole('option', { name: /Ch\. 2/ }).click();
      await modal.getByRole('button', { name: 'Fermer' }).click();
    });

    await tabRoundTrip(page);

    // Back on the board the first chapter is selected again — and the card is no longer in it.
    await expect(page.getByRole('button', { name: 'Ch. 1' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Page 1', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ch. 2' }).click();
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('CS7-E13: a deleted card stays deleted after the round trip', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByRole('button', { name: 'Ch. 2' }).click();
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 10_000 });

    const cardEl = page.locator('[draggable="true"]').filter({ hasText: 'Page 1' });
    await mutateAndSettle(page, async () => {
      await cardEl.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: 'Supprimer la carte' }).click();
      const confirm = page.getByRole('alertdialog');
      await confirm.getByRole('button', { name: 'Supprimer' }).click();
      await expect(page.getByText('Page 1', { exact: true })).toHaveCount(0);
    });

    await tabRoundTrip(page);

    await page.getByRole('button', { name: 'Ch. 2' }).click();
    await expect(page.getByText('Page 1', { exact: true })).toHaveCount(0);
  });

  // R5-2 / R5-3 — the "⋯" menu is the documented non-drag path, and it can now do everything the
  // card modal can. Combined with round 4's tab-crossing assertion.
  test('CS7-E14: the ⋯ menu moves a card to another chapter; both bars follow and it persists', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByRole('button', { name: 'Ch. 1' }).click();

    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await mutateAndSettle(page, async () => {
      await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
      await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 8_000 });
    });

    // Nested submenu #1 — move to the VALIDÉ column so the source chapter's bar is non-zero.
    const cardEl = page.locator('[draggable="true"]').filter({ hasText: 'Page 1' });
    await mutateAndSettle(page, async () => {
      await cardEl.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: 'Déplacer vers une colonne' }).click();
      await page.getByRole('menuitem', { name: 'VALIDÉ' }).click();
    });
    const bar1 = page.getByRole('progressbar', { name: 'Avancement Ch. 1' });
    const bar2 = page.getByRole('progressbar', { name: 'Avancement Ch. 2' });
    await expect(bar1).toHaveAttribute('aria-valuenow', '5', { timeout: 8_000 });
    await expect(bar2).toHaveAttribute('aria-valuenow', '0');

    // Nested submenu #2 — move to the other chapter. Same PATCH the card modal uses (R2-5).
    const validCard = page.locator('[draggable="true"]').filter({ hasText: 'Page 1' });
    await mutateAndSettle(page, async () => {
      await validCard.getByRole('button', { name: 'Menu' }).click();
      const chapterSub = page.getByRole('menuitem', { name: 'Déplacer vers un chapitre' });
      await expect(chapterSub).toHaveAttribute('aria-haspopup', 'menu');
      await chapterSub.click();
      // The card's own chapter is never offered as a destination.
      await expect(page.getByRole('menu', { name: 'Déplacer vers un chapitre' }).getByRole('menuitem', { name: /Ch\. 1/ })).toHaveCount(0);
      await page.getByRole('menuitem', { name: /Ch\. 2/ }).click();
    });

    // It left the selected chapter's board, and R3-3's derived bars followed BOTH ways.
    await expect(page.getByText('Page 1', { exact: true })).toHaveCount(0);
    await expect(bar1).toHaveAttribute('aria-valuenow', '0', { timeout: 8_000 });
    await expect(bar2).toHaveAttribute('aria-valuenow', '5');

    await tabRoundTrip(page);
    await page.getByRole('button', { name: 'Ch. 2' }).click();
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 8_000 });
  });
});

/**
 * Round 6 — the strip draws the card, not a decoration: a linked PAGE file renders as a real image
 * (R6-1) and a « Double page » card takes two slots' width whether or not it holds artwork (R6-2).
 *
 * Crossing the tab boundary is round 4's lesson: the file is linked from the Tableau's card modal,
 * and the assertion is made in Chapitres, on a payload fetched after the link.
 */
test.describe.serial('CS-7 R6 · the page strip shows the linked planche', () => {
  let slug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS7 R6 ${Date.now()}`);
    await page.close();
  });

  test('CS7-E15: a linked page file replaces the placeholder; a double card is twice as wide', async ({ page }) => {
    await login(page, OWNER_EMAIL);

    // 1 · three cards in one chapter: Page 1 gets artwork, Page 2 becomes a double, Page 3 stays bare.
    await page.goto(`/projet/${slug}`);
    await ensureChapter(page);
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    for (const title of ['Page 1', 'Page 2', 'Page 3']) {
      await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
      await expect(scenarioCol.getByText(title, { exact: true })).toBeVisible({ timeout: 8_000 });
    }

    // 2 · import an image DECLARED as « Page » (CS-3 type selector), then link it to Page 1.
    await page.goto(`/projet/${slug}?tab=fichiers`);
    await expect(page.getByLabel('Type de fichier')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Type de fichier').click();
    await page.getByRole('option', { name: 'Page', exact: true }).click();
    await page.getByLabel('Importer des fichiers').setInputFiles(IMAGE_FIXTURE);
    await expect(page.locator('[data-asset-card]').filter({ hasText: 'avatar-50x50.jpg' })).toBeVisible({ timeout: 30_000 });

    await page.goto(`/projet/${slug}`);
    await page.getByRole('button', { name: 'Ouvrir Page 1' }).click();
    const modal = page.getByRole('dialog', { name: 'Page 1' });
    await modal.getByRole('button', { name: 'Lier un fichier (PAGE)' }).click();
    const picker = page.getByRole('dialog', { name: 'Lier · remplacer' });
    await picker.getByRole('button', { name: /avatar-50x50\.jpg/ }).click();
    await expect(picker).toHaveCount(0, { timeout: 10_000 });
    await expect(modal.getByText('avatar-50x50.jpg')).toBeVisible();
    await modal.getByRole('button', { name: 'Fermer' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    // 3 · Page 2 → « ⇿ Double page », with no file linked at all.
    await page.getByRole('button', { name: 'Ouvrir Page 2' }).click();
    const modal2 = page.getByRole('dialog', { name: 'Page 2' });
    // CS-2's card modal auto-saves on a 600 ms debounce and does NOT flush on close, so wait for the
    // PATCH itself rather than closing straight away (see frontend-notes R6 · observed).
    const saved = page.waitForResponse((r) => /\/pages\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH', {
      timeout: 15_000,
    });
    await modal2.getByRole('combobox', { name: 'Type de page' }).click();
    await page.getByRole('option', { name: /Double page/ }).click();
    await saved;
    await modal2.getByRole('button', { name: 'Fermer' }).click();
    await expect(modal2).toHaveCount(0, { timeout: 10_000 });

    // 4 · across the tab boundary: the strip renders the real file and the double's width.
    await openChapitres(page, slug);
    const chapterCard = page.getByRole('listitem').filter({ hasText: 'Chapitre 1' });
    await chapterCard.getByRole('button', { name: /Chapitre 1/ }).click();

    const planche = page.locator('img[alt="Page 1"]');
    await expect(planche).toBeVisible({ timeout: 15_000 });
    // F-10: the bytes come from storage/CDN, never from the API.
    expect(await planche.getAttribute('src')).not.toContain('/projects/');
    await expect(planche).toHaveJSProperty('naturalWidth', 50);

    const widthOf = async (selector: string) => (await page.locator(selector).boundingBox())!.width;
    const single = await widthOf('.ep-chapter-thumb:has(img[alt="Page 1"])');
    const double = await widthOf('.ep-chapter-thumb:has-text("Page 2")');
    const bare = await widthOf('.ep-chapter-thumb:has-text("Page 3")');
    expect(single).toBeCloseTo(bare, 0);
    expect(double).toBeCloseTo(bare * 2, 0);
  });
});

/**
 * Round 8 — PLACEMENT. A card's slot in its chapter is explicit (`Page.position`), the strip's badge
 * shows the page number(s) that slot yields, and a « double » consumes TWO of them. Both write paths
 * — dragging a tile and the card modal's « PLACEMENT » field — go through `PATCH /pages/:id`.
 */
test.describe.serial('CS-7 R8 · page placement', () => {
  let slug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS7 R8 ${Date.now()}`);
    await page.close();
  });

  test('CS7-E16: a double is numbered as two pages; drag and the modal both place a card', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    const patched = () =>
      page.waitForResponse((r) => /\/pages\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH', { timeout: 15_000 });

    // 1 · three cards, the second turned into a « double » spread.
    await page.goto(`/projet/${slug}`);
    await ensureChapter(page);
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    for (const title of ['Page 1', 'Page 2', 'Page 3']) {
      await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
      await expect(scenarioCol.getByText(title, { exact: true })).toBeVisible({ timeout: 8_000 });
    }
    await page.getByRole('button', { name: 'Ouvrir Page 2' }).click();
    const modal2 = page.getByRole('dialog', { name: 'Page 2' });
    let saved = patched();
    await modal2.getByRole('combobox', { name: 'Type de page' }).click();
    await page.getByRole('option', { name: /Double page/ }).click();
    await saved;
    await modal2.getByRole('button', { name: 'Fermer' }).click();
    await expect(modal2).toHaveCount(0, { timeout: 10_000 });

    // 2 · the strip numbers the tiles, the double showing BOTH pages it represents.
    await openChapitres(page, slug);
    const chapterCard = page.getByRole('listitem').filter({ hasText: 'Chapitre 1' });
    await chapterCard.getByRole('button', { name: /Chapitre 1/ }).click();
    const tile = (title: string) => page.locator('.ep-chapter-thumb', { hasText: title });
    await expect(tile('Page 1').getByText('1', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(tile('Page 2').getByText('2-3', { exact: true })).toBeVisible();
    await expect(tile('Page 3').getByText('4', { exact: true })).toBeVisible();

    // 3 · drag the last tile onto the first — the placement survives a reload.
    saved = patched();
    await tile('Page 3').dragTo(tile('Page 1'));
    await saved;
    await page.reload();
    await chapterCard.getByRole('button', { name: /Chapitre 1/ }).click();
    await expect(page.locator('.ep-chapter-thumb').first()).toContainText('Page 3', { timeout: 15_000 });
    await expect(tile('Page 3').getByText('1', { exact: true })).toBeVisible();

    // 4 · the modal's « PLACEMENT » field is the keyboard path to the same move, and it spells out
    //     the page numbers the slot yields — two of them for the double.
    await page.goto(`/projet/${slug}`);
    await page.getByRole('button', { name: 'Ouvrir Page 2' }).click();
    const modal = page.getByRole('dialog', { name: 'Page 2' });
    // Three cards, one of them a spread → the chapter is 4 pages, and Page 2 sits last on 3–4.
    await expect(modal.getByText('Pages 3–4 sur 4')).toBeVisible({ timeout: 10_000 });
    saved = patched();
    await modal.getByLabel('Placement').fill('1');
    await modal.getByLabel('Placement').press('Enter');
    await saved;
    await expect(modal.getByText('Pages 1–2 sur 4')).toBeVisible({ timeout: 10_000 });
    await modal.getByRole('button', { name: 'Fermer' }).click();

    await openChapitres(page, slug);
    await chapterCard.getByRole('button', { name: /Chapitre 1/ }).click();
    await expect(page.locator('.ep-chapter-thumb').first()).toContainText('Page 2', { timeout: 15_000 });
    await expect(tile('Page 2').getByText('1-2', { exact: true })).toBeVisible();

    // 5 · the spread stays two tiles wide on mobile — the ≤480px rule scales both sizes.
    await page.setViewportSize({ width: 375, height: 780 });
    const widthOf = async (title: string) => (await tile(title).boundingBox())!.width;
    expect(await widthOf('Page 2')).toBeCloseTo((await widthOf('Page 3')) * 2, 0);
    await noHorizontalOverflow(page);
  });
});
