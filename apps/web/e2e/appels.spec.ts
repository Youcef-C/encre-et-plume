/**
 * MC-1 §11 — minimal "Appels à projets" board (`/appels`) e2e acceptance suite.
 *
 * Real backend + seeded dev DB (same convention as trouver.spec.ts — not hermetic, the point is
 * to exercise the real GET /calls integration + auth gate). Login as
 * camille.roux@seed.encre-et-plume.local / password123.
 * The navbar "Trouver" dropdown itself (entry point to /appels + active-state-on-both-routes) is
 * covered in header.spec.ts (MC1-E2E-NAV / NAV-2 / NAV-3).
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const CAMILLE_EMAIL = 'camille.roux@seed.encre-et-plume.local';

async function loginAsCamille(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(CAMILLE_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

test('MC1-APPELS-1: logged-in visit shows the 2 seeded calls (reusing GET /calls + CallsPreview cards)', async ({
  page,
}) => {
  await loginAsCamille(page);
  await page.goto('/appels');
  await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
  await expect(page.getByText('« Lames de Brume »')).toBeVisible();
  await expect(page.getByText('Clôture 12 j')).toBeVisible();
  await expect(page.getByText('One-shot fantastique')).toBeVisible();
  await expect(page.getByText('5 candidatures')).toBeVisible();
  // No new backend / no board heading duplicated inside CallsPreview when hideHeader is used.
  await expect(page.getByRole('heading', { name: 'Appels à projets' })).toHaveCount(1);
});

test('MC1-APPELS-2: logged-out visit shows the connect prompt, not the calls', async ({ page }) => {
  await page.goto('/appels');
  await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
  await expect(page.getByText('Connectez-vous pour parcourir les appels à projets.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
    'href',
    '/connexion?redirect=/appels',
  );
  await expect(page.getByText('« Lames de Brume »')).not.toBeVisible();
});

test('MC1-APPELS-3: 375px viewport has no horizontal overflow', async ({ page }) => {
  await loginAsCamille(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/appels');
  await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);
});
