/**
 * F-15 — Notification & e-mail preferences — Playwright e2e suite
 *
 * Covers:
 *   FE-1  /parametres renders 5-category matrix with French group labels
 *   FE-2  Mandatory rows ("Compte & sécurité", "Modération") show "Toujours envoyé", no switch
 *   FE-3  Toggle non-mandatory in-app switch → "Préférences enregistrées." toast; reload → persists
 *   FE-4  /desabonnement?token=… → success: "Vous ne recevrez plus ces e-mails." + link to /parametres
 *   FE-5  /desabonnement: tampered/missing token → error alert
 *   FE-7  Responsive 375/768/1280 — no horizontal overflow; matrix usable at all sizes
 *   BE-3  PATCH /me/notification-preferences persists and re-reads correctly
 *   BE-4  POST /unsubscribe: valid token disables email pref; tampered → UNSUBSCRIBE_TOKEN_INVALID
 *   BE-6  Enforcement: opted-out in-app reactions → NotificationsService.create() returns null (no row)
 *         Re-enable → row IS created
 *   BE-9  Authz: GET/PATCH /me/notification-preferences require session; POST /unsubscribe is public
 *
 * Hermetic: every test creates a fresh account via signup + dev-latest verify seam.
 * Does NOT depend on .e2e-accounts.json or pre-seeded data.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { execFileSync, execSync } from 'child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

// ── .env loading ──────────────────────────────────────────────────────────────
// Load the project root .env if vars aren't already in the process env (CI injects them).
// Uses node:fs only — no dotenv dependency in apps/web.
(function loadLocalEnv(): void {
  if (process.env['JWT_SECRET'] && process.env['DATABASE_URL']) return; // already set
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, 'utf8').split('\n')) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[m[1]]) process.env[m[1]] = v; // preserve CI overrides
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();

// ── constants ─────────────────────────────────────────────────────────────────

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const PASSWORD = 'password123';
const CREATE_NOTIF_SCRIPT = join(__dirname, '../../api/prisma/e2e-create-notification-via-service.js');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Mint a signed unsubscribe token (mirrors preferences.service.ts buildUnsubscribeTokenAt). */
function mintUnsubscribeToken(accountId: string, type: string, expOffset = 90 * 24 * 3600): string {
  const secret = process.env['JWT_SECRET'] ?? process.env['UNSUBSCRIBE_SECRET'] ?? 'dev-secret-change-in-prod';
  const exp = Math.floor(Date.now() / 1000) + expOffset;
  const sig = createHmac('sha256', secret)
    .update(`${accountId}.${type}.${exp}`)
    .digest('base64url');
  const b64Id = Buffer.from(accountId).toString('base64url');
  return `${b64Id}.${type}.${exp}.${sig}`;
}

/**
 * Create a notification respecting in-app preference opt-outs.
 * Mirrors NotificationsService.create() via the e2e-create-notification-via-service.js helper.
 * Returns { created, id } — created=false means opted-out, no DB row written.
 */
function createNotificationViaService(
  recipientId: string,
  type: string,
): { created: boolean; id: string | null } {
  const out = execFileSync('node', [CREATE_NOTIF_SCRIPT, recipientId, type], {
    env: { ...process.env },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim()) as { created: boolean; id: string | null };
}

/** Unique e-mail that won't clash across re-runs. */
function freshEmail(): string {
  return `qa_f15_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

/** Slug derived from e-mail (respects 30-char limit). */
function slugFrom(email: string): string {
  return email.split('@')[0].replace(/[^a-z0-9-]/g, '-').slice(0, 28);
}

/**
 * Sign up, verify e-mail via dev-latest seam, and log in.
 * Sets the session cookie on page.request so subsequent API calls are authenticated.
 * Returns the accountId.
 */
async function signUpVerifyAndLogin(
  page: Page,
  email: string,
  displayName: string,
): Promise<{ accountId: string }> {
  const slug = slugFrom(email);

  const signupRes = await page.request.post(`${API}/auth/signup`, {
    data: { email, displayName, username: slug, password: PASSWORD, acceptCgu: true },
  });
  if (!signupRes.ok()) {
    throw new Error(`signup failed: ${signupRes.status()} ${await signupRes.text()}`);
  }

  // Wait for the verify token (dev-latest seam)
  let token: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await page.request.get(
      `${API}/auth/verify-email/dev-latest?email=${encodeURIComponent(email)}`,
    );
    if (r.ok()) {
      const body = await r.json() as { token: string };
      token = body.token;
      break;
    }
    await page.waitForTimeout(300);
  }
  if (!token) throw new Error('dev-latest verify token not found');

  const confirmRes = await page.request.post(`${API}/auth/verify-email/confirm`, {
    data: { token },
  });
  if (!confirmRes.ok()) {
    throw new Error(`email confirm failed: ${confirmRes.status()} ${await confirmRes.text()}`);
  }

  const loginRes = await page.request.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (!loginRes.ok()) {
    throw new Error(`login failed: ${loginRes.status()} ${await loginRes.text()}`);
  }

  const meRes = await page.request.get(`${API}/auth/me`);
  const me = await meRes.json() as { id: string };
  return { accountId: me.id };
}

/** Same, but using an APIRequestContext (for pure API tests without a page). */
async function signUpVerifyAndLoginApi(
  request: APIRequestContext,
  email: string,
  displayName: string,
): Promise<{ accountId: string }> {
  const slug = slugFrom(email);
  await request.post(`${API}/auth/signup`, {
    data: { email, displayName, username: slug, password: PASSWORD, acceptCgu: true },
  });

  let token: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await request.get(
      `${API}/auth/verify-email/dev-latest?email=${encodeURIComponent(email)}`,
    );
    if (r.ok()) { token = (await r.json() as { token: string }).token; break; }
    await new Promise((res) => setTimeout(res, 300));
  }
  if (!token) throw new Error('dev-latest verify token not found');
  await request.post(`${API}/auth/verify-email/confirm`, { data: { token } });
  await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  const me = await (await request.get(`${API}/auth/me`)).json() as { id: string };
  return { accountId: me.id };
}

// ── F15-E2E-1: Matrix renders with 5 categories, mandatory rows locked ────────

test('F15-E2E-1: /parametres renders 5-category matrix; mandatory rows show "Toujours envoyé"', async ({ page }) => {
  const email = freshEmail();
  await signUpVerifyAndLogin(page, email, 'F15 Matrix');

  await page.goto('/parametres');
  await expect(page.getByRole('heading', { name: /préférences de notification/i })).toBeVisible({
    timeout: 10_000,
  });

  // Preferences section locator
  const section = page.locator('details#notifications');
  await expect(section).toBeVisible({ timeout: 8_000 });

  // 5 fieldsets = 5 NOTIFICATION_TYPES
  const groups = section.getByRole('group');
  await expect(groups).toHaveCount(5, { timeout: 8_000 });

  // All 5 French category labels present
  const expectedLabels = [
    'Messages',
    'Demandes & candidatures',
    'Soutiens & réactions',
    'Compte & sécurité',
    'Modération',
  ];
  for (const label of expectedLabels) {
    await expect(section.getByRole('group', { name: label })).toBeVisible();
  }

  // Mandatory rows: "Toujours envoyé" visible, no switch
  for (const mandatory of ['Compte & sécurité', 'Modération']) {
    const fieldset = section.getByRole('group', { name: mandatory });
    await expect(fieldset.getByText(/toujours envoyé/i)).toBeVisible();
    await expect(fieldset.getByRole('switch')).toHaveCount(0);
  }

  // Non-mandatory rows: 2 switches each (Dans l'app + E-mail)
  for (const nonMandatory of ['Messages', 'Demandes & candidatures', 'Soutiens & réactions']) {
    const fieldset = section.getByRole('group', { name: nonMandatory });
    await expect(fieldset.getByRole('switch')).toHaveCount(2);
  }
});

// ── F15-E2E-2: Toggle → toast → reload → persists ────────────────────────────

test('F15-E2E-2: toggle non-mandatory switch → toast → reload → state persisted', async ({ page }) => {
  const email = freshEmail();
  await signUpVerifyAndLogin(page, email, 'F15 Toggle');

  await page.goto('/parametres');
  await expect(page.getByRole('heading', { name: /préférences de notification/i })).toBeVisible({
    timeout: 10_000,
  });

  const section = page.locator('details#notifications');
  const messagesFieldset = section.getByRole('group', { name: 'Messages' });
  await expect(messagesFieldset).toBeVisible({ timeout: 8_000 });

  // First switch = Dans l'app (starts checked = true)
  const inAppSwitch = messagesFieldset.getByRole('switch').first();
  await expect(inAppSwitch).toHaveAttribute('aria-checked', 'true');

  // Click to disable
  await inAppSwitch.click();

  // Toast confirmation
  // .first(): the copy renders twice (visible toast + aria-live announcement region)
  await expect(page.getByText(/préférences enregistrées/i).first()).toBeVisible({ timeout: 6_000 });

  // Optimistic flip applied (switch now false)
  await expect(messagesFieldset.getByRole('switch').first()).toHaveAttribute('aria-checked', 'false');

  // Reload and verify persistence
  await page.reload();
  await expect(page.getByRole('heading', { name: /préférences de notification/i })).toBeVisible({
    timeout: 10_000,
  });
  const afterSection = page.locator('details#notifications');
  await expect(
    afterSection.getByRole('group', { name: 'Messages' }).getByRole('switch').first(),
  ).toHaveAttribute('aria-checked', 'false', { timeout: 8_000 });
});

// ── F15-E2E-3: Enforcement proof — in-app opt-out blocks notification creation ─

test('F15-E2E-3: enforcement: disable reactions in-app → like NOT created; re-enable → IS created', async ({ page }) => {
  const email = freshEmail();
  const { accountId } = await signUpVerifyAndLogin(page, email, 'F15 Enforcement');

  // 1. Disable in-app for 'reactions' (maps to NotifType 'like')
  const disableRes = await page.request.patch(`${API}/me/notification-preferences`, {
    data: { changes: [{ type: 'reactions', channel: 'in_app', enabled: false }] },
  });
  expect(disableRes.status()).toBe(200);

  // 2. Attempt to create a 'like' notification via the service seam (mirrors NotificationsService.create())
  const result1 = createNotificationViaService(accountId, 'like');
  expect(result1.created).toBe(false);
  expect(result1.id).toBeNull();

  // 3. Verify no notification row exists via the API
  const listRes1 = await page.request.get(`${API}/notifications`);
  expect(listRes1.status()).toBe(200);
  const list1 = await listRes1.json() as unknown[];
  expect(list1).toHaveLength(0);

  // 4. Re-enable
  const enableRes = await page.request.patch(`${API}/me/notification-preferences`, {
    data: { changes: [{ type: 'reactions', channel: 'in_app', enabled: true }] },
  });
  expect(enableRes.status()).toBe(200);

  // 5. Now creation succeeds
  const result2 = createNotificationViaService(accountId, 'like');
  expect(result2.created).toBe(true);
  expect(typeof result2.id).toBe('string');

  // 6. Notification row is present via the API
  const listRes2 = await page.request.get(`${API}/notifications`);
  expect(listRes2.status()).toBe(200);
  const list2 = await listRes2.json() as Array<{ type: string }>;
  expect(list2).toHaveLength(1);
  expect(list2[0].type).toBe('like');
});

// ── F15-E2E-4: Unsubscribe — valid token → success page + pref disabled ───────

test('F15-E2E-4: unsubscribe valid token → "Vous ne recevrez plus ces e-mails." + pref off', async ({ page }) => {
  const email = freshEmail();
  const { accountId } = await signUpVerifyAndLogin(page, email, 'F15 Unsub');

  // Mint a valid token for 'messages' email channel
  const token = mintUnsubscribeToken(accountId, 'messages');

  // Navigate to the unsubscribe landing page (public — no auth required)
  await page.goto(`/desabonnement?token=${encodeURIComponent(token)}`);

  // Success state
  await expect(page.getByText(/vous ne recevrez plus ces e-mails/i)).toBeVisible({ timeout: 10_000 });

  // Link to /parametres present
  await expect(page.getByRole('link', { name: /gérer mes préférences/i })).toBeVisible();

  // Verify the email pref for 'messages' is now false (account still has session cookie)
  const prefRes = await page.request.get(`${API}/me/notification-preferences`);
  expect(prefRes.status()).toBe(200);
  const prefs = await prefRes.json() as { preferences: Array<{ type: string; email: boolean }> };
  const messagesRow = prefs.preferences.find((r) => r.type === 'messages');
  expect(messagesRow).toBeDefined();
  expect(messagesRow?.email).toBe(false);
});

// ── F15-E2E-5: Unsubscribe — invalid/missing token → error state ──────────────

test('F15-E2E-5a: unsubscribe tampered token → error alert, no success message', async ({ page }) => {
  await page.goto('/desabonnement?token=tampered-token-xyz-abc');

  await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/vous ne recevrez plus ces e-mails/i)).not.toBeVisible();
});

test('F15-E2E-5b: unsubscribe missing token → error alert without API call', async ({ page }) => {
  await page.goto('/desabonnement');

  await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/vous ne recevrez plus ces e-mails/i)).not.toBeVisible();
});

// ── F15-E2E-6: Authz — unauthenticated GET/PATCH → 401; POST /unsubscribe public ─

test('F15-E2E-6: GET /me/notification-preferences requires auth (401 unauth)', async ({ request }) => {
  const res = await request.get(`${API}/me/notification-preferences`);
  expect(res.status()).toBe(401);
});

test('F15-E2E-6b: PATCH /me/notification-preferences requires auth (401 unauth)', async ({ request }) => {
  const res = await request.patch(`${API}/me/notification-preferences`, {
    data: { changes: [{ type: 'messages', channel: 'in_app', enabled: false }] },
  });
  expect(res.status()).toBe(401);
});

test('F15-E2E-6c: POST /unsubscribe is public (no session required; bad token → 400 not 401)', async ({ request }) => {
  const res = await request.post(`${API}/unsubscribe`, {
    data: { token: 'bad-token' },
  });
  // 400 = invalid token (endpoint is reachable without auth); 401 would mean it's gated
  expect(res.status()).toBe(400);
});

// ── F15-E2E-7: BE-7 — mandatory pref cannot be patched (400 PREFERENCE_MANDATORY) ─

test('F15-E2E-7: PATCH mandatory category (account) → 400 PREFERENCE_MANDATORY', async ({ page }) => {
  const email = freshEmail();
  await signUpVerifyAndLogin(page, email, 'F15 Mandatory');

  const res = await page.request.patch(`${API}/me/notification-preferences`, {
    data: { changes: [{ type: 'account', channel: 'email', enabled: false }] },
  });
  expect(res.status()).toBe(400);
  const body = await res.json() as { error: string };
  expect(body.error).toBe('PREFERENCE_MANDATORY');
});

// ── F15-E2E-8: Responsive spot-checks ────────────────────────────────────────

test('F15-E2E-8a: responsive 375px — no horizontal overflow; matrix visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const email = freshEmail();
  await signUpVerifyAndLogin(page, email, 'F15 Mobile');

  await page.goto('/parametres');
  await expect(page.getByRole('heading', { name: /préférences de notification/i })).toBeVisible({
    timeout: 10_000,
  });

  // No horizontal scroll
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375 + 2); // allow 2px scrollbar

  // Matrix is still present
  const section = page.locator('details#notifications');
  await expect(section).toBeVisible();
  await expect(section.getByRole('group').first()).toBeVisible();

  // Screenshot for evidence
  await page.screenshot({
    path: 'test-results/f15-375.png', // relative, gitignored — never an absolute local path (breaks CI)
  });
});

test('F15-E2E-8b: responsive 768px — no horizontal overflow; matrix usable', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const email = freshEmail();
  await signUpVerifyAndLogin(page, email, 'F15 Tablet');

  await page.goto('/parametres');
  await expect(page.getByRole('heading', { name: /préférences de notification/i })).toBeVisible({
    timeout: 10_000,
  });

  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(768 + 2);

  const section = page.locator('details#notifications');
  await expect(section.getByRole('group').first()).toBeVisible();

  await page.screenshot({
    path: 'test-results/f15-768.png', // relative, gitignored — never an absolute local path (breaks CI)
  });
});

test('F15-E2E-8c: responsive 1280px — desktop; no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const email = freshEmail();
  await signUpVerifyAndLogin(page, email, 'F15 Desktop');

  await page.goto('/parametres');
  await expect(page.getByRole('heading', { name: /préférences de notification/i })).toBeVisible({
    timeout: 10_000,
  });

  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(1280 + 2);

  const section = page.locator('details#notifications');
  await expect(section.getByRole('group').first()).toBeVisible();

  await page.screenshot({
    path: 'test-results/f15-1280.png', // relative, gitignored — never an absolute local path (breaks CI)
  });
});
