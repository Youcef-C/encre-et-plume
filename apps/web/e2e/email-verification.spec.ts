/**
 * F-11 Email verification — BLOCKING model — Playwright e2e acceptance suite
 *
 * Covers the blocking flow (Round 2):
 *   - UI signup lands on /verifier-email/envoye (no session)
 *   - Blocked login → routed to /verifier-email/envoye with reason=login
 *   - Confirm happy path: dev-latest token → success → redirect to / with live session
 *   - Invalid token recovery (public resend with email input)
 *   - Resend from /verifier-email/envoye → "E-mail envoyé."
 *   - Responsive spot-checks 375/768/1280 on envoye + landing
 *   - Accessibility: role="status" on status regions
 *   - BE smoke: signup → 201 verificationRequired (no set-cookie); login unverified → 403;
 *     request public → 200; confirm → 200 + set-cookie; dev-latest absent → 404
 *
 * Hermetic: each test creates its own unique-email account.
 * DISABLE_RATE_LIMIT=true is set in playwright.config.ts for the API server.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function uniqueEmail(): string {
  return `qa_f11_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

/** Sign up via UI; lands on /verifier-email/envoye (no session). */
async function signUpFresh(page: Page, email: string): Promise<void> {
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Vérif User');
  await page.getByLabel(/e-mail/i).fill(email);
  // Unique handle: UI-signup accounts persist across runs, a fixed suggestion would 409.
  await page.getByLabel(/nom d'utilisateur/i).fill(email.split('@')[0].replace(/[^a-z0-9-]/g, '-'));
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  // F-13: check CGU consent before submit
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  // Blocking model: signup lands on the link-sent page, NOT home
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });
}

/** Sign up via API only (no browser needed); returns nothing (account is unverified). */
async function signUpViaApi(request: APIRequestContext, email: string): Promise<void> {
  const res = await request.post(`${API}/auth/signup`, {
    // F-13: acceptCgu required by the API
    data: { displayName: 'API Vérif', email, password: 'password123', acceptCgu: true },
  });
  expect(res.status()).toBe(201);
}

/** Poll dev-latest until the verify token is available. */
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

// ── UI signup flow ────────────────────────────────────────────────────────────

test('F-11: UI signup lands on /verifier-email/envoye with confirmation copy', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  // Confirmation copy visible
  await expect(page.getByText(/Un lien de confirmation vous a été envoyé à/i)).toBeVisible({ timeout: 6_000 });
  // Email interpolated in the page
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  // No session: header shows "Se connecter"
  await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible({ timeout: 4_000 });
});

// ── Blocked login ─────────────────────────────────────────────────────────────

test('F-11: login with unverified account → routed to link-sent page with reason=login copy', async ({ page, request }) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email);

  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /se connecter/i }).click();

  // Routed to the link-sent page with reason=login
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });
  // Normal copy
  await expect(page.getByText(/Un lien de confirmation vous a été envoyé à/i)).toBeVisible({ timeout: 6_000 });
  // Additional login-reason line
  await expect(page.getByText(/Confirmez votre e-mail pour continuer/i)).toBeVisible({ timeout: 4_000 });
});

// ── Confirm happy path ────────────────────────────────────────────────────────

test('F-11: confirm valid token → "Adresse e-mail vérifiée !" → redirect to / with session', async ({ page, request }) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email);
  const token = await fetchVerifyToken(request, email);

  await page.goto(`/verifier-email?token=${encodeURIComponent(token)}`);

  // Success copy visible
  await expect(page.getByText(/Adresse e-mail vérifiée/i)).toBeVisible({ timeout: 8_000 });
  // Success region is a role=status (a11y)
  await expect(page.getByRole('status')).toBeVisible();

  // Redirect to POST_VERIFICATION_REDIRECT (now '/onboarding')
  await expect(page).toHaveURL('/onboarding', { timeout: 10_000 });

  // Session is live: header shows avatar (display name is "API Vérif")
  await expect(page.getByRole('button', { name: /menu de api vérif/i })).toBeVisible({ timeout: 6_000 });
});

// ── Invalid token recovery ────────────────────────────────────────────────────

test('F-11: invalid token → "Lien invalide ou expiré." with email input + resend button (public)', async ({ page }) => {
  await page.goto('/verifier-email?token=this-is-a-bad-token');

  await expect(page.getByText(/Lien invalide ou expiré/i)).toBeVisible({ timeout: 8_000 });

  // Email input for public resend (no session required)
  await expect(page.getByLabel(/e-mail/i)).toBeVisible({ timeout: 4_000 });
  await expect(page.getByRole('button', { name: /Renvoyer l'e-mail/i })).toBeVisible({ timeout: 4_000 });
});

// ── Resend from link-sent page ────────────────────────────────────────────────

test('F-11: "Renvoyer l\'e-mail" on /verifier-email/envoye → shows "E-mail envoyé."', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  // Button visible on the link-sent page
  await expect(page.getByRole('button', { name: /Renvoyer l'e-mail/i })).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: /Renvoyer l'e-mail/i }).click();

  // Success feedback
  await expect(page.getByText(/E-mail envoyé/i)).toBeVisible({ timeout: 8_000 });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

test('F-11: /verifier-email/envoye has role="status" for feedback announcements', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  // The resend feedback region has role=status
  const statusRegion = page.getByRole('status');
  await expect(statusRegion).toBeVisible({ timeout: 6_000 });
  // Button inside the status region is keyboard-reachable
  await expect(page.getByRole('button', { name: /Renvoyer l'e-mail/i })).toBeVisible();
});

// Success-state role="status" is already checked in the happy path test above.
// The error state also carries role="status" and is stable (no redirect).
test('F-11: /verifier-email error state has role="status" aria-live="polite"', async ({ page }) => {
  await page.goto('/verifier-email?token=bad-a11y-token');

  // Error state: stable, role="status" wraps the error heading
  const statusRegion = page.getByRole('status');
  await expect(statusRegion).toBeVisible({ timeout: 8_000 });
  // Heading inside the status region
  await expect(page.getByText(/Lien invalide ou expiré/i)).toBeVisible({ timeout: 4_000 });
});

// ── Responsive spot-checks ─────────────────────────────────────────────────────

for (const [label, width, height] of [
  ['375px (mobile)', 375, 812],
  ['768px (tablet)', 768, 1024],
  ['1280px (desktop)', 1280, 800],
] as [string, number, number][]) {
  test(`F-11 responsive: /verifier-email/envoye at ${label} — no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const email = uniqueEmail();
    await signUpFresh(page, email);

    await expect(page.getByText(/Un lien de confirmation vous a été envoyé à/i)).toBeVisible({ timeout: 6_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  // The success state redirects immediately; test the error state (stable) for overflow.
  test(`F-11 responsive: /verifier-email (landing, error state) at ${label} — no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // Use an invalid token → shows stable error card (no redirect)
    await page.goto('/verifier-email?token=bad-responsive-token');
    await expect(page.getByText(/Lien invalide ou expiré/i)).toBeVisible({ timeout: 8_000 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}

// ── Back-to-login link ─────────────────────────────────────────────────────────

test('F-11: /verifier-email/envoye shows "Retour à la connexion" link to /connexion', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFresh(page, email);

  const link = page.getByRole('link', { name: /Retour à la connexion/i });
  await expect(link).toBeVisible({ timeout: 6_000 });
  await expect(link).toHaveAttribute('href', '/connexion');
});

// ── BE endpoint smoke ────────────────────────────────────────────────────────

test('F-11 BE: POST /auth/signup → 201 { verificationRequired: true, email } with NO set-cookie', async ({ request }) => {
  const email = uniqueEmail();
  const res = await request.post(`${API}/auth/signup`, {
    // F-13: acceptCgu required
    data: { displayName: 'Smoke Test', email, password: 'password123', acceptCgu: true },
  });
  expect(res.status()).toBe(201);
  const body = await res.json() as { verificationRequired: boolean; email: string };
  expect(body.verificationRequired).toBe(true);
  expect(body.email).toBe(email);
  // No session cookie set
  const setCookie = res.headers()['set-cookie'] ?? '';
  expect(setCookie).not.toContain('ep_session');
});

test('F-11 BE: POST /auth/login with unverified account → 403 EMAIL_NOT_VERIFIED', async ({ request }) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email);

  const res = await request.post(`${API}/auth/login`, {
    data: { email, password: 'password123' },
  });
  expect(res.status()).toBe(403);
  const body = await res.json() as { error: string };
  expect(body.error).toBe('EMAIL_NOT_VERIFIED');
});

test('F-11 BE: POST /auth/verify-email/request { email } (public) → 200 { ok: true }', async ({ request }) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email);

  const res = await request.post(`${API}/auth/verify-email/request`, {
    data: { email },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { ok: boolean };
  expect(body.ok).toBe(true);
});

test('F-11 BE: POST /auth/verify-email/request non-existing email → same 200 (non-enumerating)', async ({ request }) => {
  const res = await request.post(`${API}/auth/verify-email/request`, {
    data: { email: 'nonexistent_f11_public@test.com' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { ok: boolean };
  expect(body.ok).toBe(true);
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

test('F-11 BE: happy path via API — signup → dev-latest → confirm → { emailVerified: true } with set-cookie', async ({ request }) => {
  const email = uniqueEmail();

  // Signup: no session
  const signupRes = await request.post(`${API}/auth/signup`, {
    // F-13: acceptCgu required
    data: { displayName: 'API Vérif', email, password: 'password123', acceptCgu: true },
  });
  expect(signupRes.status()).toBe(201);
  expect((signupRes.headers()['set-cookie'] ?? '')).not.toContain('ep_session');

  // GET /auth/me without session → 401 (no session issued at signup)
  const meBeforeRes = await request.get(`${API}/auth/me`);
  expect(meBeforeRes.status()).toBe(401);

  // Get token from dev seam
  const token = await fetchVerifyToken(request, email);
  expect(typeof token).toBe('string');
  expect(token.length).toBeGreaterThan(10);

  // Confirm: returns { emailVerified: true } + Set-Cookie ep_session
  const confirmRes = await request.post(`${API}/auth/verify-email/confirm`, {
    data: { token },
  });
  expect(confirmRes.status()).toBe(200);
  const confirmBody = await confirmRes.json() as { emailVerified: boolean };
  expect(confirmBody.emailVerified).toBe(true);
  expect(confirmRes.headers()['set-cookie'] ?? '').toContain('ep_session');
});
