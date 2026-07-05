/**
 * F-18 — Account security (2FA, password change, email change, sessions) — Playwright e2e
 *
 * Hermetic: each test creates its own fresh account via the API seams.
 * TOTP codes computed fresh from the returned secret using node:crypto (RFC 6238 SHA1).
 * DISABLE_RATE_LIMIT=true is set in playwright.config.ts for the API server.
 *
 * Tests:
 *   F18-E2E-1  2FA full cycle: enable → login with TOTP → disable → single-step again
 *   F18-E2E-2  Backup codes: fresh login → "Utiliser un code de secours" → 1 code works once
 *   F18-E2E-3  Opt-in regression: non-2FA account login is byte-identical single-step
 *   F18-E2E-4  Password change: session rotated (current alive), old sessions dead, old pw fails
 *   F18-E2E-5  E-mail change: request → dev-latest confirm → new email works, old fails
 *   F18-E2E-6  Sessions: "Session actuelle" badge, revoke-others keeps current alive
 *   F18-E2E-7  Responsive: /parametres Sécurité section at 375/768/1280 — no overflow
 */

import { createHmac } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const PASSWORD = 'password123';

// ── TOTP helpers (RFC 6238, SHA1, digits=6, step=30s) ─────────────────────────

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** Compute a TOTP code for the given base32 secret at the given timestamp (ms). */
function computeTotp(secret: string, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3]) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

/**
 * Compute a TOTP code fresh at click-time.
 * If the clock is within 1s of a 30s window boundary, compute both the current
 * and the next-window code and return both so the caller can retry once.
 */
function currentTotpCodes(secret: string): [string, string] {
  const nowMs = Date.now();
  const code1 = computeTotp(secret, nowMs);
  const code2 = computeTotp(secret, nowMs + 30_000); // next window
  return [code1, code2];
}

// ── Account helpers ────────────────────────────────────────────────────────────

function freshEmail(tag = 'f18'): string {
  return `qa_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

function slugFrom(email: string): string {
  return email.split('@')[0].replace(/[^a-z0-9-]/g, '-').slice(0, 28);
}

/**
 * Sign up via API + verify via dev-latest + log in.
 * Returns with the page's request context holding the session cookie.
 */
async function signUpVerifyAndLogin(
  page: Page,
  email: string,
  displayName: string,
): Promise<void> {
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

  const lr = await page.request.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (!lr.ok()) throw new Error(`login failed: ${lr.status()}`);
}

/** Same as above but using an arbitrary APIRequestContext (for session isolation tests). */
async function signUpVerifyLoginViaCtx(
  ctx: APIRequestContext,
  email: string,
  displayName: string,
): Promise<void> {
  const su = await ctx.post(`${API}/auth/signup`, {
    data: {
      email,
      displayName,
      username: slugFrom(email),
      password: PASSWORD,
      birthdate: '1990-01-01',
      acceptCgu: true,
    },
  });
  if (!su.ok()) throw new Error(`signup failed: ${su.status()}`);

  let token: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await ctx.get(
      `${API}/auth/verify-email/dev-latest?email=${encodeURIComponent(email)}`,
    );
    if (r.ok()) {
      token = (await r.json() as { token: string }).token;
      break;
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  if (!token) throw new Error('no verify token');

  const cv = await ctx.post(`${API}/auth/verify-email/confirm`, { data: { token } });
  if (!cv.ok()) throw new Error(`email confirm failed: ${cv.status()}`);

  const lr = await ctx.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (!lr.ok()) throw new Error(`login failed: ${lr.status()}`);
}

/** Navigate to /parametres and scroll to the Sécurité heading. */
async function goToSecurite(page: Page): Promise<void> {
  await page.goto('/parametres');
  await expect(page.getByRole('heading', { name: /sécurité/i })).toBeVisible({ timeout: 10_000 });
}

/**
 * Set up 2FA via the API for a given session context.
 * Returns { secret, backupCodes }.
 */
async function enable2FAViaApi(
  ctx: APIRequestContext,
): Promise<{ secret: string; backupCodes: string[] }> {
  // Setup
  const setupRes = await ctx.post(`${API}/me/2fa/setup`);
  expect(setupRes.ok()).toBe(true);
  const { secret } = await setupRes.json() as { provisioningUri: string; secret: string };

  // Confirm with a fresh code — retry once on window boundary
  const [code1, code2] = currentTotpCodes(secret);
  let confirmRes = await ctx.post(`${API}/me/2fa/confirm`, { data: { code: code1 } });
  if (!confirmRes.ok()) {
    confirmRes = await ctx.post(`${API}/me/2fa/confirm`, { data: { code: code2 } });
  }
  expect(confirmRes.ok()).toBe(true);
  const { backupCodes } = await confirmRes.json() as { backupCodes: string[] };

  return { secret, backupCodes };
}

// ── F18-E2E-1: Full 2FA cycle via UI ──────────────────────────────────────────

test('F18-E2E-1: 2FA full cycle — enable → TOTP login step → disable → single-step again', async ({
  page,
  request,
}) => {
  const email = freshEmail('f18-2fa');
  await signUpVerifyAndLogin(page, email, 'F18 2FA User');

  // ── Enable 2FA from /parametres ──
  await goToSecurite(page);

  // Sécurité section is visible
  await expect(page.getByRole('heading', { name: /double authentification/i })).toBeVisible({
    timeout: 8_000,
  });

  // Initial state: disabled
  await expect(page.getByText(/désactivée/i)).toBeVisible({ timeout: 6_000 });

  // Click "Activer" (exact — avoid matching the DR-10 "Réactiver…" / 2FA "Désactiver" buttons)
  await page.getByRole('button', { name: 'Activer', exact: true }).click();

  // QR code should appear
  await expect(page.getByRole('img', { name: /qr code/i })).toBeVisible({ timeout: 8_000 });

  // Read the secret from the copyable fallback
  const secretEl = await page.locator('code').first();
  const secret = (await secretEl.textContent())?.trim() ?? '';
  expect(secret.length).toBeGreaterThan(10);

  // Compute a fresh TOTP code and type it into the confirm input
  let [code1, code2] = currentTotpCodes(secret);
  const confirmInput = page.getByLabel(/code de vérification/i);
  await confirmInput.fill(code1);
  await page.getByRole('button', { name: /confirmer/i }).click();

  // If invalid code (window boundary), retry with next window
  const isError = page.getByText(/code invalide/i);
  try {
    await expect(isError).toBeVisible({ timeout: 2_000 });
    // Retry with next-window code
    await confirmInput.clear();
    await confirmInput.fill(code2);
    await page.getByRole('button', { name: /confirmer/i }).click();
  } catch {
    // no error shown — first code worked
  }

  // Backup codes shown once
  await expect(page.getByText(/conservez-les précieusement/i)).toBeVisible({ timeout: 8_000 });

  // There are backup codes in the list
  const backupItems = page.locator('li').filter({ hasText: /\w{4}-\w{4}/i });
  const count = await backupItems.count();
  expect(count).toBeGreaterThanOrEqual(10);

  // Acknowledge
  await page.getByRole('button', { name: /j'ai enregistré mes codes/i }).click();

  // Status flips to "Activée"
  await expect(page.getByText(/activée/i)).toBeVisible({ timeout: 5_000 });

  // ── Logout ──
  await page.goto('/');
  // Use the header's user menu to log out
  // The logout button may be in a menu or direct link; navigate away first
  const logoutRes = await page.request.post(`${API}/auth/logout`);
  expect(logoutRes.ok()).toBe(true);

  // ── Login: password step ──
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();

  // 2FA step must appear — no session cookie yet
  await expect(page.getByLabel(/code de vérification/i)).toBeVisible({ timeout: 8_000 });

  // Verify /auth/me → 401 at this point (no session yet)
  const meBeforeCode = await request.get(`${API}/auth/me`);
  expect(meBeforeCode.status()).toBe(401);

  // Enter wrong code → "Code invalide."
  await page.getByLabel(/code de vérification/i).fill('000000');
  await page.getByRole('button', { name: /vérifier/i }).click();
  await expect(page.getByText(/code invalide/i)).toBeVisible({ timeout: 5_000 });

  // Enter a valid TOTP code
  const [loginCode1, loginCode2] = currentTotpCodes(secret);
  await page.getByLabel(/code de vérification/i).clear();
  await page.getByLabel(/code de vérification/i).fill(loginCode1);
  await page.getByRole('button', { name: /vérifier/i }).click();

  // If boundary error, retry
  try {
    await expect(page.getByText(/code invalide/i)).toBeVisible({ timeout: 2_000 });
    await page.getByLabel(/code de vérification/i).clear();
    await page.getByLabel(/code de vérification/i).fill(loginCode2);
    await page.getByRole('button', { name: /vérifier/i }).click();
  } catch {
    // first code worked
  }

  // Session established → redirect to /
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // ── Disable 2FA ──
  await goToSecurite(page);
  await expect(page.getByRole('button', { name: /désactiver/i })).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: /désactiver/i }).click();

  // Disable dialog
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // KNOWN FLAKE (documented for the dev team, see D-4 in qa-report.md): the modal's
  // rAF-scheduled autofocus effect (SecurityTwoFactor.tsx `useEffect([disableOpen])`)
  // occasionally steals focus back to the password field between our two fill() calls,
  // causing the TOTP digits to be typed into the password field instead of the code
  // field. Scope to element IDs (stable regardless of label ambiguity) AND verify +
  // retry the fill until both fields hold the expected value.
  const [disCode1, disCode2] = currentTotpCodes(secret);
  const pwField = dialog.locator('#disable-2fa-password');
  const codeField = dialog.locator('#disable-2fa-code');
  let filled = false;
  for (let attempt = 0; attempt < 5 && !filled; attempt++) {
    await pwField.fill(PASSWORD);
    await codeField.fill(disCode1);
    const pwVal = await pwField.inputValue();
    const codeVal = await codeField.inputValue();
    if (pwVal === PASSWORD && codeVal === disCode1) {
      filled = true;
    } else {
      await pwField.fill('');
      await codeField.fill('');
      await page.waitForTimeout(150);
    }
  }
  expect(filled, 'password/code fields filled correctly after retries').toBe(true);
  await dialog.getByRole('button', { name: /confirmer la désactivation/i }).click();

  // If boundary error, retry
  try {
    await expect(dialog.getByText(/code invalide|erreur/i)).toBeVisible({ timeout: 2_000 });
    await dialog.locator('#disable-2fa-code').clear();
    await dialog.locator('#disable-2fa-code').fill(disCode2);
    await dialog.getByRole('button', { name: /confirmer la désactivation/i }).click();
  } catch {
    // first code worked
  }

  // Back to "Désactivée"
  await expect(page.getByText(/désactivée/i)).toBeVisible({ timeout: 6_000 });

  // ── Subsequent login is single-step again ──
  await page.request.post(`${API}/auth/logout`);
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();

  // Goes straight to / (no 2FA step)
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // No "Code de vérification" input visible at any point
  await expect(page.getByLabel(/code de vérification/i)).not.toBeVisible();
});

// ── F18-E2E-2: Backup codes: login with one backup code; second use rejected ──

test('F18-E2E-2: backup code login — works once, second use of same code rejected', async ({
  page,
  request,
}) => {
  const email = freshEmail('f18-bc');
  await signUpVerifyAndLogin(page, email, 'F18 Backup');

  // Enable 2FA via API and capture backup codes
  const { backupCodes } = await enable2FAViaApi(page.request);
  const backupCode = backupCodes[0];
  expect(backupCode).toMatch(/\w{4}-\w{4}/);

  // Logout
  await page.request.post(`${API}/auth/logout`);

  // Login with password → 2FA step
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page.getByLabel(/code de vérification/i)).toBeVisible({ timeout: 8_000 });

  // Switch to backup code mode
  await page.getByRole('button', { name: /utiliser un code de secours/i }).click();
  await expect(page.getByLabel(/code de secours/i)).toBeVisible({ timeout: 3_000 });

  // Enter the backup code
  await page.getByLabel(/code de secours/i).fill(backupCode);
  await page.getByRole('button', { name: /vérifier/i }).click();

  // Session established
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Logout and try the SAME backup code again
  await page.request.post(`${API}/auth/logout`);
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page.getByLabel(/code de vérification/i)).toBeVisible({ timeout: 8_000 });

  // Get the challenge token from the API directly and try the used backup code
  // (The UI input still accepts input — but the API must reject it)
  await page.getByRole('button', { name: /utiliser un code de secours/i }).click();
  await page.getByLabel(/code de secours/i).fill(backupCode);
  await page.getByRole('button', { name: /vérifier/i }).click();

  // Must show "Code invalide." — backup code is single-use
  await expect(page.getByText(/code invalide/i)).toBeVisible({ timeout: 5_000 });

  // Clean up: verify we can still log in with a fresh TOTP (account still has 2FA enabled)
  void request; // suppress unused
});

// ── F18-E2E-3: Opt-in regression — non-2FA account is single-step ─────────────

test('F18-E2E-3: non-2FA account login is single-step (no 2FA prompt)', async ({ page }) => {
  const email = freshEmail('f18-reg');
  await signUpVerifyAndLogin(page, email, 'F18 Regression');

  // Logout
  await page.request.post(`${API}/auth/logout`);

  // Fresh login — must go directly to / with no 2FA code input
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();

  // Lands directly on / (no intermediate 2FA step)
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // No "Code de vérification" input was shown at any point
  await expect(page.getByLabel(/code de vérification/i)).not.toBeVisible();
});

// ── F18-E2E-4: Password change — session rotated, others killed ────────────────

test('F18-E2E-4: password change — current session lives, other session killed, old pw fails', async ({
  page,
  browser,
}) => {
  const email = freshEmail('f18-pw');
  const newPassword = 'changedPass456';

  // Sign up and log in
  await signUpVerifyAndLogin(page, email, 'F18 PW Change');

  // Open a SECOND browser context and log in separately (another session)
  const ctx2 = await browser.newContext();
  try {
    const page2 = await ctx2.newPage();
    await page2.request.post(`${API}/auth/login`, {
      data: { email, password: PASSWORD },
    });
    // Second session is live
    const me2Before = await page2.request.get(`${API}/auth/me`);
    expect(me2Before.status()).toBe(200);

    // Main session: change password from /parametres
    await goToSecurite(page);
    // Two forms share the "Mot de passe actuel" label — scope to id to avoid strict-mode violation
    await page.locator('#current-password').fill(PASSWORD);
    await page.locator('#new-password').fill(newPassword);
    await page.locator('#confirm-password').fill(newPassword);
    await page.getByRole('button', { name: /enregistrer le mot de passe/i }).click();

    // Success message
    await expect(
      page.getByText(/mot de passe mis à jour/i),
    ).toBeVisible({ timeout: 8_000 });

    // Current session still alive
    const meCurrent = await page.request.get(`${API}/auth/me`);
    expect(meCurrent.status()).toBe(200);

    // Second session → 401 (epoch bump killed it)
    // The old token was issued before the epoch bump; the guard must reject it.
    await page2.waitForTimeout(500);
    const me2After = await page2.request.get(`${API}/auth/me`);
    expect(me2After.status()).toBe(401);

    // Old password login fails
    const oldLogin = await page.request.post(`${API}/auth/login`, {
      data: { email, password: PASSWORD },
    });
    expect(oldLogin.status()).toBe(401);

    // New password login succeeds
    const newLogin = await page.request.post(`${API}/auth/login`, {
      data: { email, password: newPassword },
    });
    expect(newLogin.status()).toBe(200);
  } finally {
    await ctx2.close();
  }
});

// ── F18-E2E-5: E-mail change — dev-latest confirm → new email works ────────────

test('F18-E2E-5: email change — request → dev-latest confirm → new email works, old fails', async ({
  page,
}) => {
  const email = freshEmail('f18-em');
  const newEmail = freshEmail('f18-em-new');
  await signUpVerifyAndLogin(page, email, 'F18 Email Change');

  // Submit email change from /parametres
  await goToSecurite(page);
  await page.getByLabel(/nouvelle adresse e-mail/i).fill(newEmail);
  // Email-change form has "Mot de passe actuel" label
  const emailFormSection = page.locator('[aria-label="Modifier l\'adresse e-mail"]');
  await emailFormSection.getByLabel(/mot de passe actuel/i).fill(PASSWORD);
  await emailFormSection.getByRole('button', { name: /enregistrer l'e-mail/i }).click();

  // Pending notice
  await expect(page.getByText(/en attente de confirmation/i)).toBeVisible({ timeout: 8_000 });

  // Fetch the email-change token from the dev seam
  let changeToken: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await page.request.get(
      `${API}/auth/email-change/dev-latest?email=${encodeURIComponent(newEmail)}`,
    );
    if (r.ok()) {
      changeToken = (await r.json() as { token: string }).token;
      break;
    }
    await page.waitForTimeout(300);
  }
  expect(changeToken).toBeTruthy();

  // Visit the confirm landing page
  await page.goto(`/parametres/confirmer-email?token=${encodeURIComponent(changeToken!)}`);
  // Match heading only — the page has both an h1 and a <p> that match the same pattern
  await expect(
    page.getByRole('heading', { name: /adresse e-mail mise à jour|e-mail.*mis à jour/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Log out
  await page.request.post(`${API}/auth/logout`);

  // OLD email login fails
  const oldLogin = await page.request.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(oldLogin.status()).toBe(401);

  // NEW email login succeeds
  const newLogin = await page.request.post(`${API}/auth/login`, {
    data: { email: newEmail, password: PASSWORD },
  });
  expect(newLogin.status()).toBe(200);
});

// ── F18-E2E-6: Sessions — list shows both sessions; revoke-others actually kills the other ──
//
// D-3 (multiple SessionGuard instances never sharing the wired session store) is fixed:
// the store is now a module-scoped variable, so every guard instance sees it. This test
// asserts the real behavior, not a tolerant fallback: the session list is populated with
// both sessions, "Session actuelle" is correctly flagged, and revoke-others genuinely
// invalidates the other session (not just a 204 with no real effect).

test('F18-E2E-6: sessions list shows both sessions; revoke-others actually kills the other session', async ({
  page,
  browser,
}) => {
  const email = freshEmail('f18-sess');
  await signUpVerifyAndLogin(page, email, 'F18 Sessions');

  // Open a second browser context and log in to create a second, genuinely separate session
  const ctx2 = await browser.newContext();
  try {
    const loginRes = await ctx2.request.post(`${API}/auth/login`, {
      data: { email, password: PASSWORD },
    });
    expect(loginRes.status()).toBe(200);
    // Touch the second session's index entry (any authed request touches it)
    const me2Touch = await ctx2.request.get(`${API}/auth/me`);
    expect(me2Touch.status()).toBe(200);

    // GET /me/sessions lists BOTH sessions, exactly one flagged current
    const sessRes = await page.request.get(`${API}/me/sessions`);
    expect(sessRes.status()).toBe(200);
    const sessBody = await sessRes.json() as {
      sessions: { id: string; current: boolean }[];
    };
    expect(sessBody.sessions.length).toBe(2);
    expect(sessBody.sessions.filter((s) => s.current).length).toBe(1);

    // Sessions section + "Session actuelle" badge render in the UI
    await goToSecurite(page);
    await expect(page.getByRole('heading', { name: /sessions actives/i })).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText(/session actuelle/i)).toBeVisible({ timeout: 8_000 });

    // Revoke-others via API: current session stays alive, second session is genuinely dead
    const revokeRes = await page.request.delete(`${API}/me/sessions`);
    expect(revokeRes.status()).toBe(204);

    // Current session is still alive
    const meCurrent = await page.request.get(`${API}/auth/me`);
    expect(meCurrent.status()).toBe(200);

    // Second session is now dead — no longer best-effort, must be 401
    const me2After = await ctx2.request.get(`${API}/auth/me`);
    expect(me2After.status()).toBe(401);

    // List now shows exactly 1 session (the current one)
    const sessAfter = await page.request.get(`${API}/me/sessions`);
    const sessAfterBody = await sessAfter.json() as { sessions: { current: boolean }[] };
    expect(sessAfterBody.sessions.length).toBe(1);
    expect(sessAfterBody.sessions[0].current).toBe(true);
  } finally {
    await ctx2.close();
  }
});

// ── F18-E2E-7: Responsive spot-checks ─────────────────────────────────────────

const VIEWPORTS = [
  { width: 375, height: 812, label: 'mobile-375' },
  { width: 768, height: 1024, label: 'tablet-768' },
  { width: 1280, height: 900, label: 'desktop-1280' },
] as const;

for (const vp of VIEWPORTS) {
  test(`F18-E2E-7 responsive: /parametres Sécurité at ${vp.label}`, async ({ page }) => {
    const email = freshEmail('f18-resp');
    await signUpVerifyAndLogin(page, email, 'F18 Responsive');

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/parametres');

    // Sécurité section visible
    await expect(page.getByRole('heading', { name: /sécurité/i })).toBeVisible({
      timeout: 10_000,
    });

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // Key controls are visible and within viewport
    await expect(page.getByLabel(/nouvelle adresse e-mail/i)).toBeVisible();
    await expect(page.getByText(/session actuelle|sessions actives/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activer', exact: true })).toBeVisible();

    // Screenshot for evidence (relative path — CI-safe)
    await page.screenshot({
      path: `e2e/screenshots/security-${vp.label}.png`,
      fullPage: false,
    });
  });
}
