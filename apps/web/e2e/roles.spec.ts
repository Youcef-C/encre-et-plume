/**
 * F-2 Role model & differentiated access — e2e acceptance suite
 *
 * Covers:
 *   FE-AC2/3/5/6/7  — role-gated nav links, demo switcher, keyboard, hidden-not-disabled
 *   FE-AC4/6        — editor banner + verified pill (pill absent for new account verified=false)
 *   BE-AC2/3/4/5/6/7 — /auth/me verified field, PATCH /accounts/:id/role authz
 *
 * Accounts are seeded in beforeAll via global-setup.ts (Prisma, no signup rate-limit hit).
 * DB connection and API base come from env vars — no hardcoded hosts/ports.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';

// Loaded at module scope after globalSetup has written the file.
const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

// Path to the Prisma-based role-setter script (no psql, no hardcoded DB URL).
const SET_ROLE_SCRIPT = path.join(__dirname, '../../api/prisma/e2e-set-role.js');

/** Update an account's role directly via Prisma. Synchronous (execFileSync waits for exit). */
function dbSetRole(id: string, role: string) {
  execFileSync('node', [SET_ROLE_SCRIPT, id, role], {
    env: { ...process.env },
    stdio: 'ignore',
  });
}

/** Log in via the API and authenticate the Playwright HTTP context */
async function loginAs(ctx: APIRequestContext, account: { email: string; id: string }) {
  const res = await ctx.post(`${API}/auth/login`, {
    data: { email: account.email, password: PASSWORD },
  });
  if (res.status() !== 200) {
    const body = await res.text();
    throw new Error(`loginAs failed for ${account.email}: ${res.status()} ${body}`);
  }
  return res;
}

/**
 * FE helper: mock /auth/me so the UI renders as logged-in without hitting the API.
 * Uses page.route() to intercept the SessionProvider's fetch on mount.
 */
async function mockLoginAndLandHome(page: Page, displayName: string, verified = false) {
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-' + Math.random().toString(36).slice(2, 7),
          email: 'mock@test.com',
          displayName,
          role: 'utilisateur',
          verified,
          createdAt: new Date().toISOString(),
        }),
      });
    } else {
      await route.continue();
    }
  });
  // Intercept logout to prevent 401 noise
  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: new RegExp(`menu de ${displayName}`, 'i') }),
  ).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// API-level tests (BE-AC2/3/4/5/6/7)
// ---------------------------------------------------------------------------

test('BE-AC3 / BE-AC6: unauthenticated PATCH /accounts/:id/role → 401', async ({ request }) => {
  // No login → unauthenticated context
  // Use a known valid target ID to isolate authz behavior from 404
  const res = await request.patch(`${API}/accounts/${ACCOUNTS.TARGET.id}/role`, {
    data: { role: 'maintainer' },
  });
  expect(res.status()).toBe(401);
});

test('BE-AC3 / BE-AC6: non-admin (utilisateur) PATCH /accounts/:id/role → 403', async ({
  request,
}) => {
  dbSetRole(ACCOUNTS.UTILISATEUR.id, 'utilisateur'); // idempotent reset
  await loginAs(request, ACCOUNTS.UTILISATEUR);

  const res = await request.patch(`${API}/accounts/${ACCOUNTS.TARGET.id}/role`, {
    data: { role: 'admin' },
  });
  expect(res.status()).toBe(403);
});

test('BE-AC4 / BE-AC7: admin PATCH /accounts/:id/role → 200, role updated in response', async ({
  request,
}) => {
  dbSetRole(ACCOUNTS.ADMIN.id, 'admin');
  dbSetRole(ACCOUNTS.TARGET.id, 'utilisateur'); // reset target to utilisateur
  await loginAs(request, ACCOUNTS.ADMIN);

  const patchRes = await request.patch(`${API}/accounts/${ACCOUNTS.TARGET.id}/role`, {
    data: { role: 'maintainer' },
  });
  expect(patchRes.status()).toBe(200);
  const updated = await patchRes.json();
  expect(updated.role).toBe('maintainer');
  expect(updated.id).toBe(ACCOUNTS.TARGET.id);

  // Cleanup: restore target
  dbSetRole(ACCOUNTS.TARGET.id, 'utilisateur');
});

test('BE-AC4: PATCH /accounts/:id/role with invalid role value → 400', async ({ request }) => {
  dbSetRole(ACCOUNTS.ADMIN2.id, 'admin');
  await loginAs(request, ACCOUNTS.ADMIN2);

  const res = await request.patch(`${API}/accounts/${ACCOUNTS.TARGET.id}/role`, {
    data: { role: 'superuser' }, // invalid value
  });
  expect(res.status()).toBe(400);
});

test('BE-AC4: PATCH /accounts/unknown-id/role → 404', async ({ request }) => {
  dbSetRole(ACCOUNTS.ADMIN3.id, 'admin');
  await loginAs(request, ACCOUNTS.ADMIN3);

  const res = await request.patch(`${API}/accounts/nonexistent-cuid-9999/role`, {
    data: { role: 'maintainer' },
  });
  expect(res.status()).toBe(404);
});

test('BE-AC5: unverified editor on admin-only route → 403 (editor not in @Roles("admin"))', async ({
  request,
}) => {
  // RolesGuard reads fresh from Prisma; editor role check fails before verified check
  dbSetRole(ACCOUNTS.EDITOR.id, 'editor'); // verified=false is DB default
  await loginAs(request, ACCOUNTS.EDITOR);

  const res = await request.patch(`${API}/accounts/${ACCOUNTS.TARGET.id}/role`, {
    data: { role: 'utilisateur' },
  });
  expect(res.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// BE-AC2: GET /auth/me returns verified field
// ---------------------------------------------------------------------------

test('BE-AC2: GET /auth/me includes verified:false for new account', async ({ request }) => {
  dbSetRole(ACCOUNTS.FRESH.id, 'utilisateur'); // ensure clean state
  await loginAs(request, ACCOUNTS.FRESH);

  const meRes = await request.get(`${API}/auth/me`);
  expect(meRes.status()).toBe(200);
  const me = await meRes.json();
  // /auth/me returns AccountSummary directly (not wrapped in { account: ... })
  expect(me.verified).toBe(false);
  expect(me.role).toBe('utilisateur');
});

// ---------------------------------------------------------------------------
// UI tests — role-gated nav links + demo switcher (FE-AC2/3/5/6/7)
// ---------------------------------------------------------------------------

test('FE-AC6: utilisateur sees NO gated links in avatar dropdown by default', async ({ page }) => {
  await mockLoginAndLandHome(page, 'Default User');
  await page.getByRole('button', { name: /menu de default user/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  // None of the three gated links should be visible
  await expect(page.getByRole('menuitem', { name: /espace éditeur/i })).not.toBeVisible();
  await expect(page.getByRole('menuitem', { name: /espace rédaction/i })).not.toBeVisible();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();
});

test('FE-AC5 / FE-AC2: demo switcher "Admin" reveals "Panneau admin", hides others', async ({
  page,
}) => {
  await mockLoginAndLandHome(page, 'Switcher Admin');
  await page.getByRole('button', { name: /menu de switcher admin/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  // Click "Admin" demo button
  await page.getByRole('button', { name: /^admin$/i }).click();

  // "Panneau admin" link should now appear
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).toBeVisible();
  // Others still absent (FE-AC6: hidden not disabled)
  await expect(page.getByRole('menuitem', { name: /espace éditeur/i })).not.toBeVisible();
  await expect(page.getByRole('menuitem', { name: /espace rédaction/i })).not.toBeVisible();
});

test('FE-AC5 / FE-AC2: demo switcher "Éditeur" reveals "Espace éditeur"', async ({ page }) => {
  await mockLoginAndLandHome(page, 'Switcher Editeur');
  await page.getByRole('button', { name: /menu de switcher editeur/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  await page.getByRole('button', { name: /^éditeur$/i }).click();
  await expect(page.getByRole('menuitem', { name: /espace éditeur/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();
});

test('FE-AC5 / FE-AC2: demo switcher "Rédacteur" reveals "Espace rédaction"', async ({ page }) => {
  await mockLoginAndLandHome(page, 'Switcher Redacteur');
  await page.getByRole('button', { name: /menu de switcher redacteur/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  await page.getByRole('button', { name: /^rédacteur$/i }).click();
  await expect(page.getByRole('menuitem', { name: /espace rédaction/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();
});

test('FE-AC5 / FE-AC6: switching back to "Lecteur" hides all gated links', async ({ page }) => {
  await mockLoginAndLandHome(page, 'Back To Lecteur');
  await page.getByRole('button', { name: /menu de back to lecteur/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  // Go Admin first
  await page.getByRole('button', { name: /^admin$/i }).click();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).toBeVisible();

  // Switch back to Lecteur
  await page.getByRole('button', { name: /^lecteur$/i }).click();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();
  await expect(page.getByRole('menuitem', { name: /espace éditeur/i })).not.toBeVisible();
  await expect(page.getByRole('menuitem', { name: /espace rédaction/i })).not.toBeVisible();
});

// FE-AC3: Admin-only "Panneau admin" link is absent for non-admin
test('FE-AC3: "Panneau admin" absent for non-admin roles', async ({ page }) => {
  await mockLoginAndLandHome(page, 'Non Admin FE');
  await page.getByRole('button', { name: /menu de non admin fe/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  // Switch to editor — no "Panneau admin"
  await page.getByRole('button', { name: /^éditeur$/i }).click();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();

  // Switch to maintainer — no "Panneau admin"
  await page.getByRole('button', { name: /^rédacteur$/i }).click();
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-AC4 / FE-AC6: editor banner + verified pill
// ---------------------------------------------------------------------------

test('FE-AC4: editor banner visible when role simulated as Éditeur', async ({ page }) => {
  await mockLoginAndLandHome(page, 'Banner Test');
  await page.getByRole('button', { name: /menu de banner test/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  await page.getByRole('button', { name: /^éditeur$/i }).click();

  // Banner should appear outside the dropdown
  await expect(page.getByText("Connecté·e en tant qu'Éditeur · Maison partenaire")).toBeVisible();
});

test('FE-AC6: "✓ compte vérifié" pill ABSENT for unverified editor (verified=false)', async ({
  page,
}) => {
  await mockLoginAndLandHome(page, 'Unverified Editor', false /* verified */);
  await page.getByRole('button', { name: /menu de unverified editor/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  await page.getByRole('button', { name: /^éditeur$/i }).click();

  // Banner appears
  await expect(page.getByText("Connecté·e en tant qu'Éditeur · Maison partenaire")).toBeVisible();
  // Pill is absent (account.verified === false)
  await expect(page.getByText(/✓ compte vérifié/i)).not.toBeVisible();
});

test('FE-AC6: editor banner absent when role is utilisateur', async ({ page }) => {
  await mockLoginAndLandHome(page, 'No Banner');
  // Don't switch role — stays as utilisateur
  await expect(page.getByText("Connecté·e en tant qu'Éditeur · Maison partenaire")).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-AC7: demo switcher keyboard accessibility
// ---------------------------------------------------------------------------

test('FE-AC7: demo switcher buttons are focusable and activatable via keyboard', async ({
  page,
}) => {
  await mockLoginAndLandHome(page, 'Keyboard Nav');
  await page.getByRole('button', { name: /menu de keyboard nav/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  // Focus the "Admin" demo button and press Enter
  const adminBtn = page.getByRole('button', { name: /^admin$/i });
  await adminBtn.focus();
  await page.keyboard.press('Enter');

  // "Panneau admin" should appear — keyboard activation worked
  await expect(page.getByRole('menuitem', { name: /panneau admin/i })).toBeVisible();

  // Buttons have aria-label (keyboard navigation context)
  await expect(adminBtn).toHaveAttribute('aria-label', 'Admin');
  await expect(page.getByRole('button', { name: /^lecteur$/i })).toHaveAttribute(
    'aria-label',
    'Lecteur',
  );
});

test('FE-AC7: switcher fieldset has aria-label "Changer de rôle (démo)"', async ({ page }) => {
  await mockLoginAndLandHome(page, 'Aria Label');
  await page.getByRole('button', { name: /menu de aria label/i }).click();
  await expect(page.getByRole('menu')).toBeVisible();

  // The fieldset (role=group) should have the right label
  const group = page.getByRole('group', { name: /changer de rôle \(démo\)/i });
  await expect(group).toBeVisible();
});

// ---------------------------------------------------------------------------
// FE-AC2: gated stub routes resolve (links point to real pages)
// ---------------------------------------------------------------------------

test('FE-AC2: /espace-editeur stub page loads', async ({ page }) => {
  await page.goto('/espace-editeur');
  await expect(page.getByText(/espace éditeur/i)).toBeVisible();
});

test('FE-AC2: /espace-redaction stub page loads', async ({ page }) => {
  await page.goto('/espace-redaction');
  await expect(page.getByText(/espace rédaction/i)).toBeVisible();
});

test('FE-AC2: /admin stub page loads', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText(/panneau admin/i)).toBeVisible();
});
