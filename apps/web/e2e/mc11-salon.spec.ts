/**
 * MC-11 — Community salon "Le Comptoir" (dock widget) — Playwright e2e suite.
 *
 * The salon is a single GLOBAL room (one Conversation, all authenticated users previewers).
 * Unlike MC-9's per-pair DMs, its history accumulates across runs/specs — assertions use
 * unique per-test message bodies and relative (before/after) counts rather than absolute
 * totals, per the plan's guidance.
 *
 * Hermetic: each test signs up its own fresh account (API signup + dev-latest verify seam),
 * same pattern as settings.spec.ts / security.spec.ts — no shared fixture accounts to contend
 * with the global room's state across parallel spec files.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const PASSWORD = 'password123';

function freshEmail(tag = 'mc11'): string {
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

/** Login via the UI form (needed when a browser context — not page.request — must carry the session). */
async function loginUi(page: Page, email: string): Promise<void> {
  // An authenticated visit to /connexion redirects home (the GuestOnly guard), so the form never
  // renders and .fill() hangs. Clear the session first: this helper's contract is "this context ends
  // up signed in as <email>", and a pre-existing session — possibly a DIFFERENT user — must not win.
  await page.context().clearCookies();
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

const salonHeader = (page: Page) => page.getByRole('button', { name: /Le Comptoir/ });
const salonFeed = (page: Page) => page.getByRole('log', { name: 'Le Comptoir' });
const msgFab = (page: Page) => page.getByRole('button', { name: /^Messages/ });

async function signUpFreshUi(context: BrowserContext, tag: string, name: string): Promise<Page> {
  const page = await context.newPage();
  const email = freshEmail(tag);
  await signUpVerifyAndLogin(page, email, name);
  await loginUi(page, email);
  return page;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mounting + non-member preview
// ─────────────────────────────────────────────────────────────────────────────

test('MC11-E1: dock mounts bottom-left on the home page AND a second page; Messages widget stays bottom-right', async ({
  page,
}) => {
  const email = freshEmail('mount');
  await signUpVerifyAndLogin(page, email, 'MC11 Mount');
  await loginUi(page, email);

  await expect(salonHeader(page)).toBeVisible({ timeout: 10_000 });
  let box = await salonHeader(page).boundingBox();
  expect(box).not.toBeNull();
  // Bottom-left: dock's left edge is near the viewport's left edge, well clear of center.
  expect(box!.x).toBeLessThan(60);

  // Messages widget launcher is bottom-RIGHT — the two never occupy the same corner.
  await expect(msgFab(page)).toBeVisible();
  const fabBox = await msgFab(page).boundingBox();
  expect(fabBox).not.toBeNull();
  expect(fabBox!.x).toBeGreaterThan(box!.x + box!.width);

  // Mounts on a second page too (not a one-off on /).
  await page.goto('/decouvrir');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(salonHeader(page)).toBeVisible();
  box = await salonHeader(page).boundingBox();
  expect(box!.x).toBeLessThan(60);
});

test('MC11-E2: non-member preview — expand shows history (no join needed), no composer, exact join-panel copy', async ({
  page,
}) => {
  const email = freshEmail('preview');
  await signUpVerifyAndLogin(page, email, 'MC11 Preview');
  await loginUi(page, email);

  await salonHeader(page).click();
  await expect(salonHeader(page)).toHaveAttribute('aria-expanded', 'true');

  // Feed is readable without joining (public preview) — the log region renders.
  await expect(salonFeed(page)).toBeVisible({ timeout: 10_000 });

  // No composer for a non-member.
  await expect(page.getByRole('combobox', { name: 'Votre message' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Envoyer' })).toHaveCount(0);

  // Exact verbatim join-panel copy + accent button.
  await expect(
    page.getByText(/Rejoignez\s*Le Comptoir\s*pour discuter avec la communauté\./),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '＋ Rejoindre le salon' })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Join → send → Quitter (member lifecycle)
// ─────────────────────────────────────────────────────────────────────────────

test('MC11-E3: join → send a message → the bubble is mine (right-aligned, no label, D-7); Quitter returns to the join panel and posting 403s', async ({
  page,
  request,
}) => {
  const email = freshEmail('join');
  await signUpVerifyAndLogin(page, email, 'MC11 Joiner');
  await loginUi(page, email);

  await salonHeader(page).click();
  await page.getByRole('button', { name: '＋ Rejoindre le salon' }).click();

  const composer = page.getByRole('combobox', { name: 'Votre message' });
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const uniqueBody = `Bonjour le comptoir ${Date.now()}`;
  await composer.fill(uniqueBody);
  await page.getByRole('button', { name: 'Envoyer' }).click();

  await expect(salonFeed(page).getByText(uniqueBody)).toBeVisible({ timeout: 10_000 });
  // MC-15 R2-A / D-7 (2026-08-02, user-approved): own salon messages align RIGHT with the ink fill
  // and carry NO sender label — the side already says whose they are. This test used to assert the
  // opposite ("bubble appears with own display name"), which was the prototype's uniform bubble.
  // The label now belongs to INCOMING messages only; do not restore it here.
  const ownRow = page.locator('[data-message-id]').filter({ hasText: uniqueBody }).first();
  await expect(ownRow).toHaveAttribute('data-mine', 'true');
  await expect(ownRow).toHaveCSS('align-self', 'flex-end');
  await expect(ownRow).not.toContainText('MC11 Joiner');

  // Quitter → back to the non-member join panel.
  await page.getByRole('button', { name: 'Quitter', exact: true }).click();
  await expect(page.getByRole('button', { name: '＋ Rejoindre le salon' })).toBeVisible({ timeout: 5_000 });
  await expect(composer).toHaveCount(0);

  // Posting via the API is now 403 for this non-member (server-side gate, not just UI).
  const loginRes = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(loginRes.ok()).toBe(true);
  const postRes = await request.post(`${API}/salon/messages`, { data: { body: 'should be rejected' } });
  expect(postRes.status()).toBe(403);
});

// ─────────────────────────────────────────────────────────────────────────────
// Realtime across two browser contexts + presence
// ─────────────────────────────────────────────────────────────────────────────

test('MC11-E4: realtime — B (previewer) sees A message live; A collapsed unread pill bumps on B post and clears on expand; presence >= 2', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'rtA', 'MC11 RtA');
    const pageB = await signUpFreshUi(ctxB, 'rtB', 'MC11 RtB');

    // A joins so the message it sends can be posted; B never joins (previewer).
    await salonHeader(pageA).click();
    await pageA.getByRole('button', { name: '＋ Rejoindre le salon' }).click();
    await expect(pageA.getByRole('combobox', { name: 'Votre message' })).toBeVisible({ timeout: 5_000 });

    // B connects (opens the dock so its socket is live and history is loaded) then collapses.
    await salonHeader(pageB).click();
    await expect(salonFeed(pageB)).toBeVisible({ timeout: 10_000 });

    // Presence: both sockets connected to the room → "en ligne" >= 2 for both.
    await expect(async () => {
      const text = await pageA.locator('.ep-salon-dock').getByText(/en ligne/).innerText();
      const match = text.match(/(\d+)\s*en ligne/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 10_000 });

    // B collapses the dock (unread must still count while collapsed).
    await salonHeader(pageB).click();
    await expect(salonHeader(pageB)).toHaveAttribute('aria-expanded', 'false');

    const uniqueBody = `Live message from A ${Date.now()}`;
    const composerA = pageA.getByRole('combobox', { name: 'Votre message' });
    await composerA.fill(uniqueBody);
    await pageA.getByRole('button', { name: 'Envoyer' }).click();
    await expect(salonFeed(pageA).getByText(uniqueBody)).toBeVisible({ timeout: 10_000 });

    // B never reloaded — the collapsed header's unread badge/pill must bump live.
    await expect(salonHeader(pageB)).toHaveAttribute('data-unread', 'yes', { timeout: 10_000 });
    await expect(pageB.getByText(/nouveau/)).toBeVisible();

    // Expanding B clears the unread indicator.
    await salonHeader(pageB).click();
    await expect(salonHeader(pageB)).toHaveAttribute('data-unread', 'no', { timeout: 5_000 });
    await expect(salonFeed(pageB).getByText(uniqueBody)).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @-mention autocomplete
// ─────────────────────────────────────────────────────────────────────────────

test('MC11-E5: "@" opens a listbox of other online users; selecting inserts the mention into the draft', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await signUpFreshUi(ctxA, 'mentA', 'MC11 MentA');
    const pageB = await signUpFreshUi(ctxB, 'mentB', 'MC11 MentB');

    // A joins (needs the composer). B just previews — opening its dock puts it "online" in the room.
    await salonHeader(pageA).click();
    await pageA.getByRole('button', { name: '＋ Rejoindre le salon' }).click();
    const composerA = pageA.getByRole('combobox', { name: 'Votre message' });
    await expect(composerA).toBeVisible({ timeout: 5_000 });

    await salonHeader(pageB).click();
    await expect(salonFeed(pageB)).toBeVisible({ timeout: 10_000 });

    await composerA.click();
    await composerA.pressSequentially('@Ment');
    const listbox = pageA.locator('#salon-mention-listbox');
    await expect(listbox).toBeVisible({ timeout: 10_000 });
    await expect(listbox.getByRole('option', { name: 'MC11 MentB' })).toBeVisible({ timeout: 10_000 });

    await pageA.keyboard.press('Enter');
    await expect(composerA).toHaveValue('@MC11 MentB ');
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive — dock must not collide with the MC-9 launcher
// ─────────────────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { width: 375, height: 812, label: 'mobile-375' },
  { width: 768, height: 1024, label: 'tablet-768' },
  { width: 1280, height: 900, label: 'desktop-1280' },
] as const;

for (const vp of VIEWPORTS) {
  test(`MC11-E6 responsive: dock at ${vp.label} does not overlap the Messages launcher; header tap target >= 44px`, async ({
    page,
  }) => {
    const email = freshEmail(`resp${vp.width}`);
    await signUpVerifyAndLogin(page, email, 'MC11 Responsive');
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loginUi(page, email);

    await expect(salonHeader(page)).toBeVisible({ timeout: 10_000 });
    const dockBox = await salonHeader(page).boundingBox();
    const fabBox = await msgFab(page).boundingBox();
    expect(dockBox).not.toBeNull();
    expect(fabBox).not.toBeNull();

    // No horizontal overlap between the two fixed bottom widgets.
    const dockRight = dockBox!.x + dockBox!.width;
    expect(dockRight).toBeLessThanOrEqual(fabBox!.x + 1);

    // No page-level horizontal overflow either.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // Collapsed header stays tappable.
    expect(dockBox!.height).toBeGreaterThanOrEqual(44);

    if (vp.width === 375) {
      await page.screenshot({ path: 'e2e/screenshots/mc11-salon-375.png' });
    }
  });
}
