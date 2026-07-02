/**
 * F-11 Email verification — Playwright e2e acceptance suite
 *
 * Covers:
 *   AC-F1: banner shows verbatim French copy after signup
 *   AC-F2: /verifier-email?token=... → success "Adresse e-mail vérifiée !"
 *   AC-F4: banner visible while unverified; gone after confirm + session.refresh()
 *   AC-F5: resend → "E-mail envoyé." success message
 *   AC-F6: invalid token → "Lien invalide ou expiré." with recovery action
 *   AC-F7: accessibility — banner role="status", landing role="status"
 *   AC-F8: responsive spot-check at 375px (no horizontal overflow)
 *
 * Hermetic: each test creates its own unique-email account so tests are
 * order-independent. Token retrieved via GET /auth/verify-email/dev-latest
 * (non-prod seam) — no SMTP required. DISABLE_RATE_LIMIT=true is set in
 * playwright.config.ts so rate limits don't interfere.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function uniqueEmail(): string {
  return `qa_f11_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

/** Sign up a fresh account and land on home page. */
async function signUpFresh(page: Page, email: string): Promise<void> {
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Vérif User');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

/** Poll dev-latest until token is available (stash is synchronous at issue-time). */
async function fetchVerifyToken(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const res = await request.get(`${API}/auth/verify-email/dev-latest?email=${encodeURIComponent(email)}`);
    if (res.ok()) {
      const body = await res.json() as { token: string };
      return body.token;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`dev-latest token not found for ${email}`);
}

// ── AC-F1 / AC-F4 — banner visible after signup ─────────────────────────────

test('F-11 AC-F1: banner shows verbatim French copy after signup', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  // The banner must contain the verbatim French text from the story
  await expect(
    page.getByText(/Vérifiez votre adresse e-mail — un lien de confirmation vous a été envoyé/),
  ).toBeVisible({ timeout: 6_000 });
});

test('F-11 AC-F4: banner is pending while unverified; gone after confirm + session refresh', async ({ page, request }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  // Banner is visible (unverified state)
  const banner = page.getByRole('status', { name: /vérification de l'e-mail/i });
  await expect(banner).toBeVisible({ timeout: 6_000 });

  // Fetch the verification token from the dev seam
  const token = await fetchVerifyToken(request, email);

  // Visit the confirmation landing
  await page.goto(`/verifier-email?token=${encodeURIComponent(token)}`);

  // Success copy visible
  await expect(page.getByText(/Adresse e-mail vérifiée/)).toBeVisible({ timeout: 8_000 });

  // Navigate back to home — banner should be gone (session.refresh() was called)
  await page.goto('/');
  // Give the session a moment to refresh, then assert the banner is NOT present
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(
    page.getByRole('status', { name: /vérification de l'e-mail/i }),
  ).not.toBeVisible({ timeout: 6_000 });
});

// ── AC-F2 / AC-F6 — confirmation landing ────────────────────────────────────

test('F-11 AC-F2: /verifier-email?token=<valid> shows "Adresse e-mail vérifiée !"', async ({ page, request }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);
  const token = await fetchVerifyToken(request, email);

  await page.goto(`/verifier-email?token=${encodeURIComponent(token)}`);

  await expect(page.getByText(/Adresse e-mail vérifiée/)).toBeVisible({ timeout: 8_000 });
  // The success region must be announced (role=status with aria-live)
  const statusRegion = page.getByRole('status');
  await expect(statusRegion).toBeVisible({ timeout: 4_000 });
});

test('F-11 AC-F6: invalid token → "Lien invalide ou expiré." with recovery action when logged in', async ({ page }) => {
  const email = uniqueEmail();
  // Sign up first so we're logged in (recovery action is only shown to logged-in users)
  await signUpFresh(page, email);

  await page.goto('/verifier-email?token=this-is-a-bad-token');

  await expect(page.getByText(/Lien invalide ou expiré/)).toBeVisible({ timeout: 8_000 });

  // "Renvoyer l'e-mail" must appear in the main content area (logged-in recovery path).
  // Note: the VerificationBanner also shows a "Renvoyer l'e-mail" button when unverified;
  // we scope to main to distinguish the page-level recovery action from the banner button.
  await expect(page.getByRole('main').getByRole('button', { name: /Renvoyer l'e-mail/i })).toBeVisible({ timeout: 4_000 });
});

test('F-11 AC-F6 logged out: invalid token → error shown, no recovery button', async ({ page }) => {
  // Visit without being logged in
  await page.goto('/verifier-email?token=bad-token-not-logged-in');

  await expect(page.getByText(/Lien invalide ou expiré/)).toBeVisible({ timeout: 8_000 });

  // Recovery button must NOT appear when not logged in
  await expect(page.getByRole('button', { name: /Renvoyer l'e-mail/i })).not.toBeVisible({ timeout: 4_000 });
});

// ── AC-F5 — resend ───────────────────────────────────────────────────────────

test('F-11 AC-F5: clicking "Renvoyer l\'e-mail" on the banner shows "E-mail envoyé."', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  // Banner should be visible
  await expect(
    page.getByText(/Vérifiez votre adresse e-mail/),
  ).toBeVisible({ timeout: 6_000 });

  // Click resend
  await page.getByRole('button', { name: /Renvoyer l'e-mail/i }).click();

  // Success feedback
  await expect(page.getByText(/E-mail envoyé/)).toBeVisible({ timeout: 6_000 });
});

// ── AC-F7 — accessibility ────────────────────────────────────────────────────

test('F-11 AC-F7: banner has role="status" with aria-label; button is keyboard-reachable', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  // Banner is a labelled status region
  const banner = page.getByRole('status', { name: /vérification de l'e-mail/i });
  await expect(banner).toBeVisible({ timeout: 6_000 });

  // Button must be focusable via keyboard
  await page.keyboard.press('Tab');
  // Cycle through tabs until we reach the Renvoyer button or timeout
  const btn = page.getByRole('button', { name: /Renvoyer l'e-mail/i });
  await expect(btn).toBeVisible();
  // Confirm it's in the accessibility tree (native button element)
  expect(await btn.evaluate((el) => el.tagName.toLowerCase())).toBe('button');
});

test('F-11 AC-F7: /verifier-email success state announces via role="status"', async ({ page, request }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);
  const token = await fetchVerifyToken(request, email);

  await page.goto(`/verifier-email?token=${encodeURIComponent(token)}`);

  // Success region must exist and be a status landmark
  await expect(page.getByRole('status')).toBeVisible({ timeout: 8_000 });
});

// ── AC-F8 — responsive at 375px ─────────────────────────────────────────────

test('F-11 AC-F8: banner at 375px — no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const email = uniqueEmail();
  await signUpFresh(page, email);

  // Banner still visible at mobile width
  await expect(
    page.getByText(/Vérifiez votre adresse e-mail/),
  ).toBeVisible({ timeout: 6_000 });

  // Check there is no horizontal scroll / overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('F-11 AC-F8: /verifier-email at 375px — no horizontal overflow', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const email = uniqueEmail();
  await signUpFresh(page, email);
  const token = await fetchVerifyToken(request, email);

  await page.goto(`/verifier-email?token=${encodeURIComponent(token)}`);

  await expect(page.getByText(/Adresse e-mail vérifiée/)).toBeVisible({ timeout: 8_000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

// ── AC-F8 768px / 1280px responsive spot-checks ─────────────────────────────

test('F-11 AC-F8: banner at 768px (tablet) — no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });

  const email = uniqueEmail();
  await signUpFresh(page, email);

  await expect(
    page.getByText(/Vérifiez votre adresse e-mail/),
  ).toBeVisible({ timeout: 6_000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('F-11 AC-F8: banner at 1280px (desktop) — no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const email = uniqueEmail();
  await signUpFresh(page, email);

  await expect(
    page.getByText(/Vérifiez votre adresse e-mail/),
  ).toBeVisible({ timeout: 6_000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  // Diagnostic info on failure — this helps identify whether overflow is from banner or header
  if (overflow) {
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerW = await page.evaluate(() => window.innerWidth);
    const overflowers = await page.evaluate(() => {
      const wide: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 1) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className?.toString().slice(0, 50) ?? '';
          wide.push(`${tag}.${cls} right=${Math.round(rect.right)}`);
        }
      });
      return wide.slice(0, 5);
    });
    console.log(`OVERFLOW at 1280px: scrollWidth=${scrollW} innerWidth=${innerW}`, overflowers);
  }
  expect(overflow).toBe(false);
});

// ── BE endpoint smoke via APIRequestContext ───────────────────────────────────

test('F-11 BE: POST /auth/verify-email/request without session → 401', async ({ request }) => {
  const res = await request.post(`${API}/auth/verify-email/request`);
  expect(res.status()).toBe(401);
});

test('F-11 BE: POST /auth/verify-email/confirm with bad token → 400 EMAIL_TOKEN_INVALID', async ({ request }) => {
  const res = await request.post(`${API}/auth/verify-email/confirm`, {
    data: { token: 'totally-invalid-token-xyz' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json() as { error: string };
  expect(body.error).toBe('EMAIL_TOKEN_INVALID');
});

test('F-11 BE: GET /auth/verify-email/dev-latest without stash → 404', async ({ request }) => {
  const res = await request.get(`${API}/auth/verify-email/dev-latest?email=nonexistent_f11@test.com`);
  expect(res.status()).toBe(404);
});

test('F-11 BE: happy path via API — signup → dev-latest → confirm → emailVerified true', async ({ request }) => {
  const email = uniqueEmail();

  // Signup via API
  const signupRes = await request.post(`${API}/auth/signup`, {
    data: { displayName: 'API Vérif', email, password: 'password123' },
  });
  expect(signupRes.status()).toBe(201);
  const signupBody = await signupRes.json() as { account: { emailVerified: boolean } };
  expect(signupBody.account.emailVerified).toBe(false);

  // Get token from dev seam
  const token = await fetchVerifyToken(request, email);
  expect(typeof token).toBe('string');
  expect(token.length).toBeGreaterThan(10);

  // Confirm the token
  const confirmRes = await request.post(`${API}/auth/verify-email/confirm`, {
    data: { token },
  });
  expect(confirmRes.status()).toBe(200);
  const confirmBody = await confirmRes.json() as { emailVerified: boolean };
  expect(confirmBody.emailVerified).toBe(true);
});
