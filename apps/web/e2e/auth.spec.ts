/**
 * F-1 Acceptance e2e — sign-up, session, logout, login
 *
 * Requires the API (port 3001) and Next.js web (port 3000) to be running before
 * this suite executes. Each test that creates an account uses a unique email so
 * tests can run in any order without collisions.
 *
 * F-11 blocking model: signup no longer returns a session. Tests that previously
 * relied on signup → immediate session now sign up → verify via dev-latest → confirm.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

/** Fetch the email-verification token from the dev seam. */
async function fetchVerifyToken(request: APIRequestContext, email: string): Promise<string> {
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
 * Sign up via UI then verify via dev-latest so the browser lands on / with a live session.
 * Use this whenever a test needs a logged-in user after signup.
 */
async function signUpAndVerify(
  page: Page,
  request: APIRequestContext,
  email: string,
  displayName: string,
): Promise<void> {
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill(displayName);
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/nom d'utilisateur/i).fill(uniqueUsername(email));
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  // F-13: check CGU consent before submit
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  // Blocking model: signup lands on /verifier-email/envoye
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });

  // Verify via dev-latest → confirms and sets session cookie in the browser
  const token = await fetchVerifyToken(request, email);
  await page.goto(`/verifier-email?token=${encodeURIComponent(token)}`);
  // POST_VERIFICATION_REDIRECT is now '/onboarding'; skip the wizard to reach /
  await expect(page).toHaveURL('/onboarding', { timeout: 10_000 });
  // Skip through onboarding (2-step reader path: Passer × 2 → submits empty → /)
  await page.getByRole('button', { name: /passer/i }).click();
  await page.getByRole('button', { name: /passer/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

function uniqueEmail(): string {
  return `qa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

/**
 * Unique @handle derived from the unique email. UI-signup accounts are not torn down between
 * runs, so a fixed suggested handle (e.g. "test-user") would 409 USERNAME_TAKEN on re-runs.
 */
function uniqueUsername(email: string): string {
  return email.split('@')[0].replace(/[^a-z0-9-]/g, '-');
}

// ---------------------------------------------------------------------------
// FE-1 Sign-up form renders required fields
// ---------------------------------------------------------------------------
test('FE-1: /inscription shows displayName + email + username + password + confirm fields', async ({ page }) => {
  await page.goto('/inscription');

  await expect(page.getByLabel(/nom d'affichage/i)).toBeVisible();
  await expect(page.getByLabel(/e-mail/i)).toBeVisible();
  await expect(page.getByLabel(/nom d'utilisateur/i)).toBeVisible();
  await expect(page.getByLabel(/^mot de passe$/i)).toBeVisible();
  await expect(page.getByLabel(/confirmer le mot de passe/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /créer mon compte/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-2 Login form renders required fields including "Se souvenir de moi"
// ---------------------------------------------------------------------------
test('FE-2: /connexion shows email + password + "Se souvenir de moi"', async ({ page }) => {
  await page.goto('/connexion');

  await expect(page.getByLabel(/e-mail/i)).toBeVisible();
  await expect(page.getByLabel(/mot de passe/i)).toBeVisible();
  await expect(page.getByLabel(/se souvenir de moi/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-4 Client-side validation shows French inline errors on /inscription
// ---------------------------------------------------------------------------
test('FE-4a: /inscription shows French required errors on empty submit', async ({ page }) => {
  await page.goto('/inscription');
  // F-13: check CGU box to enable the submit button, then submit empty form
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  await expect(page.getByText('Le nom est requis')).toBeVisible();
  await expect(page.getByText('E-mail requis')).toBeVisible();
  await expect(page.getByText('Mot de passe requis')).toBeVisible();
});

test('FE-4b: /inscription shows "E-mail invalide" for bad email format', async ({ page }) => {
  await page.goto('/inscription');

  await page.getByLabel(/nom d'affichage/i).fill('Yuki');
  await page.getByLabel(/e-mail/i).fill('not-an-email');
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  // F-13: check CGU to enable submit
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  await expect(page.getByText('E-mail invalide')).toBeVisible();
});

test('FE-4c: /connexion shows French required errors on empty submit', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByRole('button', { name: /se connecter/i }).click();

  await expect(page.getByText('E-mail requis')).toBeVisible();
  await expect(page.getByText('Mot de passe requis')).toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-5 Error state: duplicate email shows French server error
// ---------------------------------------------------------------------------
test('FE-5a: /inscription shows "Cet e-mail est déjà utilisé" on duplicate email', async ({ page }) => {
  const email = uniqueEmail();

  // First signup — lands on /verifier-email/envoye (no session in blocking model)
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Yuki Moreau');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/nom d'utilisateur/i).fill(uniqueUsername(email));
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  // F-13: check CGU consent
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  // Blocking model: lands on /verifier-email/envoye, not /
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });

  // Second signup with the same email — account already created; this should 409
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Copie Moreau');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/nom d'utilisateur/i).fill(uniqueUsername(email) + '-2');
  await page.getByLabel(/^mot de passe$/i).fill('password456');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password456');
  // F-13: check CGU consent
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  await expect(page.getByText('Cet e-mail est déjà utilisé')).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// FE-5b + FE-6: Happy path — sign up lands on link-sent page (no session)
// The logged-in header assertion is covered in email-verification.spec.ts (confirm flow).
// ---------------------------------------------------------------------------
test('FE-5b + FE-6: sign up → lands on /verifier-email/envoye, header shows "Se connecter" (no session)', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Test User');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/nom d'utilisateur/i).fill(uniqueUsername(email));
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  // F-13: check CGU consent
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  // Blocking model: lands on /verifier-email/envoye, not home
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });

  // No session: header shows "Se connecter"
  await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible({ timeout: 6_000 });
  // No avatar
  await expect(page.getByRole('button', { name: /menu de test user/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-3: Logout via avatar dropdown → header reverts to "Se connecter"
// F-11 blocking model: must verify account before getting a session.
// ---------------------------------------------------------------------------
test('FE-3 + FE-6: logout via avatar dropdown → header shows "Se connecter"', async ({ page, request }) => {
  const email = uniqueEmail();

  // Sign up → verify via dev-latest to obtain a session
  await signUpAndVerify(page, request, email, 'Logout Test');

  // Now logged in: open avatar dropdown
  await page.getByRole('button', { name: /menu de logout test/i }).click();

  // Dropdown should appear with "Déconnexion" (prototype TOP NAV label)
  await expect(page.getByRole('menuitem', { name: /déconnexion/i })).toBeVisible();

  // Logout
  await page.getByRole('menuitem', { name: /déconnexion/i }).click();

  // Header reverts to logged-out state (FE-6)
  await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible({ timeout: 6_000 });
  await expect(page.getByRole('button', { name: /menu de logout test/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-2 + FE-5 + FE-6: Login → redirect to home → avatar visible
// F-11 blocking model: must verify account before login works.
// ---------------------------------------------------------------------------
test('FE-2 full: login with valid credentials → home → avatar visible', async ({ page, request }) => {
  const email = uniqueEmail();
  const displayName = 'Login Flow';

  // Create and verify account → now logged in at /
  await signUpAndVerify(page, request, email, displayName);

  // Logout
  await page.getByRole('button', { name: /menu de login flow/i }).click();
  await page.getByRole('menuitem', { name: /déconnexion/i }).click();
  await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible({ timeout: 6_000 });

  // Now login at /connexion (account is verified, so login succeeds)
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /se connecter/i }).click();

  await expect(page).toHaveURL('/', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /menu de login flow/i })).toBeVisible({ timeout: 6_000 });
});

// ---------------------------------------------------------------------------
// FE-5 Error: /connexion shows "Identifiants invalides" on wrong password
// ---------------------------------------------------------------------------
test('FE-5 login error: "Identifiants invalides" on wrong password', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill('nonexistent@test.com');
  await page.getByLabel(/mot de passe/i).fill('wrongpass123');
  await page.getByRole('button', { name: /se connecter/i }).click();

  await expect(page.getByText('Identifiants invalides')).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// FE-6: Logged-out visitors see "Se connecter" in header
// ---------------------------------------------------------------------------
test('FE-6 logged-out: header shows "Se connecter" link to /connexion', async ({ page }) => {
  await page.goto('/');

  const link = page.getByRole('link', { name: /se connecter/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/connexion');
});

// ---------------------------------------------------------------------------
// FE-7 Accessibility: keyboard-only form submit on /inscription
// F-11 blocking model: signup lands on /verifier-email/envoye, not /
// ---------------------------------------------------------------------------
test('FE-7: /inscription form is keyboard-submittable', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/inscription');

  // Tab through displayName → email → username → password → confirm → CGU checkbox → submit
  await page.getByLabel(/nom d'affichage/i).focus();
  await page.keyboard.type('Keyboard User');
  await page.keyboard.press('Tab');
  await page.keyboard.type(email);
  await page.keyboard.press('Tab'); // username — append a unique suffix to the suggestion (re-run safety)
  await page.keyboard.press('End');
  // Short suffix: suggestion + suffix must stay within the 30-char username limit.
  await page.keyboard.type(`-${Math.random().toString(36).slice(2, 6)}`);
  await page.keyboard.press('Tab');
  await page.keyboard.type('password123');
  await page.keyboard.press('Tab');
  await page.keyboard.type('password123');
  // F-13: Tab to CGU checkbox, Space to check; the label contains two links
  // (CGU + Politique de confidentialité) that sit in the tab order before the submit.
  await page.keyboard.press('Tab'); // move to CGU checkbox
  await page.keyboard.press('Space'); // check the CGU checkbox
  await page.keyboard.press('Tab'); // link: Conditions générales d'utilisation
  await page.keyboard.press('Tab'); // link: Politique de confidentialité
  await page.keyboard.press('Tab'); // submit button
  await page.keyboard.press('Enter');

  // Blocking model: successful signup lands on the link-sent page
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });
  // Confirm the link-sent page copy is shown
  await expect(page.getByText(/Un lien de confirmation vous a été envoyé à/i)).toBeVisible({ timeout: 6_000 });
});

// ---------------------------------------------------------------------------
// FE-5 Loading state: button disabled during submission
// ---------------------------------------------------------------------------
test('FE-5 loading state: submit button shows "Création…" while submitting', async ({ page }) => {
  // Intercept signup to slow it down
  await page.route('**/auth/signup', async (route) => {
    await new Promise((r) => setTimeout(r, 3_000));
    await route.continue();
  });

  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Slow User');
  await page.getByLabel(/e-mail/i).fill(uniqueEmail());
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  // F-13: check CGU consent to enable submit
  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  // Button should be disabled and show loading text
  const btn = page.getByRole('button', { name: /création/i });
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
});
