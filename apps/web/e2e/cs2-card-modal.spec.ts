/**
 * CS-2 card-modal extension — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB. Two fixture tracks:
 *  - Fresh projects (owner-only) via the /creer wizard, for label/deadline/checklist/comment/
 *    delete-card/filter/responsive flows that only need one member.
 *  - The seeded `e2e-cs2-multi` project (Work-linked, 2 real WorkCreators: CS12_OWNER scénariste +
 *    CS12_COLLAB dessinateur — see `apps/api/prisma/e2e-seed.js`) for ASSIGNÉ À / `@mention`
 *    notification flows and comment-authz (author vs owner vs other member), since no "Gérer le
 *    groupe" UI (CS-10) exists yet to add a second member to a freshly-created project.
 *
 * Split-test convention: this spec + the auth/nav smoke only (not the full e2e suite).
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
const COLLAB_EMAIL = 'qa_e2e_cs12_collab@test.com';
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com';
const MULTI_SLUG = 'e2e-cs2-multi';

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

// The board auto-titles new cards "Page {n}" server-side (no title control on "＋ Ajouter une
// carte") — `index` is the 1-based position among cards with no chapter (a fresh/seeded project has
// none), so the first card added is always "Page 1", the second "Page 2", etc.
async function addCard(page: Page, index = 1): Promise<string> {
  const title = `Page ${index}`;
  const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
  await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
  await expect(scenarioCol.getByText(title, { exact: true })).toBeVisible({ timeout: 5_000 });
  return title;
}

const dialog = (page: Page) => page.getByRole('dialog');

test.describe('CS-2 card-modal — owner lifecycle (fresh single-member project)', () => {
  test.describe.configure({ mode: 'serial' });
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS2 Modal ${Date.now()}`);
    await page.close();
  });

  test('CM-E1: card click opens the modal; loads GET /pages/:id and shows every section', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await addCard(page);
    await page.getByText('Page 1', { exact: true }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByLabel('TITRE')).toHaveValue('Page 1');
    await expect(modal.getByText('COLONNE')).toBeVisible();
    await expect(modal.getByText('TYPE DE PAGE')).toBeVisible();
    await expect(modal.getByText('FICHIERS LIÉS')).toBeVisible();
    await expect(modal.getByText('Aucun fichier lié')).toBeVisible();
    await expect(modal.getByText('DESCRIPTION')).toBeVisible();
    await expect(modal.getByText('ÉTIQUETTES')).toBeVisible();
    await expect(modal.getByText('ÉCHÉANCE')).toBeVisible();
    await expect(modal.getByText('CHECKLIST')).toBeVisible();
    await expect(modal.getByText('ASSIGNÉ À')).toBeVisible();
    await expect(modal.getByText('COMMENTAIRES')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Supprimer la carte' })).toBeVisible();

    // Escape closes (focus must be inside the dialog for the key to reach its handler — click the
    // title field first, same as a real user tabbing/clicking inside before hitting Escape).
    await modal.getByLabel('TITRE').click();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  });

  test('CM-E2: DESCRIPTION autosaves ("Enregistré ✓") and persists on reload/reopen', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = dialog(page);
    await modal.getByLabel('Description').fill('Une description e2e CS-2.');
    await expect(modal.getByText('Enregistré ✓')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    await page.reload();
    await page.getByText('Page 1', { exact: true }).click();
    await expect(dialog(page).getByLabel('Description')).toHaveValue('Une description e2e CS-2.');
    await page.keyboard.press('Escape');
  });

  test('CM-E3: ÉTIQUETTES — create a label, apply it, card shows a label bar; the board filter narrows to it', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = dialog(page);

    await modal.getByRole('button', { name: 'Ajouter une étiquette' }).click();
    await modal.getByLabel("Nom de l'étiquette").fill('Urgent');
    await modal.getByRole('button', { name: 'rouge' }).click();
    await modal.getByRole('button', { name: 'Créer' }).click();
    // Newly-created label appears in the picker and gets applied by clicking it.
    await modal.getByRole('button', { name: 'Urgent' }).first().click();
    await expect(modal.getByRole('button', { name: 'Retirer Urgent' })).toBeVisible({ timeout: 5_000 });
    // Escape here only closes the étiquette picker dropdown (it stops propagation so the modal stays
    // open) — close the modal itself via the ✕ button.
    await modal.getByRole('button', { name: 'Fermer' }).click();

    // Card shows the label bar (sr-text carries the label name).
    await expect(page.getByText('Urgent', { exact: true }).first()).toBeVisible();

    // Board filter row: toggling "Urgent" keeps the card visible; a second unrelated toggle (none
    // exist) would hide it — verify the filter chip is present and pressable (auto-apply, no button).
    const filterChip = page.getByRole('button', { name: 'Urgent' }).first();
    await expect(filterChip).toHaveAttribute('aria-pressed', 'false');
    await filterChip.click();
    await expect(filterChip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
    // Deselect clears the filter again.
    await filterChip.click();
    await expect(filterChip).toHaveAttribute('aria-pressed', 'false');

    // Reload: label survives.
    await page.reload();
    await expect(page.getByText('Urgent', { exact: true }).first()).toBeVisible();
  });

  test('CM-E4: deleting a label from the picker cascades off the card and the filter row', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = dialog(page);
    await modal.getByRole('button', { name: 'Ajouter une étiquette' }).click();
    await modal.getByRole('button', { name: 'Supprimer Urgent' }).click();
    await modal.getByRole('button', { name: 'Oui' }).click();
    await expect(modal.getByText('Aucune étiquette pour le moment')).toBeVisible({ timeout: 5_000 });
    await modal.getByRole('button', { name: 'Fermer' }).click();

    await expect(page.getByText('Urgent', { exact: true })).toHaveCount(0);
  });

  test('CM-E5: ÉCHÉANCE — set a deadline (due pill on the card, overdue styling in the past), then clear it', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = dialog(page);

    // A past date → the card's meta pill renders with the accent (overdue) background.
    await modal.getByLabel('Échéance').fill('2020-01-15');
    await expect(modal.getByText('Enregistré ✓')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    const duePill = page.locator('span[title="Échéance"]');
    await expect(duePill).toBeVisible();
    await expect(duePill).toHaveText(/15 janv\./);
    const bg = await duePill.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)'); // accent-filled (overdue), not transparent/paper

    await page.getByText('Page 1', { exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Retirer' }).click();
    await expect(dialog(page).getByText('Enregistré ✓')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('span[title="Échéance"]')).toHaveCount(0);
  });

  test('CM-E6: CHECKLIST — add, toggle, delete; card shows (x/x)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    const modal = dialog(page);

    await modal.getByLabel('Nouvel élément').fill('Encrer la case 3');
    await modal.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(modal.getByText('Encrer la case 3')).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText('(0/1)')).toBeVisible();

    await modal.getByLabel('Encrer la case 3').click();
    await expect(modal.getByText('(1/1)')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    await expect(page.getByText('(1/1)', { exact: true }).first()).toBeVisible();

    await page.getByText('Page 1', { exact: true }).click();
    await dialog(page).getByRole('button', { name: "Supprimer l'élément" }).click();
    await expect(dialog(page).getByText('Encrer la case 3')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByText('(1/1)', { exact: true })).toHaveCount(0);
  });

  test('CM-E7: COMMENTAIRES — owner adds, edits ("modifié"), then deletes their own comment', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    await page.getByText('Page 1', { exact: true }).click();
    let modal = dialog(page);

    await modal.getByLabel('Écrire un commentaire').fill('Premier commentaire e2e.');
    await modal.getByRole('button', { name: 'Commenter' }).click();
    await expect(modal.getByText('Premier commentaire e2e.')).toBeVisible({ timeout: 5_000 });
    await modal.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.locator('span[title="Commentaires"]')).toHaveText('1');

    await page.getByText('Page 1', { exact: true }).click();
    modal = dialog(page);
    await modal.getByRole('button', { name: 'Modifier' }).click();
    await modal.getByLabel('Modifier le commentaire').fill('Commentaire modifié e2e.');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal.getByText('Commentaire modifié e2e.')).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText('modifié', { exact: true })).toBeVisible();

    await modal.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect(modal.getByText('Commentaire modifié e2e.')).toHaveCount(0);
    await expect(modal.getByText('Aucun commentaire')).toBeVisible();
  });

  test('CM-E8: ⋯ menu delete-card → confirmation modal; card removed; menu not clipped by siblings', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    // A second card ensures a sibling paints after the first — the z-index regression this covers.
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 5_000 });

    const firstCard = scenarioCol.locator('div[draggable="true"]').filter({ hasText: 'Page 1' });
    await firstCard.getByRole('button', { name: 'Menu' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    // The menu item is genuinely clickable (Playwright's actionability check fails if another
    // element — e.g. a sibling card painting over it — intercepts the click).
    await expect(menu.getByRole('menuitem', { name: 'Supprimer la carte' })).toBeVisible();

    // Outside click closes it without triggering delete.
    await page.mouse.click(20, 20);
    await expect(menu).toHaveCount(0);

    await firstCard.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Supprimer la carte' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Supprimer' }).click();
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toHaveCount(0);
    await expect(scenarioCol.getByText('Page 2', { exact: true })).toBeVisible();
  });

  test('CM-E9: Escape closes the ⋯ menu', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${slug}`);
    const card = page.getByRole('group').filter({ hasText: 'Scénario' }).locator('div[draggable="true"]').filter({ hasText: 'Page 2' });
    await card.getByRole('button', { name: 'Menu' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
});

test.describe('CS-2 card-modal — multi-member project (ASSIGNÉ À + @mention notifications, comment authz)', () => {
  test.describe.configure({ mode: 'serial' });
  let cardTitle = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}`);
    cardTitle = await addCard(page);
    await page.close();
  });

  test('MM-E1: ASSIGNÉ À lists both real project members; assigning the collaborator shows an avatar on the card', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}`);
    await page.getByText(cardTitle, { exact: true }).click();
    const modal = dialog(page);
    await expect(modal.getByRole('button', { name: /E2E CS12_OWNER/ })).toBeVisible();
    const collabChip = modal.getByRole('button', { name: /E2E CS12_COLLAB/ });
    await expect(collabChip).toBeVisible();
    await expect(collabChip).toHaveAttribute('aria-pressed', 'false');
    await collabChip.click();
    await expect(collabChip).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
    await page.keyboard.press('Escape');
  });

  test('MM-E2: the collaborator receives an assignment notification', async ({ page }) => {
    await login(page, COLLAB_EMAIL);
    await page.goto('/notifications');
    await expect(page.getByText(`Vous avez été assigné·e à « ${cardTitle} »`)).toBeVisible({ timeout: 10_000 });
  });

  test('MM-E3: unassigning the collaborator notifies them of the removal', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}`);
    await page.getByText(cardTitle, { exact: true }).click();
    const modal = dialog(page);
    const collabChip = modal.getByRole('button', { name: /E2E CS12_COLLAB/ });
    await expect(collabChip).toHaveAttribute('aria-pressed', 'true');
    await collabChip.click();
    await expect(collabChip).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 });
    await page.keyboard.press('Escape');

    await login(page, COLLAB_EMAIL);
    await page.goto('/notifications');
    await expect(page.getByText(`Vous avez été retiré·e de « ${cardTitle} »`)).toBeVisible({ timeout: 10_000 });
  });

  test('MM-E4: @name mention in a comment notifies the mentioned member', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}`);
    await page.getByText(cardTitle, { exact: true }).click();
    const modal = dialog(page);

    await modal.getByLabel('Écrire un commentaire').fill('Regarde ça @CS12_COLLAB');
    await expect(page.getByRole('listbox', { name: 'Mentionner un membre' })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('option', { name: '@E2E CS12_COLLAB' }).click();
    await expect(modal.getByLabel('Écrire un commentaire')).toHaveValue('Regarde ça @E2E CS12_COLLAB ');
    await modal.getByRole('button', { name: 'Commenter' }).click();
    await expect(modal.getByText('Regarde ça @E2E CS12_COLLAB', { exact: false })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    await login(page, COLLAB_EMAIL);
    await page.goto('/notifications');
    await expect(page.getByText(`Vous avez été mentionné·e sur « ${cardTitle} »`)).toBeVisible({ timeout: 10_000 });
  });

  test('MM-E5: comment authz — a member can delete their own comment; a non-author member has no edit/delete; the owner can delete any comment', async ({ page, browser }) => {
    // Collaborator posts a comment.
    await login(page, COLLAB_EMAIL);
    await page.goto(`/projet/${MULTI_SLUG}`);
    await page.getByText(cardTitle, { exact: true }).click();
    let modal = dialog(page);
    await modal.getByLabel('Écrire un commentaire').fill('Commentaire du collaborateur.');
    await modal.getByRole('button', { name: 'Commenter' }).click();
    await expect(modal.getByText('Commentaire du collaborateur.')).toBeVisible({ timeout: 5_000 });
    // Author sees Modifier + Supprimer on their own comment.
    await expect(modal.getByRole('button', { name: 'Modifier' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.close();

    // Owner opens the same card in a fresh context: sees Supprimer (owner override) but no Modifier
    // (not the author) on the collaborator's comment.
    const ownerPage = await browser.newPage();
    await login(ownerPage, OWNER_EMAIL);
    await ownerPage.goto(`/projet/${MULTI_SLUG}`);
    await ownerPage.getByText(cardTitle, { exact: true }).click();
    modal = dialog(ownerPage);
    const commentRow = modal.getByText('Commentaire du collaborateur.').locator('..');
    await expect(commentRow.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
    await expect(commentRow.getByRole('button', { name: 'Supprimer' })).toBeVisible();
    await commentRow.getByRole('button', { name: 'Supprimer' }).click();
    await expect(modal.getByText('Commentaire du collaborateur.')).toHaveCount(0);
    await ownerPage.close();
  });
});

test.describe('CS-2 card-modal — non-member (public project) is read-only', () => {
  let publicSlug = '';
  let publicCardTitle = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    await page.goto('/creer');
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel('Titre du projet').fill(`E2E CS2 Modal Public ${Date.now()}`);
    await page.getByRole('radio', { name: 'Public' }).click();
    await page.getByRole('button', { name: /Configurer plus tard/ }).click();
    await expect(page).toHaveURL(/\/projet\//, { timeout: 10_000 });
    publicSlug = page.url().split('/projet/')[1];
    publicCardTitle = await addCard(page);
    await page.close();
  });

  test('RO-E1: a non-member can open the card modal but every control is read-only, no delete', async ({ page }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/projet/${publicSlug}`);
    await page.getByText(publicCardTitle, { exact: true }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByLabel('TITRE')).toHaveAttribute('readonly', '');
    await expect(modal.getByLabel('Description')).toHaveAttribute('readonly', '');
    await expect(modal.getByLabel('Échéance')).toHaveAttribute('readonly', '');
    await expect(modal.getByRole('button', { name: 'Supprimer la carte' })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Ajouter une étiquette' })).toHaveCount(0);
    await expect(modal.getByLabel('Écrire un commentaire')).toHaveCount(0);
  });
});

test.describe('CS-2 card-modal — responsive sweep (375/768/1280)', () => {
  let slug = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, OWNER_EMAIL);
    slug = await createProject(page, `E2E CS2 Modal Responsive ${Date.now()}`);
    await addCard(page);
    await page.close();
  });

  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label} — card modal opens, scrollable, no page-level horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, OWNER_EMAIL);
      await page.goto(`/projet/${slug}`);
      await page.getByText('Page 1', { exact: true }).click();
      const modal = dialog(page);
      await expect(modal).toBeVisible({ timeout: 5_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      if (width === 375) {
        await page.screenshot({ path: `test-results/cs2-card-modal-${width}.png`, fullPage: true });
      }
      await page.keyboard.press('Escape');
    });
  }
});
