/**
 * MC-8 — "Contacts & connexions" (route /contacts) e2e acceptance suite.
 *
 * No prototype frame exists for this screen (plan §1 fidelity finding — verified: grep for
 * "contact" in the prototype HTML returns zero hits). The story text is the binding visual spec;
 * this suite grades against plan.md's acceptance checklist + decisions D1–D12, not a drawn frame.
 *
 * Real backend + seeded dev DB (apps/api/prisma/seed.js) — not hermetic, exercises the real
 * GET /contacts, /connections/requests, /connections/suggestions, /people/search endpoints.
 *
 * Login as contacts.mc8@seed.encre-et-plume.local / password123 (mc8-contacts-fixture, "Camille R."),
 * a dedicated MC-8 account (backend-notes.md §Seed fixtures):
 *   - 2 ACCEPTED contacts: Léa B. (mc1-lea-b, scénariste) and Hugo D. (mc1-hugo-d, dessinateur).
 *   - 2 PENDING INCOMING requests: Noé P. (mc1-noe-p) and Diego S. (mc1-diego-s), both with the
 *     fallback context "souhaite se connecter" (no mutual projects/likes seeded between them).
 *
 * Tests in the main describe block are ORDER-DEPENDENT (sequential execution, no reseed in
 * between — MC-7 precedent): MC8-E2 relies on Noé still being pending (must run before MC8-E3
 * resolves him); MC8-E3 resolves Noé (accepted) and Diego (declined); MC8-E4 then removes Noé
 * from Contacts (the request→accept→remove lifecycle, D7). Keep this order.
 *
 * Presence (D4) is read from the live Redis session index and therefore depends on how recently
 * each account was last authenticated — NOT reset by reseeding. Anatomy checks accept any of the
 * three valid presence strings (regex); MC8-E1b deterministically forces Léa's session fresh
 * (logs her in) immediately before asserting "en ligne" on her row.
 *
 * MC-2 exclusion seam (D10, matches.service.ts) is verified via a SEPARATE, unrelated viewer
 * (Yuki Moreau) at the API level — never via dr1-camille-roux, who is the login-tested viewer for
 * mc2-suggestions.spec.ts/trouver.spec.ts (asserting Théo M. tops her ranking); connecting her to a
 * candidate here would permanently remove that candidate from her suggestions until reseed and
 * break those specs when run without a reseed in between.
 */
import { test, expect, type Page } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';
const MC8_EMAIL = 'contacts.mc8@seed.encre-et-plume.local';
const LEA_EMAIL = 'lea.b@seed.encre-et-plume.local';
const NOE_EMAIL = 'noe.p@seed.encre-et-plume.local';
const DIEGO_EMAIL = 'diego.s@seed.encre-et-plume.local';
const INES_EMAIL = 'ines.k@seed.encre-et-plume.local';
const YUKI_EMAIL = 'yuki.moreau@seed.encre-et-plume.local';
const MC2_SPARSE_EMAIL = 'mc2.sansprofil@seed.encre-et-plume.local';

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

async function gotoContacts(page: Page) {
  await page.goto('/contacts');
  await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
    timeout: 10_000,
  });
}

const contactsPanel = (page: Page) => page.locator('#tabpanel-contacts');
const demandesPanel = (page: Page) => page.locator('#tabpanel-demandes');
const rowByName = (panel: ReturnType<typeof contactsPanel>, name: string) => panel.locator('li').filter({ hasText: name });

// Presence is a live signal (Redis session index) — accept any of the three valid strings unless
// a test explicitly forces one deterministically (D4, FE-7 — text conveys it, not colour alone).
const PRESENCE_RE = /en ligne|hors ligne|vu /i;

test.describe('MC-8 Contacts & connexions — signed in as the fixture account (mc8-contacts-fixture)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, MC8_EMAIL);
  });

  test('MC8-E1: avatar menu entry navigates to /contacts; tabs render live counts + badge; contact row anatomy (FE-1, FE-4, FE-7, D2, D5, D7)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /menu de camille r\./i }).click();
    const item = page.getByRole('menuitem', { name: /contacts & connexions/i });
    await expect(item).toHaveAttribute('href', '/contacts');
    await item.click();
    await expect(page).toHaveURL('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: 'Contacts · 2' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /demandes,\s*2 en attente/i })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Suggestions' })).toBeVisible();

    // FE-2 / D8 — "＋ Ajouter un contact" focuses the labelled, verbatim-placeholder search field.
    const search = page.getByRole('searchbox', { name: 'Rechercher des personnes' });
    await expect(search).toHaveAttribute('placeholder', 'nom, rôle, genre, région…');
    await page.getByRole('button', { name: '＋ Ajouter un contact' }).click();
    await expect(search).toBeFocused();
    await search.blur();

    // FE-4 — Contacts tab (default) shows both accepted contacts with full row anatomy.
    const panel = contactsPanel(page);
    const lea = rowByName(panel, 'Léa B.');
    await expect(lea).toBeVisible();
    await expect(lea.getByText('Scénariste')).toBeVisible();
    await expect(lea.getByText(PRESENCE_RE)).toBeVisible();
    const leaMessage = lea.getByRole('button', { name: 'Message à Léa B.' });
    await expect(leaMessage).toBeVisible();
    await expect(leaMessage).toBeDisabled(); // D5 — MC-9 seam, ships disabled
    await expect(lea.getByRole('button', { name: 'Actions pour Léa B.' })).toBeVisible();

    const hugo = rowByName(panel, 'Hugo D.');
    await expect(hugo).toBeVisible();
    await expect(hugo.getByText('Dessinateur·rice')).toBeVisible();
    await expect(hugo.getByText(PRESENCE_RE)).toBeVisible();
    await expect(hugo.getByRole('button', { name: 'Message à Hugo D.' })).toBeDisabled();
  });

  test('MC8-E1b: presence is conveyed as text, not colour alone — forcing Léa online is reflected on reload (D4, FE-7)', async ({
    page,
    browser,
  }) => {
    // Force Léa's session fresh (login touches the F-18 Redis session index within the window).
    const leaCtx = await browser.newContext();
    try {
      const leaPage = await leaCtx.newPage();
      await login(leaPage, LEA_EMAIL);
    } finally {
      await leaCtx.close();
    }

    await gotoContacts(page);
    const lea = rowByName(contactsPanel(page), 'Léa B.');
    await expect(lea.getByText('en ligne')).toBeVisible({ timeout: 10_000 });
  });

  test('MC8-E2: scoped people search shows the "Répondre" CTA for a pending-incoming request (D12) — while Noé is still pending', async ({
    page,
  }) => {
    await gotoContacts(page);
    const search = page.getByRole('searchbox', { name: 'Rechercher des personnes' });
    await search.fill('Noé');

    const resultsSection = page.getByRole('region', { name: 'Résultats de recherche' }).or(
      page.locator('section[aria-label="Résultats de recherche"]'),
    );
    await expect(resultsSection.getByText('Noé P.')).toBeVisible({ timeout: 10_000 });
    const respond = resultsSection.getByRole('button', { name: /répondre à la demande de noé p\./i });
    await expect(respond).toBeVisible();

    // "Répondre" clears the search query (so `searching` flips off) AND switches to the Demandes
    // tab, so the user actually lands on Noé's pending request. (Fixed after the QA finding: the
    // handler now resets query + debouncedQuery before setTab.)
    await respond.click();
    await expect(search).toHaveValue('');
    const demandes = demandesPanel(page);
    await expect(demandes).toBeVisible();
    await expect(demandes.getByText('Noé P.')).toBeVisible();
  });

  test('MC8-E3: Demandes tab anatomy; Accepter Noé (F-5 notif, badge/count update), Refuser Diego (silent, empty state) (FE-3, FE-6, BE-9, BE-12, D6)', async ({
    page,
  }) => {
    await gotoContacts(page);
    await page.getByRole('tab', { name: /demandes/i }).click();

    const panel = demandesPanel(page);
    const noe = rowByName(panel, 'Noé P.');
    await expect(noe).toBeVisible();
    await expect(noe.getByText('Scénariste')).toBeVisible();
    await expect(noe.getByText('souhaite se connecter')).toBeVisible();
    const diego = rowByName(panel, 'Diego S.');
    await expect(diego).toBeVisible();
    await expect(diego.getByText('souhaite se connecter')).toBeVisible();

    // Accepter Noé — optimistic row removal, badge decrements 2 → 1, Contacts count 2 → 3.
    await noe.getByRole('button', { name: 'Accepter la demande de Noé P.' }).click();
    await expect(noe).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tablist').getByRole('tab', { name: /demandes,\s*1 en attente/i })).toBeVisible();
    await expect(page.getByRole('tablist').getByRole('tab', { name: 'Contacts · 3' })).toBeVisible();

    // Refuser Diego — row disappears silently, badge/count fully clears, "Aucune demande" empty state.
    await diego.getByRole('button', { name: 'Refuser la demande de Diego S.' }).click();
    await expect(diego).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Aucune demande')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tablist').getByRole('tab', { name: 'Demandes' })).toBeVisible();

    // Reload — decisions persisted server-side.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('tablist').getByRole('tab', { name: 'Contacts · 3' })).toBeVisible();
    await page.getByRole('tab', { name: /demandes/i }).click();
    await expect(page.getByText('Aucune demande')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('tab', { name: /contacts/i }).click();
    await expect(rowByName(contactsPanel(page), 'Noé P.')).toBeVisible();
  });

  test('MC8-E4: overflow menu — "Voir le profil" navigates (Hugo); "Retirer le contact" removes with inline confirm (Noé, the full request→accept→remove lifecycle) (D7)', async ({
    page,
  }) => {
    await gotoContacts(page);
    const panel = contactsPanel(page);

    const hugo = rowByName(panel, 'Hugo D.');
    await hugo.getByRole('button', { name: 'Actions pour Hugo D.' }).click();
    const profileLink = hugo.getByRole('menuitem', { name: 'Voir le profil' });
    await expect(profileLink).toHaveAttribute('href', '/mc1-hugo-d');
    await profileLink.click();
    await expect(page).toHaveURL('/mc1-hugo-d');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    await gotoContacts(page);
    const panel2 = contactsPanel(page);
    await expect(page.getByRole('tablist').getByRole('tab', { name: 'Contacts · 3' })).toBeVisible();
    const noe = rowByName(panel2, 'Noé P.');
    await noe.getByRole('button', { name: 'Actions pour Noé P.' }).click();
    await noe.getByRole('menuitem', { name: 'Retirer le contact' }).click();
    const confirmGroup = noe.getByRole('group', { name: 'Confirmer le retrait de Noé P.' });
    await expect(confirmGroup).toBeVisible();
    await confirmGroup.getByRole('button', { name: 'Confirmer' }).click();

    await expect(noe).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tablist').getByRole('tab', { name: 'Contacts · 2' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('tablist').getByRole('tab', { name: 'Contacts · 2' })).toBeVisible();
    await expect(rowByName(contactsPanel(page), 'Noé P.')).toHaveCount(0);
  });

  test('MC8-E5: scoped people search finds an unconnected creator; "＋ Se connecter" sends a request that persists server-side (F-7, D12)', async ({
    page,
  }) => {
    await gotoContacts(page);
    const search = page.getByRole('searchbox', { name: 'Rechercher des personnes' });
    await search.fill('Inès');

    const resultsSection = page.locator('section[aria-label="Résultats de recherche"]');
    await expect(resultsSection.getByText('Inès K.')).toBeVisible({ timeout: 10_000 });
    const connectBtn = resultsSection.getByRole('button', { name: 'Se connecter avec Inès K.' });
    await connectBtn.click();
    await expect(resultsSection.getByRole('button', { name: 'Demande envoyée à Inès K.' })).toBeVisible({
      timeout: 10_000,
    });

    // Persisted server-side (not just optimistic) — reload and re-search.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('searchbox', { name: 'Rechercher des personnes' }).fill('Inès');
    const resultsSection2 = page.locator('section[aria-label="Résultats de recherche"]');
    await expect(
      resultsSection2.getByRole('button', { name: 'Demande envoyée à Inès K.' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('MC8-E6: error state per tab + "Réessayer" retries and succeeds (FE-6)', async ({ page }) => {
    let calls = 0;
    await page.route(`${API}/contacts`, (route) => {
      calls += 1;
      if (calls === 1) return route.fulfill({ status: 500, json: { message: 'boom' } });
      return route.continue();
    });

    await gotoContacts(page);
    const alert = page.getByRole('alert').filter({ hasText: 'Impossible de charger vos contacts.' });
    await expect(alert).toBeVisible({ timeout: 10_000 });

    await alert.getByRole('button', { name: 'Réessayer' }).click();
    await expect(rowByName(contactsPanel(page), 'Léa B.')).toBeVisible({ timeout: 10_000 });
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test('MC8-E7: responsive — 375/768/1280px have no horizontal overflow, tabs reachable, tap targets ≥44px', async ({
    page,
  }) => {
    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await gotoContacts(page);
      const noOverflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(noOverflow).toBe(true);
      await expect(page.getByRole('tablist')).toBeVisible();
    }

    await page.setViewportSize({ width: 375, height: 800 });
    await gotoContacts(page);
    const messageBtn = rowByName(contactsPanel(page), 'Léa B.').getByRole('button', { name: 'Message à Léa B.' });
    await expect(messageBtn).toBeVisible();
    const box = await messageBtn.boundingBox();
    expect(box && box.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: 'test-results/mc8-contacts-375px.png', fullPage: true });

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoContacts(page);
    await page.screenshot({ path: 'test-results/mc8-contacts-768px.png', fullPage: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoContacts(page);
    await page.screenshot({ path: 'test-results/mc8-contacts-1280px.png', fullPage: true });
  });
});

test('MC8-E8: F-5 — Noé sees a "connection_accepted" notification linking to /contacts; Diego (declined) sees none (BE-12)', async ({
  browser,
}) => {
  // Runs after the MC8_EMAIL describe block above (same file, sequential execution) — Noé was
  // accepted, Diego declined.
  const noeCtx = await browser.newContext();
  try {
    const noePage = await noeCtx.newPage();
    await login(noePage, NOE_EMAIL);
    await noePage.goto('/notifications');
    await expect(noePage.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible({ timeout: 10_000 });
    const notif = noePage.getByRole('button', { name: /camille r\..*a accepté votre demande de connexion/i }).first();
    await expect(notif).toBeVisible();
    await notif.click();
    await expect(noePage).toHaveURL('/contacts');
  } finally {
    await noeCtx.close();
  }

  const diegoCtx = await browser.newContext();
  try {
    const diegoPage = await diegoCtx.newPage();
    await login(diegoPage, DIEGO_EMAIL);
    await diegoPage.goto('/notifications');
    await expect(diegoPage.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(diegoPage.getByRole('button', { name: /a accepté votre demande de connexion/i })).toHaveCount(0);
  } finally {
    await diegoCtx.close();
  }
});

test('MC8-E9: F-5 — Inès sees a "connection_request" notification and the pending request in her own Demandes tab', async ({
  page,
}) => {
  // Runs after MC8-E5 above (same file, sequential execution) — Camille R. sent Inès a request.
  await login(page, INES_EMAIL);
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible({ timeout: 10_000 });
  const notif = page.getByRole('button', { name: /camille r\..*souhaite se connecter avec vous/i }).first();
  await expect(notif).toBeVisible();
  await notif.click();
  await expect(page).toHaveURL('/contacts');

  await page.getByRole('tab', { name: /demandes/i }).click();
  const row = demandesPanel(page).locator('li').filter({ hasText: 'Camille R.' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByText('souhaite se connecter')).toBeVisible();
});

test('MC8-E10: empty states as an account with zero network (all three tabs) (FE-6)', async ({ page }) => {
  await login(page, MC2_SPARSE_EMAIL);
  await gotoContacts(page);

  await expect(page.getByText('Aucun contact')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('tab', { name: /demandes/i }).click();
  await expect(page.getByText('Aucune demande')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('tab', { name: /suggestions/i }).click();
  await expect(page.getByText('Aucune suggestion')).toBeVisible({ timeout: 10_000 });
});

test('MC8-E11: logged-out visit to /contacts shows a connect prompt', async ({ page }) => {
  await page.goto('/contacts');
  await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByText('Connectez-vous pour retrouver vos contacts et vos demandes de connexion.'),
  ).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
    'href',
    '/connexion?redirect=/contacts',
  );
});

test('MC8-E12: MC-2 exclusion seam — a connected/pending pair disappears from future MC-2 suggestions (matches.service.ts, D10) via /matches/suggestions AND /connections/suggestions', async ({
  page,
}) => {
  // dr1-yuki-moreau: an unrelated viewer (never used elsewhere as a suggestions/connections
  // subject) so this mutation can't ripple into mc2-suggestions.spec.ts / trouver.spec.ts, which
  // assert dr1-camille-roux's own ranking.
  await login(page, YUKI_EMAIL);

  const before = await page.request.get(`${API}/matches/suggestions?limit=8`);
  expect(before.status()).toBe(200);
  const beforeBody = (await before.json()) as { items: { userId: string; name: string }[]; incompleteProfile: boolean };
  expect(beforeBody.incompleteProfile).toBe(false);
  expect(beforeBody.items.length).toBeGreaterThan(0);
  const candidate = beforeBody.items[0];

  const post = await page.request.post(`${API}/connections/requests`, { data: { toUser: candidate.userId } });
  expect(post.status()).toBe(201);

  // Different `limit` busts the per-viewer Redis cache key (`matches:sugg:<id>:<limit>`) so this
  // is a fresh compute() call, not the 60s-stale cached pre-connection list (plan D10 note).
  const after = await page.request.get(`${API}/matches/suggestions?limit=7`);
  expect(after.status()).toBe(200);
  const afterBody = (await after.json()) as { items: { userId: string }[] };
  expect(afterBody.items.some((i) => i.userId === candidate.userId)).toBe(false);

  // GET /connections/suggestions (MC-8's own endpoint, limit 12 internally) — first call for this
  // viewer at this cache key, so also a fresh compute(): same exclusion applies.
  const mc8Suggestions = await page.request.get(`${API}/connections/suggestions`);
  expect(mc8Suggestions.status()).toBe(200);
  const mc8Body = (await mc8Suggestions.json()) as { items: { userId: string }[] };
  expect(mc8Body.items.some((i) => i.userId === candidate.userId)).toBe(false);
});
