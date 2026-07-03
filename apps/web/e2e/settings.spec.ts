/**
 * F-19 — Application settings "Paramètres" — Playwright e2e suite
 *
 * Hermetic: each test creates its own fresh account via the API signup + dev-latest
 * verify seam (same pattern as security.spec.ts / privacy.spec.ts).
 *
 * Scope: this story is a pure surface reorganization — page structure, the new
 * Cookies section, and the in-page nav. 2FA/password/email/session
 * mechanics are F-18's e2e (security.spec.ts) and are NOT re-tested here.
 *
 * Tests:
 *   F19-E2E-1  Structure: one h1 "Paramètres", four h2s in order, nav with 4 links
 *   F19-E2E-3  Cookies: consent summary reflects saved choice; "Gérer les cookies" reopens banner
 *   F19-E2E-4  Nav anchors: clicking a nav link scrolls to the matching section
 *   F19-E2E-5  Responsive: /parametres at 375/768/1280 — no horizontal overflow, nav wraps
 */

import { test, expect, type Page } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const PASSWORD = 'password123';

// ── Account helpers (same pattern as security.spec.ts) ────────────────────────

function freshEmail(tag = 'f19'): string {
  return `qa_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;
}

function slugFrom(email: string): string {
  return email.split('@')[0].replace(/[^a-z0-9-]/g, '-').slice(0, 28);
}

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

// ── F19-E2E-1: Page structure ──────────────────────────────────────────────────

test('F19-E2E-1: /parametres has one h1, four h2s in order, and a section nav with 4 links', async ({
  page,
}) => {
  const email = freshEmail('f19-struct');
  await signUpVerifyAndLogin(page, email, 'F19 Structure');

  await page.goto('/parametres');

  // One h1 "Paramètres"
  const h1s = page.getByRole('heading', { level: 1 });
  await expect(h1s).toHaveCount(1);
  await expect(h1s.first()).toHaveText('Paramètres');

  // Four h2s in exact story order (Apparence removed — theme picker disabled, light forced)
  const h2s = page.getByRole('heading', { level: 2 });
  await expect(h2s).toHaveCount(4, { timeout: 10_000 });
  await expect(h2s.nth(0)).toHaveText('Préférences de notification');
  await expect(h2s.nth(1)).toHaveText('Cookies');
  await expect(h2s.nth(2)).toHaveText('Sécurité');
  await expect(h2s.nth(3)).toHaveText('Mes données');

  // Section nav landmark with its 4 links, in order
  const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
  await expect(nav).toBeVisible();
  const links = nav.getByRole('link');
  await expect(links).toHaveCount(4);
  await expect(links.nth(0)).toHaveText('Préférences de notification');
  await expect(links.nth(0)).toHaveAttribute('href', '#notifications');
  await expect(links.nth(1)).toHaveText('Cookies');
  await expect(links.nth(1)).toHaveAttribute('href', '#cookies');
  await expect(links.nth(2)).toHaveText('Sécurité');
  await expect(links.nth(2)).toHaveAttribute('href', '#securite');
  await expect(links.nth(3)).toHaveText('Mes données');
  await expect(links.nth(3)).toHaveAttribute('href', '#mes-donnees');
});

// ── F19-E2E-3: Cookies section summary + "Gérer les cookies" reopens the banner ─

test('F19-E2E-3: Cookies section shows consent summary and "Gérer les cookies" reopens the F-13 banner', async ({
  page,
}) => {
  const email = freshEmail('f19-cookies');
  await signUpVerifyAndLogin(page, email, 'F19 Cookies');

  // storageState pre-seeds ep_cookie_consent = {audience:false, thirdParty:false}
  await page.goto('/parametres');

  const cookiesSection = page.locator('#cookies');
  await expect(cookiesSection.getByRole('heading', { name: 'Cookies' })).toBeVisible({
    timeout: 10_000,
  });

  // Essentiels always-on copy
  await expect(cookiesSection.getByText(/toujours actifs/i)).toBeVisible();

  // Summary reflects the saved choice (audience: false, thirdParty: false → both "Désactivés")
  const audienceRow = cookiesSection.getByText(/mesure d'audience/i).locator('..');
  await expect(audienceRow).toContainText(/désactivés/i);
  const thirdPartyRow = cookiesSection.getByText(/contenus tiers/i).locator('..');
  await expect(thirdPartyRow).toContainText(/désactivés/i);

  // Banner is not shown by default (consent already saved)
  await expect(page.getByRole('dialog', { name: 'Gestion des cookies' })).not.toBeVisible();

  // Click "Gérer les cookies" → the F-13 banner reopens
  await cookiesSection.getByRole('button', { name: 'Gérer les cookies' }).click();
  const banner = page.getByRole('dialog', { name: 'Gestion des cookies' });
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner.getByRole('button', { name: /tout accepter/i })).toBeVisible();

  // Accept all → banner closes, summary now reflects "Activés" for both categories
  await banner.getByRole('button', { name: /tout accepter/i }).click();
  await expect(banner).not.toBeVisible({ timeout: 5_000 });
  await expect(audienceRow).toContainText(/activés/i, { timeout: 5_000 });
  await expect(thirdPartyRow).toContainText(/activés/i);
});

// ── F19-E2E-4: Nav anchors scroll to the matching section ──────────────────────

test('F19-E2E-4: clicking a section-nav link scrolls to the matching section', async ({
  page,
}) => {
  const email = freshEmail('f19-nav');
  await signUpVerifyAndLogin(page, email, 'F19 Nav');

  await page.goto('/parametres');

  const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
  await nav.getByRole('link', { name: 'Mes données' }).click();

  // The URL hash updates and the target section is scrolled into view
  await expect(page).toHaveURL(/#mes-donnees$/);
  await expect(async () => {
    const inView = await page.evaluate(() => {
      const el = document.getElementById('mes-donnees');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    });
    expect(inView).toBe(true);
  }).toPass({ timeout: 5_000 });

  // "Current section indicated": the IntersectionObserver-driven scroll-spy sets
  // aria-current="location" on the nav link matching the visible section (real
  // browser, unlike jsdom where it's guarded off).
  await expect(nav.getByRole('link', { name: 'Mes données' })).toHaveAttribute(
    'aria-current',
    'location',
    { timeout: 5_000 },
  );
});

// ── F19-E2E-5: Responsive — 375/768/1280 ────────────────────────────────────────

const VIEWPORTS = [
  { width: 375, height: 812, label: 'mobile-375' },
  { width: 768, height: 1024, label: 'tablet-768' },
  { width: 1280, height: 900, label: 'desktop-1280' },
] as const;

for (const vp of VIEWPORTS) {
  test(`F19-E2E-5 responsive: /parametres at ${vp.label} — no overflow, nav usable`, async ({
    page,
  }) => {
    const email = freshEmail('f19-resp');
    await signUpVerifyAndLogin(page, email, 'F19 Responsive');

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/parametres');

    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible({
      timeout: 10_000,
    });

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // Nav is visible with all 4 links reachable (wraps at mobile widths, no overflow)
    const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(4);

    // Tap targets: nav links stay >= 40px tall (44px target, small tolerance) at mobile
    if (vp.width === 375) {
      const firstLinkBox = await nav.getByRole('link').first().boundingBox();
      expect(firstLinkBox?.height ?? 0).toBeGreaterThanOrEqual(40);
    }

    // Sections are all reachable (present in the DOM)
    for (const id of ['notifications', 'cookies', 'securite', 'mes-donnees']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }

    await page.screenshot({
      path: `e2e/screenshots/settings-${vp.width}.png`,
      fullPage: true,
    });
  });
}
