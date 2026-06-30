/**
 * F-1 Acceptance e2e — sign-up, session, logout, login
 *
 * Requires the API (port 3001) and Next.js web (port 3000) to be running before
 * this suite executes. Each test that creates an account uses a unique email so
 * tests can run in any order without collisions.
 */
import { test, expect } from '@playwright/test';

function uniqueEmail(): string {
  return `qa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

// ---------------------------------------------------------------------------
// FE-1 Sign-up form renders required fields
// ---------------------------------------------------------------------------
test('FE-1: /inscription shows displayName + email + password fields', async ({ page }) => {
  await page.goto('/inscription');

  await expect(page.getByLabel(/nom d'affichage/i)).toBeVisible();
  await expect(page.getByLabel(/e-mail/i)).toBeVisible();
  await expect(page.getByLabel(/mot de passe/i)).toBeVisible();
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
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  await expect(page.getByText('Le nom est requis')).toBeVisible();
  await expect(page.getByText('E-mail requis')).toBeVisible();
  await expect(page.getByText('Mot de passe requis')).toBeVisible();
});

test('FE-4b: /inscription shows "E-mail invalide" for bad email format', async ({ page }) => {
  await page.goto('/inscription');

  await page.getByLabel(/nom d'affichage/i).fill('Yuki');
  await page.getByLabel(/e-mail/i).fill('not-an-email');
  await page.getByLabel(/mot de passe/i).fill('password123');
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

  // First signup succeeds
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Yuki Moreau');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  // Wait for redirect to home
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Second signup with same email in a fresh page context
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Copie Moreau');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password456');
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  await expect(page.getByText('Cet e-mail est déjà utilisé')).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// FE-5b + FE-6: Happy path — sign up → redirect to home → avatar visible
// ---------------------------------------------------------------------------
test('FE-5b + FE-6: sign up → redirect to / → header shows avatar initials', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Test User');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  // Redirects to home
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Header shows avatar button (logged-in state, FE-6)
  await expect(page.getByRole('button', { name: /menu de test user/i })).toBeVisible({ timeout: 6_000 });

  // "Se connecter" link should NOT be visible
  await expect(page.getByRole('link', { name: /^se connecter$/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-3: Logout via avatar dropdown → header reverts to "Se connecter"
// ---------------------------------------------------------------------------
test('FE-3 + FE-6: logout via avatar dropdown → header shows "Se connecter"', async ({ page }) => {
  const email = uniqueEmail();

  // Sign up first
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Logout Test');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Open avatar dropdown
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
// ---------------------------------------------------------------------------
test('FE-2 full: login with valid credentials → home → avatar visible', async ({ page }) => {
  const email = uniqueEmail();
  const displayName = 'Login Flow';

  // Create account
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill(displayName);
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /créer mon compte/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  // Logout
  await page.getByRole('button', { name: /menu de login flow/i }).click();
  await page.getByRole('menuitem', { name: /déconnexion/i }).click();
  await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible({ timeout: 6_000 });

  // Now login at /connexion
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
// ---------------------------------------------------------------------------
test('FE-7: /inscription form is keyboard-submittable', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/inscription');

  // Tab to displayName, fill, tab to email, fill, tab to password, fill, Enter
  await page.getByLabel(/nom d'affichage/i).focus();
  await page.keyboard.type('Keyboard User');
  await page.keyboard.press('Tab');
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await page.keyboard.type('password123');
  await page.keyboard.press('Enter');

  // Should redirect to home on success
  await expect(page).toHaveURL('/', { timeout: 10_000 });
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
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page.getByRole('button', { name: /créer mon compte/i }).click();

  // Button should be disabled and show loading text
  const btn = page.getByRole('button', { name: /création/i });
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
});
