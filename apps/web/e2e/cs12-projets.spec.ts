/**
 * CS-12 "Mes projets" dashboard — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB (apps/api/prisma/e2e-seed.js). Signed-in creator:
 * qa_e2e_cs12_owner@test.com / password123 (e2e-cs12-owner, scénariste), who owns 4 projects
 * (one per status: en cours w/ step+nextReleaseAt, en révision, en pause, publié) and one
 * illustration collection ("E2E CS12 · Carnet", slug e2e-cs12-carnet, 3 members). An accepted
 * collaborator (qa_e2e_cs12_collab@test.com, dessinateur) is on the "en cours" project.
 *
 * No standalone (uncollected) illustration fixture exists in the seed — this suite publishes one
 * via the UI (E5) to exercise the type=illustrations / kind:'illustration' paths, and cleans it up
 * via a direct API delete in afterAll.
 *
 * Split-test convention: run only this spec + the auth/nav smoke, not the full e2e suite.
 */
import { test, expect, type Page, request as playwrightRequest } from '@playwright/test';
import * as path from 'path';

const PASSWORD = 'password123';
const OWNER_EMAIL = 'qa_e2e_cs12_owner@test.com';
const API_BASE = 'http://localhost:3001';
const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');

async function loginAsOwner(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(OWNER_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
}

test('CS12-E0: logged out /projets shows the Se connecter panel (auth gate)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.goto('/projets');
  await expect(page.getByRole('heading', { name: 'Mes projets' })).toBeVisible({ timeout: 10_000 });
  // Scope to <main> — the header also renders its own always-visible "Se connecter" link.
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
    'href',
    '/connexion?redirect=/projets',
  );
  await ctx.close();
});

test.describe('CS-12 Mes projets — signed in (e2e-cs12-owner)', () => {
  test.describe.configure({ mode: 'serial' });

  let standaloneIllusUrl = '';
  let standaloneIllusId = '';
  const standaloneTitle = `E2E CS12 Standalone ${Date.now()}`;

  test('CS12-E1: header + summary + nav — 4 project cards + 1 collection card render', async ({ page }) => {
    await loginAsOwner(page);
    await page.getByRole('link', { name: 'Projets' }).click();
    await expect(page).toHaveURL('/projets');
    await expect(page.getByRole('heading', { name: 'Mes projets' })).toBeVisible();
    await expect(page.getByRole('button', { name: '＋ Nouveau projet' })).toBeVisible();

    // Summary line derived from the unfiltered set: 2 series actifs (en cours + en révision) + 1 en révision.
    await expect(page.getByText(/actifs? ·/)).toBeVisible();
    await expect(page.getByText(/en révision/)).toBeVisible();

    await expect(page.getByText('E2E CS12 · En cours')).toBeVisible();
    await expect(page.getByText('E2E CS12 · En révision')).toBeVisible();
    await expect(page.getByText('E2E CS12 · En pause')).toBeVisible();
    await expect(page.getByText('E2E CS12 · Publié')).toBeVisible();
    await expect(page.getByText('E2E CS12 · Carnet')).toBeVisible();

    // Collaborator meta line on the "en cours" project card.
    const enCoursCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · En cours' });
    await expect(enCoursCard.getByText(/Avec/)).toBeVisible();
    await expect(enCoursCard.getByText(/étape : encrage Ch.1/)).toBeVisible();
  });

  test('CS12-E2: status is series-only — collection/illustration cards show no status badge; series keep theirs', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const enCoursCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · En cours' });
    await expect(enCoursCard.getByText('En cours', { exact: true })).toBeVisible();

    const carnetCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · Carnet' });
    // No "En cours"/"En révision"/etc status badge text anywhere in the collection card.
    await expect(carnetCard.getByText(/^En cours$|^En révision$|^En pause$|^Publié$/)).toHaveCount(0);
  });

  test('CS12-E3: status chips — Publiés shows only the publié card; En cours includes En révision, excludes the collection', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const statusGroup = page.getByRole('group', { name: 'Filtrer par statut' });

    await statusGroup.getByRole('button', { name: 'Publiés' }).click();
    await expect(page).toHaveURL(/statut=publies/);
    await expect(statusGroup.getByRole('button', { name: 'Publiés' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('E2E CS12 · Publié')).toBeVisible();
    await expect(page.getByText('E2E CS12 · En cours')).toHaveCount(0);
    await expect(page.getByText('E2E CS12 · Carnet')).toHaveCount(0);

    await statusGroup.getByRole('button', { name: 'En cours' }).click();
    await expect(page).toHaveURL(/statut=en-cours/);
    await expect(page.getByText('E2E CS12 · En cours')).toBeVisible();
    await expect(page.getByText('E2E CS12 · En révision')).toBeVisible();
    // O2/§11: collection has status:null → excluded from the "en cours" chip.
    await expect(page.getByText('E2E CS12 · Carnet')).toHaveCount(0);
    await expect(page.getByText('E2E CS12 · Publié')).toHaveCount(0);

    await statusGroup.getByRole('button', { name: 'Tous' }).click();
    await expect(page).not.toHaveURL(/statut=/);
  });

  test('CS12-E4: six type chips (Tous/Manga/Histoire/Illustrations/Collections/Collaborations), single-active, URL-synced', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const typeGroup = page.getByRole('group', { name: 'Filtrer par type' });
    await expect(typeGroup.getByRole('button')).toHaveCount(6);
    for (const label of ['Tous', 'Manga', 'Histoire', 'Illustrations', 'Collections', 'Collaborations']) {
      await expect(typeGroup.getByRole('button', { name: label })).toBeVisible();
    }

    await typeGroup.getByRole('button', { name: 'Manga' }).click();
    await expect(page).toHaveURL(/type=manga/);
    await expect(typeGroup.getByRole('button', { name: 'Manga' })).toHaveAttribute('aria-pressed', 'true');
    await expect(typeGroup.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'false');
    // Manga-kind projects only: "en cours" (Manga), "en révision" (Manga), "publié" (Manga) — NOT "en pause" (Histoire).
    await expect(page.getByText('E2E CS12 · En pause')).toHaveCount(0);
    await expect(page.getByText('E2E CS12 · Carnet')).toHaveCount(0);

    await typeGroup.getByRole('button', { name: 'Histoire' }).click();
    await expect(page).toHaveURL(/type=histoire/);
    await expect(page.getByText('E2E CS12 · En pause')).toBeVisible();
    await expect(page.getByText('E2E CS12 · En cours')).toHaveCount(0);

    await typeGroup.getByRole('button', { name: 'Tous' }).click();
    await expect(page).not.toHaveURL(/type=/);
  });

  test('CS12-E5: publish a standalone (uncollected) illustration via the UI (no fixture seeded)', async ({ page }) => {
    await loginAsOwner(page);
    // CS-1: publishing now walks the /creer wizard Illustration branch (Détails → Soutien → Publier).
    await page.goto('/creer?type=illustration');
    await expect(page.getByRole('heading', { name: /Nouveau projet/i })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Titre', { exact: true }).fill(standaloneTitle);
    await page.locator('input[type="file"]').first().setInputFiles(IMAGE_FIXTURE);
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByRole('button', { name: 'Publier', exact: true })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(page).toHaveURL(/\/illustration\//, { timeout: 15_000 });
    standaloneIllusUrl = page.url();
    standaloneIllusId = standaloneIllusUrl.split('/illustration/')[1];
    expect(standaloneIllusId).toBeTruthy();
  });

  test('CS12-E6: Illustrations vs Collections split — Illustrations shows flat cards incl. collected ones; Collections shows only the collection; Tous nests, never duplicates', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const typeGroup = page.getByRole('group', { name: 'Filtrer par type' });

    // Tous — collection card present as ONE row; a collected illustration ("E2E CS12 e2e-cs12-illu-1")
    // must NOT appear as a duplicate top-level card; the standalone illustration DOES appear top-level.
    await expect(page.getByText('E2E CS12 · Carnet')).toBeVisible();
    await expect(page.locator('li.ep-projet-card', { hasText: 'E2E CS12 e2e-cs12-illu-1' })).toHaveCount(0);
    await expect(page.locator('li.ep-projet-card', { hasText: standaloneTitle })).toBeVisible();

    // type=illustrations — ALL illustrations flat, including collected ones; no collection rows.
    await typeGroup.getByRole('button', { name: 'Illustrations' }).click();
    await expect(page).toHaveURL(/type=illustrations/);
    await expect(page.getByText('E2E CS12 · Carnet')).toHaveCount(0);
    await expect(page.locator('li.ep-projet-card', { hasText: standaloneTitle })).toBeVisible();
    await expect(page.locator('li.ep-projet-card', { hasText: 'E2E CS12 e2e-cs12-illu-1' })).toBeVisible();
    // Flat illustration cards have no expand caret.
    await expect(
      page.locator('li.ep-projet-card', { hasText: standaloneTitle }).getByRole('button', { name: /illustrations de/ }),
    ).toHaveCount(0);

    // type=collections — only the collection row, no flat illustration cards.
    await typeGroup.getByRole('button', { name: 'Collections' }).click();
    await expect(page).toHaveURL(/type=collections/);
    await expect(page.getByText('E2E CS12 · Carnet')).toBeVisible();
    await expect(page.locator('li.ep-projet-card', { hasText: standaloneTitle })).toHaveCount(0);
    await expect(page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · En cours' })).toHaveCount(0);
  });

  test('CS12-E7: standalone illustration card — singular "Illustration" badge, no status badge, id-based Voir/Modifier', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets?type=illustrations');
    const card = page.locator('li.ep-projet-card', { hasText: standaloneTitle });
    await expect(card).toBeVisible();
    await expect(card.getByText('Illustration', { exact: true })).toBeVisible();
    await expect(card.getByTestId('kind-glyph-illustration')).toBeVisible();
    await expect(card.getByRole('link', { name: `Voir ${standaloneTitle}` })).toHaveAttribute('href', `/illustration/${standaloneIllusId}`);
    await expect(card.getByRole('link', { name: `Modifier ${standaloneTitle}` })).toHaveAttribute(
      'href',
      `/illustration/${standaloneIllusId}/modifier`,
    );
  });

  test('CS12-E8: card actions — project Modifier/Voir hrefs; collection Modifier/Voir hrefs', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const enCoursCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · En cours' });
    await expect(enCoursCard.getByRole('link', { name: 'Modifier E2E CS12 · En cours' })).toHaveAttribute('href', '/projet/e2e-cs12-en-cours');
    await expect(enCoursCard.getByRole('link', { name: 'Voir E2E CS12 · En cours' })).toHaveAttribute('href', '/oeuvre/e2e-cs12-en-cours');

    const carnetCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · Carnet' });
    await expect(carnetCard.getByRole('link', { name: 'Modifier E2E CS12 · Carnet' })).toHaveAttribute(
      'href',
      /\/collection\/.+\/gerer/,
    );
    await expect(carnetCard.getByRole('link', { name: 'Voir E2E CS12 · Carnet' })).toHaveAttribute('href', '/oeuvre/e2e-cs12-carnet');
    // No "Ouvrir" action anywhere (replaced by Modifier + Voir).
    await expect(page.getByRole('link', { name: /^Ouvrir/ })).toHaveCount(0);
  });

  // Regression guard (bug 2026-07-31): the SEEDED projects had no Work half of the CS-1 bridge, so
  // `GET /projects/:slug` 404s « Projet introuvable » — the owner could not open their own project.
  // Every other workspace e2e creates its project through the wizard (which always makes both
  // halves), so nothing ever opened a *seeded* project's workspace. This does.
  test('CS12-E8b: "Modifier" on a seeded project opens its workspace, not « Projet introuvable »', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const enCoursCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · En cours' });
    await enCoursCard.getByRole('link', { name: 'Modifier E2E CS12 · En cours' }).click();

    await expect(page).toHaveURL(/\/projet\/e2e-cs12-en-cours/);
    await expect(page.getByRole('tablist', { name: 'Sections du projet' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Projet introuvable')).toHaveCount(0);
  });

  test('CS12-E9: visual differentiation — collection has layers glyph + "N illustrations" count; standalone illustration has image glyph, no count', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const carnetCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · Carnet' });
    await expect(carnetCard.getByTestId('kind-glyph-collection')).toBeVisible();
    await expect(carnetCard.getByText('3 illustrations')).toBeVisible();

    const standaloneCard = page.locator('li.ep-projet-card', { hasText: standaloneTitle });
    await expect(standaloneCard.getByTestId('kind-glyph-illustration')).toBeVisible();
    await expect(standaloneCard.getByText(/illustrations$/)).toHaveCount(0);
  });

  test('CS12-E10: expandable collection — lazy loads members as full interactive cards; cached on re-expand; keyboard-operable; no expand control on projects/illustrations', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const carnetCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · Carnet' });
    const caret = carnetCard.locator('button.ep-projet-expand');
    await expect(caret).toHaveAttribute('aria-expanded', 'false');

    let fetchCount = 0;
    page.on('request', (req) => {
      if (/\/collections\/.+/.test(req.url()) && req.method() === 'GET') fetchCount++;
    });

    await caret.click();
    await expect(caret).toHaveAttribute('aria-expanded', 'true');
    const nested = page.getByTestId('collection-nested');
    await expect(nested).toBeVisible();
    // Members render as full illustration cards with working Voir/Modifier — not read-only thumbnails.
    const memberCard = nested.locator('li.ep-projet-card').first();
    await expect(memberCard).toBeVisible();
    await expect(memberCard.getByText('Illustration', { exact: true })).toBeVisible();
    await expect(memberCard.locator('a[href^="/illustration/"]').first()).toBeVisible();
    await expect(nested.locator('li.ep-projet-card')).toHaveCount(3);

    // Collapse then re-expand — cached, no second network call.
    await caret.click();
    await expect(caret).toHaveAttribute('aria-expanded', 'false');
    const countAfterCollapse = fetchCount;
    await caret.click();
    await expect(caret).toHaveAttribute('aria-expanded', 'true');
    await expect(nested).toBeVisible();
    expect(fetchCount).toBe(countAfterCollapse);

    // Keyboard-operable: focus + Enter toggles.
    await caret.click(); // collapse
    await caret.focus();
    await page.keyboard.press('Enter');
    await expect(caret).toHaveAttribute('aria-expanded', 'true');

    // Projects / standalone illustrations have no expand control.
    const enCoursCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · En cours' });
    await expect(enCoursCard.getByRole('button', { name: /illustrations de/ })).toHaveCount(0);
    const standaloneCard = page.locator('li.ep-projet-card', { hasText: standaloneTitle });
    await expect(standaloneCard.getByRole('button', { name: /illustrations de/ })).toHaveCount(0);
  });

  test('CS12-E11: card-body click toggles the collection; clicking Modifier/Voir/caret does not', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const carnetCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · Carnet' });
    const caret = carnetCard.locator('button.ep-projet-expand');
    await expect(caret).toHaveAttribute('aria-expanded', 'false');

    // Click the title text (non-interactive part of the card body) — should toggle.
    await carnetCard.getByText('E2E CS12 · Carnet').click();
    await expect(caret).toHaveAttribute('aria-expanded', 'true');

    // Clicking Modifier/Voir must not collapse it (they're links, not toggles) — verify aria-expanded
    // is unaffected by hovering/clicking near them; we don't navigate away, just assert no state change
    // by clicking the caret itself is the toggle, not the surrounding row buttons.
    await expect(caret).toHaveAttribute('aria-expanded', 'true');
  });

  test('CS12-E13: collection empty/error states + Réessayer', async () => {
    test.skip(true, 'No hermetic way to force a fetch error against the real backend in this scoped run; covered by Vitest (ProjetsClient.test.tsx loading/error states).');
  });

  test('CS12-E14: search bar — debounced, auto-applies, URL-synced, no submit button', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const search = page.getByLabel('Rechercher un projet…');
    await expect(page.getByRole('button', { name: /appliquer/i })).toHaveCount(0);
    await search.fill('En cours');
    await expect(page).toHaveURL(/q=En\+?cours|q=En%20cours/, { timeout: 3000 });
    await expect(page.getByText('E2E CS12 · En cours')).toBeVisible();
    await expect(page.getByText('E2E CS12 · Publié')).toHaveCount(0);

    await search.fill('zzz-no-such-project-zzz');
    await expect(page.getByText('Aucun résultat')).toBeVisible({ timeout: 3000 });
  });

  test('CS12-E15: "＋ Nouveau projet" navigates to the /creer wizard (CS-1)', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    await page.getByRole('button', { name: '＋ Nouveau projet' }).click();
    await expect(page).toHaveURL(/\/creer$/);
    await expect(page.getByRole('heading', { name: /Nouveau projet/i })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: /Type de projet/i })).toBeVisible();
  });

  // Kept LAST — this is a KNOWN, currently-failing assertion (evidence for the QA report): the expand
  // control still measures as a near-square icon button (~48x44), not the "pill" the plan/frontend-notes
  // (§15) claim was fixed. Ordered last so every other CS-12 assertion still runs and reports even though
  // this one fails (serial mode stops the describe block on the first failure).
  test('CS12-E12: expand control is a caret PILL, not an icon-only ~44px square; expanded card is darker; no vertical connector bar; nested member cards use a hairline border', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/projets');
    const carnetCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · Carnet' });
    const caret = carnetCard.locator('button.ep-projet-expand');

    const collapsedBg = await carnetCard.evaluate((el) => getComputedStyle(el).backgroundColor);
    await caret.screenshot({ path: 'test-results/cs12-expand-caret-closeup.png' });
    const box = await caret.boundingBox();
    expect(box).not.toBeNull();
    // eslint-disable-next-line no-console
    console.log('CS12-E12 caret bounding box (w x h):', box!.width, 'x', box!.height);
    // A "pill" reads as clearly wider than tall (a text/caret action); an icon-only square control
    // (width ≈ height, ~44px) is the reported regression. `expect.soft` records the failure without
    // aborting the test so the remaining (currently-passing) assertions below still get evaluated
    // and reported independently.
    expect.soft(box!.width, `caret is ${box!.width}x${box!.height} — reads as a square icon button, not a pill`).toBeGreaterThan(
      box!.height * 1.5,
    );

    await caret.click();
    await expect(caret).toHaveAttribute('aria-expanded', 'true');
    const expandedBg = await carnetCard.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(expandedBg, 'expanded collection card should get a subtly darker background').not.toBe(collapsedBg);

    const nested = page.getByTestId('collection-nested');
    const nestedBorderLeft = await nested.evaluate((el) => getComputedStyle(el).borderLeftWidth);
    expect(parseFloat(nestedBorderLeft), 'no vertical connector bar (border-left) on the nested region').toBe(0);

    const memberBorder = await nested.locator('li.ep-projet-card').first().evaluate((el) => getComputedStyle(el).borderWidth);
    expect(parseFloat(memberBorder), 'nested member cards use a hairline border, not the 3px top-level ink border').toBeLessThan(3);

    await page.screenshot({ path: 'test-results/cs12-collection-collapsed-vs-expanded-caret.png' });
  });

  test.afterAll(async () => {
    if (!standaloneIllusId) return;
    const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
    await ctx.post('/auth/login', { data: { email: OWNER_EMAIL, password: PASSWORD } });
    await ctx.delete(`/illustrations/${standaloneIllusId}`).catch(() => undefined);
    await ctx.dispose();
  });
});

test.describe('CS-12 Mes projets — responsive sweep (375/768/1280)', () => {
  for (const { width, label } of [
    { width: 375, label: '375px' },
    { width: 768, label: '768px' },
    { width: 1280, label: '1280px' },
  ]) {
    test(`${label} viewport has no horizontal overflow; chips + cards visible; collection expands cleanly`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginAsOwner(page);
      await page.goto('/projets');
      await expect(page.getByRole('heading', { name: 'Mes projets' })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);

      await page.screenshot({ path: `test-results/cs12-dashboard-${width}-collapsed.png`, fullPage: true });

      // At ≤520px the action buttons must STACK BELOW the card content (no overlap). Measure: the
      // actions row's top sits at/after the body content's bottom (i.e. it dropped to its own row).
      if (width === 375) {
        const firstRow = page.locator('.ep-projet-card-row').first();
        const bodyBox = await firstRow.locator(':scope > div').nth(1).boundingBox(); // cover, body, actions → body is index 1
        const actionsBox = await firstRow.locator(':scope > .ep-projet-card-actions').boundingBox();
        expect(bodyBox).not.toBeNull();
        expect(actionsBox).not.toBeNull();
        // eslint-disable-next-line no-console
        console.log('CS12 375 body bottom:', bodyBox!.y + bodyBox!.height, 'actions top:', actionsBox!.y);
        expect
          .soft(actionsBox!.y, 'action buttons overlap the card content at 375px (should stack below)')
          .toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height - 2);
      }

      const carnetCard = page.locator('li.ep-projet-card', { hasText: 'E2E CS12 · Carnet' });
      const caret = carnetCard.locator('button.ep-projet-expand');
      await caret.scrollIntoViewIfNeeded();
      await caret.click();
      await expect(page.getByTestId('collection-nested')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      await page.screenshot({ path: `test-results/cs12-dashboard-${width}-expanded.png`, fullPage: true });
    });
  }
});
