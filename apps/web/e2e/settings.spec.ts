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
 *   F19-E2E-1  Structure: one h1 "Paramètres", six h2s in order, nav with 6 links
 *   F19-E2E-3  Cookies: consent summary reflects saved choice; "Gérer les cookies" reopens banner
 *   F19-E2E-4  Nav anchors: clicking a nav link scrolls to the matching section
 *   F19-E2E-5  Responsive: /parametres at 375/768/1280 — no horizontal overflow, nav wraps
 *   F19-E2E-6  Collapsible sections: summary click collapses, nav click re-expands
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

// ── F19-E2E-1: Page structure ──────────────────────────────────────────────────

test('F19-E2E-1: /parametres has one h1, seven h2s in order, and a section nav with 7 links', async ({
  page,
}) => {
  const email = freshEmail('f19-struct');
  await signUpVerifyAndLogin(page, email, 'F19 Structure');

  await page.goto('/parametres');

  // One h1 "Paramètres"
  const h1s = page.getByRole('heading', { level: 1 });
  await expect(h1s).toHaveCount(1);
  await expect(h1s.first()).toHaveText('Paramètres');

  // Seven h2s in exact story order (Apparence removed — theme picker disabled, light forced;
  // Confidentialité added by F-19/MC-9; Contenu 18+ added by DR-10; Comptes bloqués added by MC-10)
  const h2s = page.getByRole('heading', { level: 2 });
  await expect(h2s).toHaveCount(7, { timeout: 10_000 });
  await expect(h2s.nth(0)).toHaveText('Préférences de notification');
  await expect(h2s.nth(1)).toHaveText('Confidentialité');
  await expect(h2s.nth(2)).toHaveText('Cookies');
  await expect(h2s.nth(3)).toHaveText('Sécurité');
  await expect(h2s.nth(4)).toHaveText('Contenu 18+');
  await expect(h2s.nth(5)).toHaveText('Comptes bloqués');
  await expect(h2s.nth(6)).toHaveText('Mes données');

  // Section nav landmark with its 7 links, in order
  const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
  await expect(nav).toBeVisible();
  const links = nav.getByRole('link');
  await expect(links).toHaveCount(7);
  await expect(links.nth(0)).toHaveText('Préférences de notification');
  await expect(links.nth(0)).toHaveAttribute('href', '#notifications');
  await expect(links.nth(1)).toHaveText('Confidentialité');
  await expect(links.nth(1)).toHaveAttribute('href', '#confidentialite');
  await expect(links.nth(2)).toHaveText('Cookies');
  await expect(links.nth(2)).toHaveAttribute('href', '#cookies');
  await expect(links.nth(3)).toHaveText('Sécurité');
  await expect(links.nth(3)).toHaveAttribute('href', '#securite');
  await expect(links.nth(4)).toHaveText('Contenu 18+');
  await expect(links.nth(4)).toHaveAttribute('href', '#contenu-adulte');
  await expect(links.nth(5)).toHaveText('Comptes bloqués');
  await expect(links.nth(5)).toHaveAttribute('href', '#comptes-bloques');
  await expect(links.nth(6)).toHaveText('Mes données');
  await expect(links.nth(6)).toHaveAttribute('href', '#mes-donnees');
});

// ── DR-10: Contenu 18+ section — status + birthdate set + revoke clearance ─────

test('DR-10: Contenu 18+ section lets a signed-in adult set their birthdate and revoke the device clearance', async ({
  page,
}) => {
  const email = freshEmail('f19-adult');
  await signUpVerifyAndLogin(page, email, 'F19 Adult');

  await page.goto('/parametres');

  const section = page.locator('#contenu-adulte');
  await expect(section.getByRole('heading', { name: 'Contenu 18+' })).toBeVisible({
    timeout: 10_000,
  });

  // Signup already set an adult birthdate (1990-01-01) -> status shows access granted
  await expect(
    section.getByText('Vous avez accès au contenu réservé aux adultes (18+).'),
  ).toBeVisible();

  // Prefilled from GET /accounts/me/birthdate with the signup value
  await expect(section.getByLabel(/date de naissance/i)).toHaveValue('1990-01-01', {
    timeout: 10_000,
  });

  // Update birthdate to a fresh valid value
  await section.getByLabel(/date de naissance/i).fill('1985-05-05');
  await section.getByRole('button', { name: /mettre à jour/i }).click();
  await expect(section.getByText('Date de naissance mise à jour.')).toBeVisible({
    timeout: 5_000,
  });

  // The typed value stays in the input (not cleared) after the successful update
  await expect(section.getByLabel(/date de naissance/i)).toHaveValue('1985-05-05');

  // The success message auto-clears after ~4s
  await expect(section.getByText('Date de naissance mise à jour.')).toBeHidden({
    timeout: 6_000,
  });

  // Revoke affordance starts disabled (no remembered clearance on this device yet)
  const revokeBtn = section.getByRole('button', { name: /réactiver la confirmation 18\+/i });
  await expect(revokeBtn).toBeDisabled();
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

  // Target Sécurité (tall, mid-page): the last section can bottom out before
  // reaching the scroll offset, which would make the position assertion flaky.
  const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
  await nav.getByRole('link', { name: 'Sécurité' }).click();

  // The URL hash updates and the target card's START lands below the sticky
  // header (68px) — regression test for the anchor scrolling past the card top.
  await expect(page).toHaveURL(/#securite$/);
  await expect(async () => {
    const top = await page.evaluate(() => {
      const el = document.getElementById('securite');
      return el ? el.getBoundingClientRect().top : NaN;
    });
    expect(top).toBeGreaterThanOrEqual(140); // fully clear of the header + sticky nav
    expect(top).toBeLessThanOrEqual(230); // and near the top of the viewport
  }).toPass({ timeout: 5_000 });

  // The section nav itself stays pinned right below the 68px header while scrolled
  const navBox = await nav.boundingBox();
  expect(navBox).not.toBeNull();
  if (navBox) {
    expect(navBox.y).toBeGreaterThanOrEqual(60);
    expect(navBox.y).toBeLessThanOrEqual(90);
  }

  // "Current section indicated": the IntersectionObserver-driven scroll-spy sets
  // aria-current="location" on the nav link matching the visible section (real
  // browser, unlike jsdom where it's guarded off).
  await expect(nav.getByRole('link', { name: 'Sécurité' })).toHaveAttribute(
    'aria-current',
    'location',
    { timeout: 5_000 },
  );

  // Accordion: the other sections collapsed when Sécurité was selected
  await expect(page.locator('details#securite')).toHaveAttribute('open', '');
  for (const other of ['notifications', 'cookies', 'contenu-adulte', 'comptes-bloques', 'mes-donnees']) {
    await expect(page.locator(`details#${other}`)).not.toHaveAttribute('open', '');
  }
});

// ── F19-E2E-6: Sections are collapsible; nav re-expands a collapsed section ────

test('F19-E2E-6: sections collapse via their header and a nav click re-expands them', async ({
  page,
}) => {
  const email = freshEmail('f19-collapse');
  await signUpVerifyAndLogin(page, email, 'F19 Collapse');

  await page.goto('/parametres');

  const cookiesSection = page.locator('details#cookies');
  const summary = cookiesSection.locator('summary');
  const manageBtn = cookiesSection.getByRole('button', { name: /gérer les cookies/i });

  // Expanded by default: content visible
  await expect(manageBtn).toBeVisible({ timeout: 10_000 });

  // Click the section header → collapses, content hidden
  await summary.click();
  await expect(cookiesSection).not.toHaveAttribute('open', '');
  await expect(manageBtn).toBeHidden();

  // Clicking the nav link re-expands the collapsed section (and collapses the others)
  const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
  await nav.getByRole('link', { name: 'Cookies' }).click();
  await expect(cookiesSection).toHaveAttribute('open', '');
  await expect(manageBtn).toBeVisible();
  for (const other of ['notifications', 'securite', 'contenu-adulte', 'comptes-bloques', 'mes-donnees']) {
    await expect(page.locator(`details#${other}`)).not.toHaveAttribute('open', '');
  }
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

    // Nav is visible with all 6 links reachable (wraps at mobile widths, no overflow)
    const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(6);

    // Tap targets: nav links stay >= 40px tall (44px target, small tolerance) at mobile
    if (vp.width === 375) {
      const firstLinkBox = await nav.getByRole('link').first().boundingBox();
      expect(firstLinkBox?.height ?? 0).toBeGreaterThanOrEqual(40);
    }

    // Sections are all reachable (present in the DOM)
    for (const id of ['notifications', 'cookies', 'securite', 'contenu-adulte', 'comptes-bloques', 'mes-donnees']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }

    await page.screenshot({
      path: `e2e/screenshots/settings-${vp.width}.png`,
      fullPage: true,
    });
  });
}
