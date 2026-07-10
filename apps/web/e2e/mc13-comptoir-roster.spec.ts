/**
 * MC-13 — Comptoir presence roster (final membership model) + reachable-user search
 * (+ closeIfFilled) — Playwright e2e suite.
 *
 * FINAL model (2026-07-10, churned twice before landing): presence = salon MEMBERSHIP
 * (`POST /salon/join` ↔ `POST /salon/leave`), persisting across widget-collapse and disconnect.
 * `GET /salon/presence` → `{ count, items }` where `count === items.length` ALWAYS: items include
 * the caller flagged `self:true` (rendered "· vous", no actions), only BLOCKED pairs are excluded.
 * A lone member sees `{ count: 1, items: [<self>] }` — not the old "1 en ligne + empty list" bug,
 * and not the earlier "count 0 excluding self" iteration either. The dock header's own "N en ligne"
 * reads the SAME `visibleMembers` set (`SalonService.getSummary` → `visibleMembers`), so header
 * count === roster count, always. The trigger is a user-icon button
 * (`aria-label="Voir les membres présents, N en ligne"` — NO "Le Comptoir" substring, so it can't
 * collide with mc11-salon.spec.ts's own `getByRole('button', {name:/Le Comptoir/})` locator).
 *
 * Hermeticity (per the MC9-E11 lesson + this suite's own risk — Le Comptoir is one GLOBAL room
 * shared by every spec that opens the dock, e.g. mc11-salon.spec.ts, AND membership is now a
 * PERSISTENT DB row with no TTL/reseed — a join that's never left pollutes every future run's
 * counts forever): every account here is a FRESH signup created inline, and every account that
 * JOINS the salon in a test also LEAVES it before the test ends (via the "Quitter" button, or a
 * direct `POST /salon/leave` if its page/context is already gone), so no test leaves a permanent
 * member behind.
 *
 * Reachability fixtures (section B): dmPolicy is set via `PATCH /accounts/me/preferences` (an
 * existing F-19 seam, not psql) on freshly signed-up throwaway accounts — no e2e-seed.js changes.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const PASSWORD = 'password123';

function freshEmail(tag = 'mc13'): string {
  return `qa_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

function slugFrom(email: string): string {
  return email.split('@')[0].replace(/[^a-z0-9-]/g, '-').slice(0, 28);
}

async function signUpVerifyAndLogin(page: Page, email: string, displayName: string): Promise<void> {
  const su = await page.request.post(`${API}/auth/signup`, {
    data: {
      email,
      displayName,
      username: slugFrom(email),
      password: PASSWORD,
      birthdate: '1990-01-01',
      acceptCgu: true,
    },
  });
  if (!su.ok()) throw new Error(`signup failed: ${su.status()} ${await su.text()}`);

  let token: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await page.request.get(
      `${API}/auth/verify-email/dev-latest?email=${encodeURIComponent(email)}`,
    );
    if (r.ok()) {
      token = (await r.json() as { token: string }).token;
      break;
    }
    await page.waitForTimeout(300);
  }
  if (!token) throw new Error('dev-latest token not found');

  const cv = await page.request.post(`${API}/auth/verify-email/confirm`, { data: { token } });
  if (!cv.ok()) throw new Error(`email confirm failed: ${cv.status()}`);

  const lr = await page.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  if (!lr.ok()) throw new Error(`login failed: ${lr.status()}`);
}

async function loginUi(page: Page, email: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

/** Signs up + logs in a fresh throwaway account directly on an EXISTING page (single-page tests). */
async function signUpFreshOnPage(page: Page, tag: string, name: string): Promise<void> {
  const email = freshEmail(tag);
  await signUpVerifyAndLogin(page, email, name);
  await loginUi(page, email);
}

/** Same, but opens a new page in the given context first (multi-context realtime tests). */
async function signUpFreshUi(context: BrowserContext, tag: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await signUpFreshOnPage(page, tag, name);
  return page;
}

/** F-19 dmPolicy on the currently-logged-in page's own account (session cookie carried by page.request). */
async function setDmPolicy(page: Page, dmPolicy: 'anyone' | 'requests' | 'contacts'): Promise<void> {
  const res = await page.request.patch(`${API}/accounts/me/preferences`, { data: { dmPolicy } });
  if (!res.ok()) throw new Error(`setDmPolicy failed: ${res.status()} ${await res.text()}`);
}

const salonHeader = (page: Page) => page.getByRole('button', { name: /Le Comptoir/ });
const salonDock = (page: Page) => page.locator('.ep-salon-dock');
// The trigger's aria-label deliberately omits "Le Comptoir" (fixed post-rework) — no collision risk
// with salonHeader above, so this stays unanchored.
const rosterToggle = (page: Page) => page.getByRole('button', { name: /Voir les membres présents/ });
const rosterRegion = (page: Page) => page.getByRole('region', { name: /Membres présents dans Le Comptoir/ });
const msgFab = (page: Page) => page.getByRole('button', { name: /^Messages/ });
const msgPanel = (page: Page) => page.getByRole('dialog', { name: 'Messages' });

/** Reads the roster panel's "N en ligne dans Le Comptoir" header count as a number. */
async function readRosterCount(page: Page): Promise<number> {
  const text = await rosterRegion(page).locator('b').first().textContent();
  const match = text?.match(/(\d+)\s*en ligne/);
  if (!match) throw new Error(`roster count text not found: "${text}"`);
  return parseInt(match[1], 10);
}

/** Reads the dock header's own "N en ligne" text as a number (membership count). */
async function readDockOnlineCount(page: Page): Promise<number> {
  const text = await salonHeader(page).textContent();
  const match = text?.match(/(\d+)\s*en ligne/);
  if (!match) throw new Error(`dock online-count text not found: "${text}"`);
  return parseInt(match[1], 10);
}

/** Reads the (collapsed) roster trigger's own badge count from its aria-label. */
async function readTriggerCount(page: Page): Promise<number> {
  const label = await rosterToggle(page).getAttribute('aria-label');
  const match = label?.match(/(\d+)\s*en ligne/);
  if (!match) throw new Error(`trigger aria-label count not found: "${label}"`);
  return parseInt(match[1], 10);
}

/** Expands the dock (if collapsed) and clicks "＋ Rejoindre le salon". Assumes not yet a member. */
async function joinSalon(page: Page): Promise<void> {
  if ((await salonHeader(page).getAttribute('aria-expanded')) !== 'true') {
    await salonHeader(page).click();
  }
  await salonDock(page).getByRole('button', { name: '＋ Rejoindre le salon' }).click();
  await expect(salonDock(page).getByRole('button', { name: 'Quitter' })).toBeVisible({ timeout: 10_000 });
}

/** Expands the dock (if collapsed) and clicks "Quitter" — the ONLY way membership ends. */
async function leaveSalon(page: Page): Promise<void> {
  if ((await salonHeader(page).getAttribute('aria-expanded')) !== 'true') {
    await salonHeader(page).click();
  }
  await salonDock(page).getByRole('button', { name: 'Quitter' }).click();
  await expect(salonDock(page).getByRole('button', { name: '＋ Rejoindre le salon' })).toBeVisible({ timeout: 10_000 });
}

/** Best-effort leave via a raw API call — used when the acting page is otherwise still busy. */
async function leaveSalonApi(page: Page): Promise<void> {
  await page.request.post(`${API}/salon/leave`).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// A) Single-user toggle — the exact bug the PO hit: join → count+1 & "· vous"; leave → count−1 &
// self row gone; join again → count+1 again (not stuck).
// ─────────────────────────────────────────────────────────────────────────────

test('MC13-E1: single-user Rejoindre/Quitter toggle — count and the "· vous" row move symmetrically, and re-joining is not stuck', async ({ page }) => {
  await signUpFreshOnPage(page, 'solo', 'MC13 Solo');
  await rosterToggle(page).click();
  await expect(rosterRegion(page)).toBeVisible();

  // Baseline BEFORE joining — read relatively, not assumed to be 0/empty: the shared salon room is a
  // PERSISTENT DB table with no per-run reseed, so other (unrelated, long-lived) members may already
  // be present from earlier runs. The acceptance criterion is the DELTA on join/leave, not an absolute
  // "alone" state — same convention mc11-salon.spec.ts uses for its own presence assertions.
  await expect(async () => {
    const c = await readRosterCount(page);
    expect(c).toBeGreaterThanOrEqual(0);
  }).toPass({ timeout: 10_000 });
  const countBeforeJoin = await readRosterCount(page);

  // Join → count +1, "· vous" row appears, header/roster agree.
  await joinSalon(page);
  await expect(async () => {
    expect(await readRosterCount(page)).toBe(countBeforeJoin + 1);
  }).toPass({ timeout: 10_000 });
  await expect(rosterRegion(page).getByText('· vous')).toBeVisible({ timeout: 10_000 });
  const countAfterJoin = await readRosterCount(page);
  await expect(async () => {
    expect(await readDockOnlineCount(page)).toBe(countAfterJoin);
  }).toPass({ timeout: 10_000 });
  await page.screenshot({ path: 'e2e/screenshots/mc13-single-user-joined.png' });

  // Leave → count reverts, "· vous" row gone.
  await leaveSalon(page);
  await expect(async () => {
    expect(await readRosterCount(page)).toBe(countBeforeJoin);
  }).toPass({ timeout: 10_000 });
  await expect(rosterRegion(page).getByText('· vous')).toHaveCount(0);

  // Re-join → count bumps again (not stuck at 0 / not a no-op second time).
  await joinSalon(page);
  await expect(async () => {
    expect(await readRosterCount(page)).toBe(countAfterJoin);
  }).toPass({ timeout: 10_000 });
  await expect(rosterRegion(page).getByText('· vous')).toBeVisible({ timeout: 10_000 });

  await leaveSalon(page); // hermetic: don't leave a permanent member behind
});

// ─────────────────────────────────────────────────────────────────────────────
// A) Two-user observer — B (roster open) sees A's Rejoindre/Quitter live; collapsing the widget
// does not change membership; a full disconnect doesn't either.
// ─────────────────────────────────────────────────────────────────────────────

test('MC13-E2: an observer (roster open) sees another member\'s Rejoindre/Quitter live; collapsing the widget does not affect membership', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'obsA', 'MC13 ObsA');
    const nameB = `MC13 ObsB ${Date.now()}`;
    const pageB = await signUpFreshUi(ctxB, 'obsB', nameB);

    // A is the observer: opens the roster but never joins itself.
    await rosterToggle(pageA).click();
    await expect(rosterRegion(pageA)).toBeVisible();
    const countBefore = await readRosterCount(pageA);
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toHaveCount(0);

    // B joins → A's ALREADY-OPEN roster gets the live salon:member:joined delta.
    await joinSalon(pageB);
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(rosterRegion(pageA).getByLabel(`Voir le profil de ${nameB}`)).toBeVisible();
    await expect(rosterRegion(pageA).getByLabel(`Actions sur ${nameB}`)).toBeVisible();
    await expect(async () => {
      expect(await readRosterCount(pageA)).toBe(countBefore + 1);
    }).toPass({ timeout: 10_000 });

    // B collapses its widget — membership is a DB row, not tied to the dock/socket, so B stays.
    await salonHeader(pageB).click();
    await expect(salonHeader(pageB)).toHaveAttribute('aria-expanded', 'false');
    await pageA.waitForTimeout(1_500);
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toBeVisible();
    await expect(async () => {
      expect(await readRosterCount(pageA)).toBe(countBefore + 1);
    }).toPass({ timeout: 5_000 });

    // B re-expands and clicks Quitter → A's roster drops B live.
    await leaveSalon(pageB);
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toHaveCount(0, { timeout: 10_000 });
    await expect(async () => {
      expect(await readRosterCount(pageA)).toBe(countBefore);
    }).toPass({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('MC13-E3: membership persists across a FULL disconnect (context close) — only "Quitter" removes the member', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  let ctxB2: BrowserContext | null = null;
  try {
    const pageA = await signUpFreshUi(ctxA, 'discA', 'MC13 DiscA');
    const nameB = `MC13 DiscB ${Date.now()}`;
    const emailB = freshEmail('discB');
    const pageB = await ctxB.newPage();
    await signUpVerifyAndLogin(pageB, emailB, nameB);
    await loginUi(pageB, emailB);

    await rosterToggle(pageA).click();
    await expect(rosterRegion(pageA)).toBeVisible();
    await joinSalon(pageB);
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toBeVisible({ timeout: 10_000 });

    // Full disconnect (context closed → socket drops) must NOT remove membership — it's a DB row.
    await ctxB.close();
    await pageA.waitForTimeout(1_500);
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toBeVisible();

    // Re-connect as the SAME account and click "Quitter" — the only thing that removes the row.
    ctxB2 = await browser.newContext();
    const pageB2 = await ctxB2.newPage();
    await loginUi(pageB2, emailB);
    await leaveSalon(pageB2);
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB2?.close();
    // ctxB already closed mid-test.
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A) Trigger UI — user-icon button, no "Le Comptoir" in its label, badge matches the count.
// ─────────────────────────────────────────────────────────────────────────────

test('MC13-E4: the roster trigger label never says "Le Comptoir"; its badge matches the member count', async ({ page }) => {
  await signUpFreshOnPage(page, 'trig', 'MC13 Trig');
  const toggle = rosterToggle(page);
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  expect(await toggle.getAttribute('aria-expanded')).toBe('false');

  await expect(async () => {
    const label = await toggle.getAttribute('aria-label');
    expect(label).toMatch(/en ligne/); // waits for the initial GET /salon/presence to settle
  }).toPass({ timeout: 10_000 });
  const collapsedLabel = await toggle.getAttribute('aria-label');
  expect(collapsedLabel).toMatch(/^Voir les membres présents/);
  expect(collapsedLabel).not.toContain('Le Comptoir');
  // Relative baseline, not assumed 0 — the shared salon is a persistent DB table with no per-run
  // reseed, so unrelated long-lived members may already be present (same reasoning as MC13-E1).
  const countBefore = await readTriggerCount(page);

  await joinSalon(page);
  await expect(async () => {
    expect(await readTriggerCount(page)).toBe(countBefore + 1);
  }).toPass({ timeout: 10_000 });
  const badgeText = await toggle.locator('.ep-salon-roster-badge').textContent();
  expect(badgeText).toBe(String(countBefore + 1));

  await leaveSalon(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// A) Per-user actions — Voir le profil / Envoyer un message / Bloquer (never on the self row)
// ─────────────────────────────────────────────────────────────────────────────

test('MC13-E5: roster row "Voir le profil" navigates to /{slug}', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'profA', 'MC13 ProfA');
    const nameB = `MC13 ProfB ${Date.now()}`;
    const pageB = await signUpFreshUi(ctxB, 'profB', nameB);

    await rosterToggle(pageA).click();
    await joinSalon(pageB);

    const rowB = rosterRegion(pageA).getByLabel(`Actions sur ${nameB}`);
    await expect(rowB).toBeVisible({ timeout: 10_000 });
    const profileLink = rosterRegion(pageA).getByLabel(`Voir le profil de ${nameB}`);
    const href = await profileLink.getAttribute('href');
    expect(href).toMatch(/^\/[a-z0-9-]+$/);

    await rowB.click();
    await pageA.getByRole('menuitem', { name: 'Voir le profil' }).click();
    await expect(pageA).toHaveURL(new RegExp(`${href}$`));

    await leaveSalon(pageB);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('MC13-E6: roster row "Envoyer un message" opens a DM on the target', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'dmA', 'MC13 DmA');
    const nameB = `MC13 DmB ${Date.now()}`;
    const pageB = await signUpFreshUi(ctxB, 'dmB', nameB);

    await rosterToggle(pageA).click();
    await joinSalon(pageB);

    const rowB = rosterRegion(pageA).getByLabel(`Actions sur ${nameB}`);
    await expect(rowB).toBeVisible({ timeout: 10_000 });
    await rowB.click();
    await pageA.getByRole('menuitem', { name: 'Envoyer un message' }).click();

    await expect(msgPanel(pageA)).toBeVisible({ timeout: 10_000 });
    await expect(msgPanel(pageA).getByLabel(`Voir le profil de ${nameB}`)).toBeVisible({ timeout: 10_000 });

    await leaveSalon(pageB);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('MC13-E7: roster row "Bloquer" removes the target from the roster', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'blkA', 'MC13 BlkA');
    const nameB = `MC13 BlkB ${Date.now()}`;
    const pageB = await signUpFreshUi(ctxB, 'blkB', nameB);

    await rosterToggle(pageA).click();
    await joinSalon(pageB);

    const rowB = rosterRegion(pageA).getByLabel(`Actions sur ${nameB}`);
    await expect(rowB).toBeVisible({ timeout: 10_000 });
    await rowB.click();
    await pageA.getByRole('menuitem', { name: `Bloquer ${nameB}` }).click();

    const confirmDialog = pageA.getByRole('dialog', { name: `Bloquer ${nameB} ?` });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Bloquer' }).click();

    // Blocking removes the row from the viewer's roster immediately (local + lifted blockedIds).
    await expect(rosterRegion(pageA).getByText(nameB, { exact: true })).toHaveCount(0, { timeout: 10_000 });

    await leaveSalonApi(pageB); // B's page is still open in this test — a plain API call is enough
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// B) Reachable-user search — both group pickers, dmPolicy inclusion/exclusion (unaffected by the
// presence-model rework).
// ─────────────────────────────────────────────────────────────────────────────

test('MC13-E8: "Nouveau groupe" search finds a reachable non-contact (dmPolicy=anyone) and excludes a dmPolicy=contacts non-contact', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxOpen = await browser.newContext();
  const ctxClosed = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'grpA', 'MC13 GrpA');

    const tagOpen = `Mc13SearchOpen${Date.now()}`;
    const pageOpen = await signUpFreshUi(ctxOpen, 'srchopen', tagOpen);
    await setDmPolicy(pageOpen, 'anyone'); // explicit "anyone" — proves dmPolicy inclusion, not just the requests default

    const tagClosed = `Mc13SearchClosed${Date.now()}`;
    const pageClosed = await signUpFreshUi(ctxClosed, 'srchclosd', tagClosed);
    await setDmPolicy(pageClosed, 'contacts'); // non-contact + dmPolicy=contacts → MUST be excluded

    await msgFab(pageA).click();
    await pageA.getByRole('button', { name: '＋ Groupe' }).click();
    const modal = pageA.getByRole('dialog').filter({ hasText: 'Nouveau groupe' });
    await expect(modal).toBeVisible();

    await modal.getByLabel('Nom du groupe').fill(`MC13 Groupe ${Date.now()}`);
    const search = modal.getByRole('combobox', { name: 'Ajouter un·e participant·e' });

    // The dmPolicy=contacts non-contact never appears, even after the debounce settles.
    await search.fill(tagClosed);
    await pageA.waitForTimeout(500);
    await expect(modal.getByRole('option', { name: new RegExp(tagClosed) })).toHaveCount(0);
    await expect(modal.getByText('Aucun résultat')).toBeVisible();
    await search.fill('');

    // The dmPolicy=anyone non-contact IS reachable — proves this is not the /partners creator-only seam
    // (a plain reader account, no creator profile, still shows up).
    await search.fill(tagOpen);
    const option = modal.getByRole('option', { name: new RegExp(tagOpen) });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();
    await expect(modal.getByRole('button', { name: `Retirer ${tagOpen}` })).toBeVisible();

    await modal.getByRole('button', { name: 'Créer le groupe' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });
    await expect(msgPanel(pageA).getByRole('button', { name: 'Gérer le groupe' })).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxOpen.close();
    await ctxClosed.close();
  }
});

test('MC13-E9: GroupMembersPanel "Ajouter un membre" direct-adds a reachable non-contact (no invite step)', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxSeed = await browser.newContext();
  const ctxNew = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'gmpA', 'MC13 GmpA');
    const tagSeed = `Mc13GmpSeed${Date.now()}`;
    const pageSeed = await signUpFreshUi(ctxSeed, 'gmpseed', tagSeed); // default dmPolicy=requests → reachable
    void pageSeed;

    // Create a minimal group (A + seed member) first.
    await msgFab(pageA).click();
    await pageA.getByRole('button', { name: '＋ Groupe' }).click();
    const createModal = pageA.getByRole('dialog').filter({ hasText: 'Nouveau groupe' });
    await createModal.getByLabel('Nom du groupe').fill(`MC13 Gmp ${Date.now()}`);
    const createSearch = createModal.getByRole('combobox', { name: 'Ajouter un·e participant·e' });
    await createSearch.fill(tagSeed);
    const seedOption = createModal.getByRole('option', { name: new RegExp(tagSeed) });
    await expect(seedOption).toBeVisible({ timeout: 5_000 });
    await seedOption.click();
    await createModal.getByRole('button', { name: 'Créer le groupe' }).click();
    await expect(createModal).toHaveCount(0, { timeout: 10_000 });

    await msgPanel(pageA).getByRole('button', { name: 'Gérer le groupe' }).click();
    const addSearch = msgPanel(pageA).getByRole('combobox', { name: 'Ajouter un membre' });
    await expect(addSearch).toBeVisible({ timeout: 10_000 });

    const tagNew = `Mc13GmpNew${Date.now()}`;
    const pageNew = await signUpFreshUi(ctxNew, 'gmpnew', tagNew); // default dmPolicy=requests → reachable, non-contact
    void pageNew;

    await addSearch.fill(tagNew);
    const option = msgPanel(pageA).getByRole('option', { name: new RegExp(tagNew) });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // Direct add — no separate submit/invite step: the row appears in the member list right away.
    await expect(msgPanel(pageA).getByLabel(`Voir le profil de ${tagNew}`)).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxSeed.close();
    await ctxNew.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive — roster becomes an overlay/drawer on narrow widths, an in-flow column on desktop.
// Tags kept SHORT (≤10 chars): slugFrom() truncates emails to 28 chars; a long tag eats the ENTIRE
// timestamp/random uniqueness suffix, causing cross-run username collisions (a real hermeticity bug
// this suite hit before) — short tags leave enough budget for the full timestamp.
// ─────────────────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { width: 375, height: 812, label: 'mobile-375', tag: 'r13-375' },
  { width: 768, height: 1024, label: 'tablet-768', tag: 'r13-768' },
  { width: 1280, height: 900, label: 'desktop-1280', tag: 'r13-1280' },
] as const;

for (const vp of VIEWPORTS) {
  test(`MC13-E10 responsive: roster panel at ${vp.label} has no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await signUpFreshOnPage(page, vp.tag, `MC13 Resp ${vp.label}`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    await expect(rosterToggle(page)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `e2e/screenshots/mc13-roster-collapsed-${vp.label}.png` });

    await rosterToggle(page).click();
    await expect(rosterRegion(page)).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/mc13-roster-expanded-${vp.label}.png` });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1: subpixel rounding tolerance

    const box = await rosterRegion(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Short smoke: auth + nav (per the split-run convention)
// ─────────────────────────────────────────────────────────────────────────────

test('MC13 smoke: logged-in nav — home loads, Comptoir dock + roster trigger + Messages launcher all mount', async ({ page }) => {
  await signUpFreshOnPage(page, 'smoke', 'MC13 Smoke');
  await expect(salonHeader(page)).toBeVisible({ timeout: 10_000 });
  await expect(rosterToggle(page)).toBeVisible();
  await expect(msgFab(page)).toBeVisible();
});
