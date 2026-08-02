/**
 * F-13 Acceptance e2e — Legal consent & pages
 *
 * Covers: FE-1 (signup consent), FE-2 (legal pages), FE-3 (cookie banner),
 * FE-4 (legal footer), FE-5 (re-consent modal), FE-6 (states),
 * FE-7 (accessibility), FE-8 (responsive), BE-5/BE-6 (API enforcement).
 *
 * Cookie-banner tests: the playwright config pre-seeds ep_cookie_consent so the
 * banner is suppressed in other specs. Tests that need the banner use
 * page.addInitScript() to remove the key before each navigation (the init script
 * runs before page JS so CookieConsentProvider sees no stored choice → isOpen=true).
 * For persistence tests a sessionStorage guard prevents the key being removed again
 * on reload (sessionStorage persists within a tab/navigation but is empty for every
 * new test page since each test gets a fresh context).
 */

import { test, expect } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

function uniqueEmail(): string {
  return `qa_f13_${Date.now()}_${Math.random().toString(36).slice(2, 5)}@test.com`;
}

function uniqueUsername(email: string): string {
  return email.split('@')[0]!.replace(/[^a-z0-9-]/g, '-');
}

/** Register an init script that removes ep_cookie_consent ONCE per tab session. */
async function clearConsentOnce(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // Guard: only remove on first navigation, not on reloads after a choice is stored.
    const KEY = 'ep_cookie_consent';
    const GUARD = '__ep_banner_test__';
    if (!sessionStorage.getItem(GUARD)) {
      localStorage.removeItem(KEY);
      sessionStorage.setItem(GUARD, '1');
    }
  });
}

// ---------------------------------------------------------------------------
// BE-5 / BE-6: API rejects acceptCgu:false with verbatim French error
// ---------------------------------------------------------------------------

test('BE-5/BE-6: POST /auth/signup with acceptCgu:false → 400 with French error message', async ({
  request,
}) => {
  const res = await request.post(`${API}/auth/signup`, {
    data: {
      displayName: 'CGU Test False',
      email: uniqueEmail(),
      password: 'password123',
      acceptCgu: false,
    },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  const msgs: string = Array.isArray(body.message)
    ? (body.message as string[]).join(' ')
    : String(body.message ?? '');
  expect(msgs).toMatch(/Vous devez accepter les conditions pour créer un compte/i);
});

// ---------------------------------------------------------------------------
// FE-1: Signup consent checkbox — disabled state + success flow
// ---------------------------------------------------------------------------

test('FE-1: submit button is disabled when CGU checkbox is unchecked', async ({ page }) => {
  await page.goto('/inscription');
  const btn = page.getByRole('button', { name: /créer mon compte/i });
  await expect(btn).toBeDisabled();
});

test('FE-1: CGU checkbox label links to /cgu and /confidentialite', async ({ page }) => {
  await page.goto('/inscription');
  // Scope to the signup form to avoid footer link ambiguity
  const form = page.getByRole('form', { name: /formulaire d'inscription/i });
  const cguLink = form.getByRole('link', { name: /conditions générales d'utilisation/i });
  const privLink = form.getByRole('link', { name: /politique de confidentialité/i });
  await expect(cguLink).toHaveAttribute('href', '/cgu');
  await expect(privLink).toHaveAttribute('href', '/confidentialite');
});

test('FE-1/FE-6: checking CGU checkbox enables submit; signup succeeds → /verifier-email/envoye', async ({
  page,
}) => {
  const email = uniqueEmail();
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('F13 CGU User');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/nom d'utilisateur/i).fill(uniqueUsername(email));
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  await page.getByLabel(/date de naissance/i).fill('1990-01-01');

  const btn = page.getByRole('button', { name: /créer mon compte/i });
  await expect(btn).toBeDisabled();

  await page.getByRole('checkbox', { name: /j'accepte les/i }).check();
  await expect(btn).toBeEnabled();

  await btn.click();
  await expect(page).toHaveURL(/\/verifier-email\/envoye/, { timeout: 10_000 });
});

// Defensive guard: the inline error fires when the form is submitted while unchecked
// (the button is disabled, but the form's onSubmit can be triggered programmatically)
test('FE-1/FE-6: inline CGU error shown when form submitted with unchecked checkbox', async ({
  page,
}) => {
  await page.goto('/inscription');
  await page.getByLabel(/nom d'affichage/i).fill('Inline Error Test');
  await page.getByLabel(/e-mail/i).fill('inline-test@test.com');
  await page.getByLabel(/^mot de passe$/i).fill('password123');
  await page.getByLabel(/confirmer le mot de passe/i).fill('password123');
  await page.getByLabel(/date de naissance/i).fill('1990-01-01');
  // Trigger form submit via requestSubmit (bypasses disabled button)
  await page.evaluate(
    () => (document.querySelector('form') as HTMLFormElement | null)?.requestSubmit(),
  );
  await expect(
    page.getByText(/Vous devez accepter les conditions pour créer un compte/i),
  ).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// FE-2 / FE-4: Legal pages accessible from the global footer
// ---------------------------------------------------------------------------

test('FE-4: legal footer present on home page with all required links and copyright', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^cgu$/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /politique de confidentialité/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /charte de la communauté/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /mentions légales/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /gérer les cookies/i })).toBeVisible();
  await expect(page.getByText(/© encre & plume/i)).toBeVisible();
});

test('FE-4/FE-2: footer CGU link → /cgu renders content and version', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^cgu$/i }).click();
  await expect(page).toHaveURL('/cgu', { timeout: 8_000 });
  // Legal page renders the document h1 + the version badge. The version string is owned by
  // prisma/legal-content.js (LEGAL_VERSION), so assert its shape, not a hardcoded value.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.ep-legal-version')).toHaveText(/^Version \S+ — /);
});

test('FE-4/FE-2: footer "Politique de confidentialité" → /confidentialite renders content', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: /politique de confidentialité/i }).click();
  await expect(page).toHaveURL('/confidentialite', { timeout: 8_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.ep-legal-version')).toHaveText(/^Version \S+ — /);
});

test('FE-4/FE-2: footer "Mentions légales" → /mentions-legales renders content', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: /mentions légales/i }).click();
  await expect(page).toHaveURL('/mentions-legales', { timeout: 8_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.ep-legal-version')).toHaveText(/^Version \S+ — /);
});

test('footer "Charte de la communauté" → /charte renders the real charte text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /charte de la communauté/i }).click();
  await expect(page).toHaveURL('/charte', { timeout: 8_000 });
  await expect(
    page.getByRole('heading', { level: 1, name: /charte de la communauté/i }),
  ).toBeVisible();
  await expect(page.locator('.ep-legal-version')).toHaveText(/^Version \S+ — /);
  // The charte links back to the CGU it is an integral part of.
  await expect(
    page.locator('.ep-legal-content a[href="/cgu"]').first(),
  ).toBeVisible();
});

test('the published legal documents carry the real drafted text, not the placeholder row', async ({
  page,
}) => {
  await page.goto('/cgu');
  // Article 3 of the drafted CGU — proves the seed loaded legal/cgu.md, not "[Contenu juridique …]".
  await expect(
    page.getByText(/case à cocher distincte et non pré-cochée/i).first(),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/\[Contenu juridique à valider/i)).toHaveCount(0);
  // Draft signalling stays visible while the placeholders are unfilled.
  await expect(page.getByText(/Version de travail/i).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-3: Cookie banner — use addInitScript to simulate first visit
// ---------------------------------------------------------------------------

test('FE-3: cookie banner shown on first visit (no stored consent)', async ({ page }) => {
  await clearConsentOnce(page);
  await page.goto('/');
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).toBeVisible({ timeout: 8_000 });
});

test('FE-3: "Tout accepter" hides banner and persists across page reload', async ({ page }) => {
  await clearConsentOnce(page);
  await page.goto('/');
  await page.getByRole('button', { name: /tout accepter/i }).click();
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).not.toBeVisible({ timeout: 4_000 });
  // Reload: init script guards via sessionStorage → does NOT remove consent → no banner
  await page.reload();
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).not.toBeVisible({ timeout: 4_000 });
});

test('FE-3: "Tout refuser" hides banner and persists across page reload', async ({ page }) => {
  await clearConsentOnce(page);
  await page.goto('/');
  await page.getByRole('button', { name: /tout refuser/i }).click();
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).not.toBeVisible({ timeout: 4_000 });
  await page.reload();
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).not.toBeVisible({ timeout: 4_000 });
});

test('FE-3: "Personnaliser" reveals three category toggles; "Enregistrer mes choix" closes banner', async ({
  page,
}) => {
  await clearConsentOnce(page);
  await page.goto('/');
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).toBeVisible({ timeout: 8_000 });

  await page.getByRole('button', { name: /personnaliser/i }).click();

  // Essentiels always-on (disabled checkbox), audience + tiers toggleable
  await expect(page.getByLabel(/essentiels/i)).toBeDisabled();
  await expect(page.getByLabel(/essentiels/i)).toBeChecked();
  await expect(page.getByLabel(/mesure d'audience/i)).toBeVisible();
  await expect(page.getByLabel(/contenus tiers/i)).toBeVisible();

  await page.getByRole('button', { name: /enregistrer mes choix/i }).click();
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).not.toBeVisible({ timeout: 4_000 });
});

test('FE-3/FE-4: "Gérer les cookies" footer button reopens the banner', async ({ page }) => {
  // Default storageState has consent stored → banner hidden on load
  await page.goto('/');
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: /gérer les cookies/i }).click();
  await expect(
    page.getByRole('dialog', { name: /gestion des cookies/i }),
  ).toBeVisible({ timeout: 4_000 });
});

// ---------------------------------------------------------------------------
// FE-7: Accessibility — banner must NOT steal focus on page load
// ---------------------------------------------------------------------------

test('FE-7: cookie banner is not focus-stealing on first visit', async ({ page }) => {
  await clearConsentOnce(page);
  await page.goto('/');
  // No networkidle wait: the header's unread-count poller keeps the network
  // busy forever, so it can never fire. The visible dialog is the real signal.
  const banner = page.getByRole('dialog', { name: /gestion des cookies/i });
  await expect(banner).toBeVisible({ timeout: 8_000 });

  const focusedInsideBanner = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Gestion des cookies"]');
    const focused = document.activeElement;
    if (!dialog || !focused) return false;
    return dialog.contains(focused);
  });
  expect(focusedInsideBanner).toBe(false);
});

// ---------------------------------------------------------------------------
// FE-5: Re-consent modal — mock needsCguReconsent=true via page.route()
// ---------------------------------------------------------------------------

test('FE-5: re-consent modal shown when needsCguReconsent=true; dismissed on accept', async ({
  page,
}) => {
  // Track call count so the first /auth/me returns needsCguReconsent:true,
  // and subsequent calls (after refresh) return false.
  let authMeCount = 0;

  await page.route('**/auth/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    authMeCount++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-rc-001',
        email: 'reconsent@test.com',
        displayName: 'Reconsent User',
        role: 'utilisateur',
        verified: false,
        emailVerified: true,
        slug: 'reconsent-user',
        avatar: null,
        createdAt: new Date().toISOString(),
        preferences: { theme: 'system', dmPolicy: 'requests' },
        needsCguReconsent: authMeCount === 1,
      }),
    });
  });

  // CguReconsentModal calls GET /legal/cgu to get the version before posting consent
  await page.route('**/legal/cgu', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'cgu',
        version: '1.1',
        content: '<h1>CGU v1.1</h1>',
        publishedAt: new Date().toISOString(),
      }),
    }),
  );

  // CguReconsentModal posts to /consents on acceptance
  await page.route('**/consents', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ recorded: true }),
    }),
  );

  await page.goto('/');
  const modal = page.getByRole('dialog', { name: /mise à jour de nos conditions/i });
  await expect(modal).toBeVisible({ timeout: 6_000 });

  // Only acceptance button should be present — no dismiss/close
  await expect(page.getByRole('button', { name: /fermer|annuler|plus tard/i })).not.toBeVisible();

  await page.getByRole('button', { name: /j'accepte/i }).click();
  await expect(modal).not.toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// FE-8: Responsive — no horizontal overflow; banner height at mobile
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { label: 'mobile-375', width: 375, height: 812 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1280', width: 1280, height: 800 },
] as const;

// All four documents, because /confidentialite and /charte carry the wide registers/tables that
// are the realistic overflow risk once the real text ships.
const LEGAL_ROUTES = ['/cgu', '/confidentialite', '/mentions-legales', '/charte'] as const;

for (const vp of VIEWPORTS) {
  for (const route of LEGAL_ROUTES) {
    test(`FE-8: no horizontal overflow on ${route} at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      // Wait for content to render before measuring
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 6_000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
    });
  }
}

test('FE-8: cookie banner at 375px does not cover the full viewport height', async ({ page }) => {
  await clearConsentOnce(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const banner = page.getByRole('dialog', { name: /gestion des cookies/i });
  await expect(banner).toBeVisible({ timeout: 8_000 });
  const bannerBox = await banner.boundingBox();
  expect(bannerBox).not.toBeNull();
  if (bannerBox) {
    // The banner must not cover the full viewport (max-height: 50vh → ≤ 406px at 812)
    expect(bannerBox.height).toBeLessThan(812);
    // Must not overflow horizontally
    expect(bannerBox.width).toBeLessThanOrEqual(375 + 2); // +2 for sub-pixel rounding
  }
});

test('FOOTER-1: footer sticks to the bottom of the viewport on short pages', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/connexion'); // short page: content alone doesn't fill the viewport
  const footer = page.locator('footer').first();
  await expect(footer).toBeVisible();
  const box = await footer.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    // Bottom edge of the footer reaches (roughly) the bottom of the viewport —
    // regression test for the footer floating mid-page on short pages.
    expect(box.y + box.height).toBeGreaterThanOrEqual(900 - 4);
  }
});
