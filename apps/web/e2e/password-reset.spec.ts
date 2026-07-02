/**
 * F-12 Password reset "Mot de passe oublié" — Playwright e2e acceptance suite
 *
 * Covers:
 *   AC-F1: "Mot de passe oublié ?" link on login form → request form
 *   AC-F2: non-enumerating message for existing AND non-existing email
 *   AC-F3: success copy + redirect to /connexion
 *   AC-F4: submitting state (button disabled, "Envoi…")
 *   AC-F5: invalid/absent token → "Lien invalide ou expiré." + back link;
 *          mismatch + weak inline errors
 *   AC-B2: POST returns 200 { ok: true } regardless of account existence
 *   AC-B3: POST confirm with bad token → 400 PASSWORD_RESET_TOKEN_INVALID
 *   AC-B4: session captured before reset → 401 on /auth/me after reset;
 *          old password fails login; new password succeeds
 *   AC-F7: no horizontal overflow at 375 / 768 / 1280 on both forms
 *
 * Hermetic: each test creates its own unique-email account. Tokens retrieved
 * via GET /auth/password-reset/dev-latest (non-prod seam). DISABLE_RATE_LIMIT=true
 * is set in playwright.config.ts for the API server.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

function uniqueEmail(tag = 'f12'): string {
  return `qa_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

/** Fetch the email-verification token from the dev seam. */
async function fetchEmailVerifyToken(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const res = await request.get(
      `${API}/auth/verify-email/dev-latest?email=${encodeURIComponent(email)}`,
    );
    if (res.ok()) {
      const body = (await res.json()) as { token: string };
      return body.token;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev-latest verify token not found for ${email}`);
}

/**
 * Sign up via API, then verify the account via dev-latest so it becomes loginable.
 * Returns the Set-Cookie header value from the confirm step (an active session).
 * F-11 blocking model: signup no longer returns a session; confirm does.
 */
async function signUpViaApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const signupRes = await request.post(`${API}/auth/signup`, {
    data: { displayName: 'Reset User', email, password },
  });
  expect(signupRes.status()).toBe(201);
  // No session cookie from signup (blocking model)

  // Verify via dev-latest to make the account loginable
  const verifyToken = await fetchEmailVerifyToken(request, email);
  const confirmRes = await request.post(`${API}/auth/verify-email/confirm`, {
    data: { token: verifyToken },
  });
  expect(confirmRes.status()).toBe(200);
  const setCookie = confirmRes.headers()['set-cookie'] ?? '';
  expect(setCookie).toContain('ep_session');
  return setCookie;
}

/**
 * Sign up via browser UI — F-11 blocking model: lands on /verifier-email/envoye.
 * Callers that need a live session must verify separately.
 */
async function signUpViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Reset User');
  await page.getByLabel(/e-mail/i).fill(email);
  // Unique handle: UI-signup accounts persist across runs, a fixed suggestion would 409.
  await page.getByLabel(/nom d'utilisateur/i).fill(email.split('@')[0].replace(/[^a-z0-9-]/g, '-'));
  await page.getByLabel(/^mot de passe$/i).fill(password);
  await page.getByLabel(/confirmer le mot de passe/i).fill(password);
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  // Blocking model: lands on /verifier-email/envoye, not /
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });
}

/** Logout via UI (navigates to / then clicks the logout link/button). */
async function logoutViaApi(request: APIRequestContext): Promise<void> {
  await request.post(`${API}/auth/logout`);
}

/** Fetch the reset token from the dev seam. */
async function fetchResetToken(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const res = await request.get(
      `${API}/auth/password-reset/dev-latest?email=${encodeURIComponent(email)}`,
    );
    if (res.ok()) {
      const body = (await res.json()) as { token: string };
      return body.token;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev-latest reset token not found for ${email}`);
}

// ── AC-F1 — "Mot de passe oublié ?" link ──────────────────────────────────────

test('F-12 AC-F1: login page shows "Mot de passe oublié ?" link → navigates to request form', async ({
  page,
}) => {
  await page.goto('/connexion');

  const forgotLink = page.getByRole('link', { name: /mot de passe oublié/i });
  await expect(forgotLink).toBeVisible({ timeout: 6_000 });

  await forgotLink.click();
  await expect(page).toHaveURL('/mot-de-passe-oublie', { timeout: 8_000 });

  // Request form has an email field and submit button
  await expect(page.getByLabel(/e-mail/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /envoyer le lien/i })).toBeVisible();
});

// ── AC-F2 — non-enumerating confirmation message ───────────────────────────────

test('F-12 AC-F2: existing email shows non-enumerating confirmation', async ({ page, request }) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email, 'password123');

  await page.goto('/mot-de-passe-oublie');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByRole('button', { name: /envoyer le lien/i }).click();

  await expect(
    page.getByText(/Si un compte existe pour cette adresse/),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('status')).toBeVisible();
});

test('F-12 AC-F2: non-existing email shows IDENTICAL non-enumerating confirmation', async ({
  page,
}) => {
  await page.goto('/mot-de-passe-oublie');
  await page.getByLabel(/e-mail/i).fill('does-not-exist-xyz@test.com');
  await page.getByRole('button', { name: /envoyer le lien/i }).click();

  // Same message — no account enumeration
  await expect(
    page.getByText(/Si un compte existe pour cette adresse/),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('status')).toBeVisible();
});

// ── AC-F4 — submitting state ───────────────────────────────────────────────────

test('F-12 AC-F4: submitting state — button shows "Envoi…" and is disabled', async ({ page, request }) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email, 'password123');

  await page.goto('/mot-de-passe-oublie');
  await page.getByLabel(/e-mail/i).fill(email);

  // Intercept the request to hold it in flight so we can observe the submitting state
  await page.route(`${API}/auth/password-reset/request`, async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });

  await page.getByRole('button', { name: /envoyer le lien/i }).click();

  // Button should show submitting state briefly
  await expect(page.getByRole('button', { name: /envoi/i })).toBeDisabled({ timeout: 2_000 });
});

// ── AC-F3 / AC-F5 / AC-B3 — reset form states ─────────────────────────────────

test('F-12 AC-F5: reset form with no token → immediately shows "Lien invalide ou expiré." + back link', async ({
  page,
}) => {
  await page.goto('/reinitialiser-mot-de-passe');
  // No ?token= in URL → immediate error state
  await expect(page.getByText(/Lien invalide ou expiré/)).toBeVisible({ timeout: 6_000 });
  await expect(
    page.getByRole('link', { name: /nouveau lien/i }),
  ).toHaveAttribute('href', '/mot-de-passe-oublie');
});

test('F-12 AC-F5: reset form with bad token → API 400 → "Lien invalide ou expiré." + back link', async ({
  page,
}) => {
  await page.goto('/reinitialiser-mot-de-passe?token=bogus-invalid-token-xyz');
  // Form is shown (token present in URL)
  await page.getByLabel(/nouveau mot de passe/i).fill('newpassword123');
  await page.getByLabel(/confirmer/i).fill('newpassword123');
  await page.getByRole('button', { name: /réinitialiser le mot de passe/i }).click();

  await expect(page.getByText(/Lien invalide ou expiré/)).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole('link', { name: /nouveau lien/i }),
  ).toHaveAttribute('href', '/mot-de-passe-oublie');
});

test('F-12 AC-F5: weak password (< 8 chars) shows inline French error', async ({ page }) => {
  await page.goto('/reinitialiser-mot-de-passe?token=any-token');
  await page.getByLabel(/nouveau mot de passe/i).fill('short');
  await page.getByLabel(/confirmer/i).fill('short');
  await page.getByRole('button', { name: /réinitialiser le mot de passe/i }).click();

  await expect(page.getByText(/au moins 8 caractères/)).toBeVisible({ timeout: 4_000 });
});

test('F-12 AC-F5: password mismatch shows inline French error', async ({ page }) => {
  await page.goto('/reinitialiser-mot-de-passe?token=any-token');
  await page.getByLabel(/nouveau mot de passe/i).fill('strongpassword1');
  await page.getByLabel(/confirmer/i).fill('differentpassword2');
  await page.getByRole('button', { name: /réinitialiser le mot de passe/i }).click();

  await expect(page.getByText(/ne correspondent pas/)).toBeVisible({ timeout: 4_000 });
});

test('F-12 AC-F3: success → "Mot de passe mis à jour — reconnectez-vous." + redirect to /connexion', async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email, 'password123');

  // Request reset
  const reqRes = await request.post(`${API}/auth/password-reset/request`, {
    data: { email },
  });
  expect(reqRes.status()).toBe(200);
  expect((await reqRes.json() as { ok: boolean }).ok).toBe(true);

  // Get token from dev seam
  const token = await fetchResetToken(request, email);

  // Navigate to reset form
  await page.goto(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`);
  await page.getByLabel(/nouveau mot de passe/i).fill('newpassword456');
  await page.getByLabel(/confirmer/i).fill('newpassword456');
  await page.getByRole('button', { name: /réinitialiser le mot de passe/i }).click();

  // Success copy
  await expect(
    page.getByText(/Mot de passe mis à jour — reconnectez-vous/),
  ).toBeVisible({ timeout: 8_000 });

  // Redirect to /connexion after ~2s
  await expect(page).toHaveURL('/connexion', { timeout: 6_000 });
});

// ── AC-B2 — API shape: non-enumerating 200 for any email ───────────────────────

test('F-12 AC-B2: POST /auth/password-reset/request for non-existent email → 200 { ok: true }', async ({
  request,
}) => {
  const res = await request.post(`${API}/auth/password-reset/request`, {
    data: { email: 'definitely-not-registered-xyz@test.com' },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
});

test('F-12 AC-B2: POST /auth/password-reset/request for existing email → same 200 { ok: true }', async ({
  request,
}) => {
  const email = uniqueEmail();
  await signUpViaApi(request, email, 'password123');

  const res = await request.post(`${API}/auth/password-reset/request`, {
    data: { email },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
});

// ── AC-B3 — confirm bad token → 400 PASSWORD_RESET_TOKEN_INVALID ───────────────

test('F-12 AC-B3: POST /auth/password-reset/confirm bad token → 400 PASSWORD_RESET_TOKEN_INVALID', async ({
  request,
}) => {
  const res = await request.post(`${API}/auth/password-reset/confirm`, {
    data: { token: 'totally-invalid-token-xyz-f12', newPassword: 'newpassword123' },
  });
  expect(res.status()).toBe(400);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe('PASSWORD_RESET_TOKEN_INVALID');
});

// ── AC-B4 — full happy path + session invalidation ─────────────────────────────

test('F-12 AC-B4 (happy path): signup → request → confirm → new password works, old fails, pre-reset session → 401', async ({
  request,
}) => {
  const email = uniqueEmail('f12b4');
  const oldPassword = 'oldpassword789';
  const newPassword = 'newpassword456';

  // 1. Signup + verify (F-11 blocking model) and capture session cookie from confirm step
  const sessionCookie = await signUpViaApi(request, email, oldPassword);

  // 2. Verify pre-reset session is valid
  const cookieValue = sessionCookie.split(';')[0]; // "ep_session=<value>"
  const meBeforeReset = await request.get(`${API}/auth/me`, {
    headers: { Cookie: cookieValue },
  });
  expect(meBeforeReset.status()).toBe(200);

  // Session invalidation is ms-precise (token `ims` claim vs `session-epoch-ms`), so a
  // token issued in the same second as the reset is still rejected — no wait needed.

  // 3. Request password reset
  const reqRes = await request.post(`${API}/auth/password-reset/request`, {
    data: { email },
  });
  expect(reqRes.status()).toBe(200);

  // 4. Fetch token from dev seam
  const token = await fetchResetToken(request, email);
  expect(typeof token).toBe('string');
  expect(token.length).toBeGreaterThan(10);

  // 5. Confirm password reset with new password
  const confirmRes = await request.post(`${API}/auth/password-reset/confirm`, {
    data: { token, newPassword },
  });
  expect(confirmRes.status()).toBe(200);
  const confirmBody = (await confirmRes.json()) as { reset: boolean };
  expect(confirmBody.reset).toBe(true);

  // 6. Pre-reset session should now be rejected (session epoch bump)
  const meAfterReset = await request.get(`${API}/auth/me`, {
    headers: { Cookie: cookieValue },
  });
  expect(meAfterReset.status()).toBe(401);

  // 7. Old password login fails
  const oldLoginRes = await request.post(`${API}/auth/login`, {
    data: { email, password: oldPassword },
  });
  expect(oldLoginRes.status()).toBe(401);

  // 8. New password login succeeds
  const newLoginRes = await request.post(`${API}/auth/login`, {
    data: { email, password: newPassword },
  });
  expect(newLoginRes.status()).toBe(200);
});

// ── AC-B4 — GET /auth/password-reset/dev-latest absent → 404 ──────────────────

test('F-12: GET /auth/password-reset/dev-latest without stash → 404', async ({ request }) => {
  const res = await request.get(
    `${API}/auth/password-reset/dev-latest?email=nobody_f12@test.com`,
  );
  expect(res.status()).toBe(404);
});

// ── AC-F6 — accessibility ──────────────────────────────────────────────────────

test('F-12 AC-F6: request form has labelled email input and keyboard-submittable form', async ({
  page,
}) => {
  await page.goto('/mot-de-passe-oublie');

  const emailInput = page.getByLabel(/e-mail/i);
  await expect(emailInput).toBeVisible();

  // Input has a label (accessible name)
  const inputId = await emailInput.getAttribute('id');
  expect(inputId).toBeTruthy();

  // Form is keyboard-submittable (press Enter after typing)
  await emailInput.fill('keyboard@test.com');
  await emailInput.press('Enter');
  // After submit, either success or the button becomes disabled briefly
  await expect(page.getByText(/Si un compte existe pour cette adresse/)).toBeVisible({
    timeout: 8_000,
  });
});

test('F-12 AC-F6: reset form has labelled password inputs', async ({ page }) => {
  await page.goto('/reinitialiser-mot-de-passe?token=any-token');

  await expect(page.getByLabel(/nouveau mot de passe/i)).toBeVisible();
  await expect(page.getByLabel(/confirmer/i)).toBeVisible();
});

test('F-12 AC-F6: success outcome announced via role="status"', async ({ page, request }) => {
  const email = uniqueEmail('f12a11y');
  await signUpViaApi(request, email, 'password123');

  await request.post(`${API}/auth/password-reset/request`, { data: { email } });
  const token = await fetchResetToken(request, email);

  await page.goto(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`);
  await page.getByLabel(/nouveau mot de passe/i).fill('newpassword456');
  await page.getByLabel(/confirmer/i).fill('newpassword456');
  await page.getByRole('button', { name: /réinitialiser le mot de passe/i }).click();

  await expect(page.getByRole('status')).toBeVisible({ timeout: 8_000 });
});

// ── AC-F7 — responsive spot-checks ─────────────────────────────────────────────

for (const [label, width, height] of [
  ['375px (mobile)', 375, 812],
  ['768px (tablet)', 768, 1024],
  ['1280px (desktop)', 1280, 800],
] as [string, number, number][]) {
  test(`F-12 AC-F7: request form at ${label} — no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/mot-de-passe-oublie');
    await expect(page.getByRole('button', { name: /envoyer le lien/i })).toBeVisible({
      timeout: 6_000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test(`F-12 AC-F7: reset form at ${label} — no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/reinitialiser-mot-de-passe?token=any-token');
    await expect(
      page.getByRole('button', { name: /réinitialiser le mot de passe/i }),
    ).toBeVisible({ timeout: 6_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
}
