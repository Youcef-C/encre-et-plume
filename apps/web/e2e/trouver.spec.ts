/**
 * MC-1 "Trouver un·e partenaire" — e2e acceptance suite (ROUND 2).
 *
 * Round-2 rewrite per user-feedback-round2.md + plan.md (round 2) + the direct owner change removing
 * "Je suis :" entirely (§12). Deleted: the round-1 viewer-role-bias case (feature removed, superseded
 * — see user-feedback-round2.md §1/§12). Added: genres[]/locations[] multi-select facets, "Je cherche :"
 * visible label, the Appels-à-projets band ABOVE the grid with a "Partenaires" divider heading (§7/§10),
 * no native <select> anywhere (§8), and country/région (no city) on cards.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js) — not hermetic, the filter/expansion logic
 * under test lives server-side. Login as camille.roux@seed.encre-et-plume.local / password123
 * (dr1-camille-roux, a scénariste). Seed fixtures (backend-notes.md round-2 addendum):
 *   Théo M. — FR · Auvergne-Rhône-Alpes · Seinen/"Encre dense" · disponible
 *   Inès K. — FR · Île-de-France · Josei/Aquarelle · ouvert
 *   Hugo D. — FR · Bretagne · Fantastique/Action
 *   Sora T. — JP (→ "Japon") · Shōnen/Action
 *   Marta L. — ES (→ "Espagne", in Europe) · indisponible
 *   Diego S. — AR (→ "Argentine") · Aventure/SF
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

const grid = (page: Page) => page.locator('.ep-partners-grid');
const cardName = (page: Page, name: string) => grid(page).getByText(name, { exact: true });

async function openMultiSelect(page: Page, label: string) {
  // Trigger accessible name includes the literal " ▾" glyph (not aria-hidden) — match by regex.
  await page.getByRole('button', { name: new RegExp(`^${label}( \\(\\d+\\))? ▾$`) }).click();
}

test.describe('Trouver un·e partenaire — signed in (dr1-camille-roux)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCamille(page);
    await page.goto('/trouver');
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible({ timeout: 10_000 });
  });

  test('MC1-E1: header, subtitle, "Je cherche :" label, filter bar, >=3 partner cards; own card absent; no "Je suis"', async ({
    page,
  }) => {
    await expect(
      page.getByText("Scénaristes & dessinateur·rices — parcourez les portfolios ou laissez l'algorithme suggérer."),
    ).toBeVisible();

    // Direct owner change (§12): "Je suis :" is REMOVED entirely — no prefill, no section.
    await expect(page.getByText('Je suis :')).toHaveCount(0);

    // "Je cherche :" role filter stays, now with a visible label (QA round-1 finding #2).
    await expect(page.getByText('Je cherche :')).toBeVisible();
    const filterGroup = page.getByRole('group', { name: 'Je cherche :' });
    await expect(filterGroup.getByRole('button', { name: 'Dessinateur·rice' })).toBeVisible();
    await expect(filterGroup.getByRole('button', { name: 'Scénariste' })).toBeVisible();

    await expect(page.getByRole('button', { name: /^Genres.*▾$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Localisation.*▾$/ })).toBeVisible();
    await expect(page.getByLabel('Disponibilité')).toBeVisible();

    // §8 — no native <select> anywhere on this page (OnBrandSelect/OnBrandMultiSelect are custom).
    expect(await page.locator('select').count()).toBe(0);

    const cards = grid(page).locator('> li');
    await expect(cards.nth(2)).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(3);

    // Camille Roux is the logged-in viewer — her own card must never appear in the partners grid.
    // Scoped to the grid (not page-wide): MC-4's "Appels à projets" band above the grid can
    // legitimately show her own posted call ("Seinen urbain", authorName "Camille Roux") — that's
    // a different surface with no such exclusion rule, only the partner directory excludes self.
    await expect(grid(page).getByText('Camille Roux', { exact: true })).toHaveCount(0);

    // No location filter selected → non-French fixtures (Sora/Diego) are present.
    await expect(cardName(page, 'Sora T.')).toBeVisible();
    await expect(cardName(page, 'Diego S.')).toBeVisible();
  });

  test('MC1-E2: "Je cherche" role toggle is single-select and freely clearable (no bias/enforcement)', async ({
    page,
  }) => {
    const filterGroup = page.getByRole('group', { name: 'Je cherche :' });
    const dessinateur = filterGroup.getByRole('button', { name: 'Dessinateur·rice' });
    const scenariste = filterGroup.getByRole('button', { name: 'Scénariste' });
    await expect(dessinateur).toHaveAttribute('aria-pressed', 'false');

    await dessinateur.click();
    await expect(dessinateur).toHaveAttribute('aria-pressed', 'true');
    await expect(cardName(page, 'Théo M.')).toBeVisible(); // dessinateur fixture

    // A scénariste-role viewer may also filter for scénaristes — no complement enforcement.
    await scenariste.click();
    await expect(scenariste).toHaveAttribute('aria-pressed', 'true');
    await expect(dessinateur).toHaveAttribute('aria-pressed', 'false');
    await expect(cardName(page, 'Léa B.')).toBeVisible(); // scénariste fixture

    // Re-click clears it.
    await scenariste.click();
    await expect(scenariste).toHaveAttribute('aria-pressed', 'false');
  });

  test('MC1-E3: Genres multi-select {Josei, Seinen} narrows to Inès K. + Théo M., with removable chips', async ({
    page,
  }) => {
    await openMultiSelect(page, 'Genres');
    await page.getByRole('checkbox', { name: 'Josei' }).check();
    await page.getByRole('checkbox', { name: 'Seinen' }).check();

    await expect(cardName(page, 'Inès K.')).toBeVisible();
    await expect(cardName(page, 'Théo M.')).toBeVisible();
    await expect(cardName(page, 'Hugo D.')).not.toBeVisible(); // Fantastique/Action only

    // §6 — selected choices shown as removable chips outside the popover.
    await expect(page.getByRole('button', { name: 'Retirer Josei' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retirer Seinen' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Retirer /, exact: false })).toHaveCount(2);

    // Clearing one chip re-applies immediately (auto-apply, no "Appliquer" button).
    await page.getByRole('button', { name: 'Retirer Josei' }).click();
    await expect(page.getByRole('button', { name: 'Retirer Josei' })).toHaveCount(0);
  });

  test('MC1-E4: a genre + role combo with no match shows the empty state; clearing restores results', async ({
    page,
  }) => {
    // Josei only exists on a dessinateur·rice fixture — combined with role=Scénariste matches nothing.
    await openMultiSelect(page, 'Genres');
    await page.getByRole('checkbox', { name: 'Josei' }).check();
    await page.getByRole('group', { name: 'Je cherche :' }).getByRole('button', { name: 'Scénariste' }).click();
    await expect(page.getByText('Aucun·e partenaire ne correspond à ces filtres.')).toBeVisible();

    await page.getByRole('group', { name: 'Je cherche :' }).getByRole('button', { name: 'Scénariste' }).click();
    // Owner's chip-layout fix: selected chips render inside the popover, not the shared filter row
    // — clicking the role toggle (outside the popover) closes it, so the chip must be reached by
    // reopening the popover (same pattern as MC1-E3/E5's "still open across toggles" — here it
    // WAS closed by the intervening click, so we reopen explicitly).
    await openMultiSelect(page, 'Genres');
    await page.getByRole('button', { name: 'Retirer Josei' }).click();
    await expect(cardName(page, 'Théo M.')).toBeVisible();
  });

  test('MC1-E5: Localisation {Japon} → Sora T. only; {Bretagne, Île-de-France} → Hugo D. + Inès K.', async ({
    page,
  }) => {
    await openMultiSelect(page, 'Localisation');
    await page.getByLabel('Rechercher dans Localisation').fill('Japon');
    await page.getByRole('checkbox', { name: 'Japon' }).check();

    await expect(cardName(page, 'Sora T.')).toBeVisible();
    await expect(cardName(page, 'Théo M.')).not.toBeVisible();
    await expect(cardName(page, 'Diego S.')).not.toBeVisible();

    // Clear Japon, then pick the two French régions. The popover stays open across toggles
    // (multi-select, no auto-close) — reuse the still-open search box, don't reopen the trigger.
    await page.getByRole('button', { name: 'Retirer Japon' }).click();
    await page.getByLabel('Rechercher dans Localisation').fill('Bretagne');
    await page.getByRole('checkbox', { name: 'Bretagne' }).check();
    await page.getByLabel('Rechercher dans Localisation').fill('Île-de-France');
    await page.getByRole('checkbox', { name: 'Île-de-France' }).check();

    await expect(cardName(page, 'Hugo D.')).toBeVisible();
    await expect(cardName(page, 'Inès K.')).toBeVisible();
    await expect(cardName(page, 'Théo M.')).not.toBeVisible(); // Auvergne-Rhône-Alpes, not selected
  });

  test('MC1-E6: Localisation {Europe} excludes non-European fixtures (Sora/Diego)', async ({ page }) => {
    await openMultiSelect(page, 'Localisation');
    await page.getByLabel('Rechercher dans Localisation').fill('Europe');
    await page.getByRole('checkbox', { name: 'Europe' }).check();

    await expect(cardName(page, 'Théo M.')).toBeVisible();
    await expect(cardName(page, 'Sora T.')).not.toBeVisible();
    await expect(cardName(page, 'Diego S.')).not.toBeVisible();
  });

  test('MC1-E7: card location line shows the composed région/country string, never a city', async ({ page }) => {
    // dr1-yuki-moreau is ALSO Auvergne-Rhône-Alpes (seed), so scope to Théo M.'s own card.
    const theoCard = grid(page).locator('li').filter({ hasText: 'Théo M.' });
    await expect(theoCard).toBeVisible();
    await expect(theoCard.getByText('Auvergne-Rhône-Alpes')).toBeVisible();
    await expect(grid(page).getByText('Lyon')).toHaveCount(0);
    await expect(grid(page).getByText('Japon')).toBeVisible(); // Sora T. — non-French, no région
    await expect(grid(page).getByText('Tokyo')).toHaveCount(0);
  });

  test('MC1-E8: "Profil" navigates to the profile page; "Proposer" has a descriptive a11y name', async ({
    page,
  }) => {
    // MC-2 added a "Suggestions" aside that may also surface Théo M. with the same accessible
    // names — scope to the main partners grid card to disambiguate.
    const theoCard = grid(page).locator('li').filter({ hasText: 'Théo M.' });
    const proposerButton = theoCard.getByRole('button', { name: 'Proposer une collaboration à Théo M.' });
    await expect(proposerButton).toBeVisible();
    // MC-3 wired this button to a real "Proposer une collab" invite modal (see mc3-invite.spec.ts
    // for the full acceptance flow) — verify it opens, then close it before continuing.
    await proposerButton.click();
    await expect(page.getByRole('dialog', { name: /Inviter Théo M\./ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible();

    await theoCard.getByRole('link', { name: 'Profil de Théo M.' }).click();
    await expect(page).toHaveURL('/mc1-theo-m');
  });

  test('MC1-E9: "Appels à projets" band renders ABOVE the "Partenaires" grid, both visible without scrolling', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Appels à projets' })).toBeVisible();
    // MC-4 reseeded the board to 5 calls (backend-notes.md); the preview (limit=2, open, newest
    // first) now surfaces the 2 newest — "Seinen urbain" (+30j) and "Comédie romantique" (+20j) —
    // not the story's "« Lames de Brume »" example, which is older. CallsPreview itself (and its
    // "Clôture X j" copy, no "dans" — distinct from the MC-4 board's CallBoardCard copy) is unchanged.
    await expect(page.getByText('Seinen urbain')).toBeVisible();
    await expect(page.getByText('Clôture 30 j')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voir tous les appels →' })).toHaveAttribute('href', '/appels');

    // §10 — "Partenaires" divider heading between the two zones.
    const partenairesHeading = page.getByRole('heading', { name: 'Partenaires' });
    await expect(partenairesHeading).toBeVisible();

    // §7 — the band sits ABOVE the grid: y-position ordering (Appels < Partenaires < first card).
    const appelsBox = await page.getByRole('heading', { name: 'Appels à projets' }).boundingBox();
    const partenairesBox = await partenairesHeading.boundingBox();
    const firstCardBox = await grid(page).locator('> li').first().boundingBox();
    expect(appelsBox && partenairesBox && firstCardBox).toBeTruthy();
    expect(appelsBox!.y).toBeLessThan(partenairesBox!.y);
    expect(partenairesBox!.y).toBeLessThan(firstCardBox!.y);
  });

  test('MC1-E10a: 375px viewport has no horizontal overflow and reflows to 1 column', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
    const cols = await page.evaluate(
      () => getComputedStyle(document.querySelector('.ep-partners-grid')!).gridTemplateColumns.split(' ').length,
    );
    expect(cols).toBe(1);
  });

  test('MC1-E10b: 768px viewport has no horizontal overflow and reflows to 2 columns', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
    const cols = await page.evaluate(
      () => getComputedStyle(document.querySelector('.ep-partners-grid')!).gridTemplateColumns.split(' ').length,
    );
    expect(cols).toBe(2);
  });

  test('MC1-E10c: 1280px viewport has no horizontal overflow and shows 3 columns', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
    const cols = await page.evaluate(
      () => getComputedStyle(document.querySelector('.ep-partners-grid')!).gridTemplateColumns.split(' ').length,
    );
    expect(cols).toBe(3);
  });
});

test('MC1-E11: logged-out visit shows the connect prompt, not the directory', async ({ page }) => {
  await page.goto('/trouver');
  await expect(page.getByRole('heading', { name: 'Trouver un·e partenaire' })).toBeVisible();
  await expect(
    page.getByText('Connectez-vous pour parcourir les portfolios des scénaristes et dessinateur·rices.'),
  ).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
    'href',
    '/connexion?redirect=/trouver',
  );
  await expect(page.locator('.ep-partners-grid')).toHaveCount(0);
});
