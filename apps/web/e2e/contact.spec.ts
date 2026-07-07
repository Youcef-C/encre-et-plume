/**
 * F-21 Acceptance e2e — Support & contact ("Aide & contact")
 *
 * Signed-out visitor flow against the real stack (API rate-limit disabled via
 * DISABLE_RATE_LIMIT=true in playwright.config.ts's webServer env, matching the
 * other auth-adjacent specs). Default storageState has no session cookie, so
 * every test here runs as an anonymous visitor.
 */

import { test, expect } from '@playwright/test';

test('FE: footer link "Aide & contact" reaches /contact when signed out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /aide & contact/i }).click();
  await expect(page).toHaveURL('/contact', { timeout: 8_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('FE: contact-info block shows support mailto, response window, abuse pointer', async ({
  page,
}) => {
  await page.goto('/contact');
  const mailto = page.getByRole('link', { name: /support@encre-et-plume\.fr/i });
  await expect(mailto).toHaveAttribute('href', 'mailto:support@encre-et-plume.fr');
  await expect(page.getByText(/48 h ouvrées/i)).toBeVisible();
  await expect(page.getByText(/bouton « Signaler »/i)).toBeVisible();
});

test('FE: "Signaler un bug" reveals the technical-context panel (url / UA / requestId)', async ({
  page,
}) => {
  await page.goto('/contact');
  // §8 — OnBrandSelect is a combobox listbox (no native <select>): open the trigger, click the option.
  await page.getByLabel(/sujet/i).click();
  await page.getByRole('option', { name: 'Signaler un bug' }).click();
  const panel = page.getByTestId('bug-context');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Page/i)).toBeVisible();
  await expect(panel.getByText(/Navigateur/i)).toBeVisible();
});

test('FE: full submit flow — fill bug report, submit, see success, reset with "Nouveau message"', async ({
  page,
}) => {
  await page.goto('/contact');

  // §8 — OnBrandSelect is a combobox listbox (no native <select>): open the trigger, click the option.
  await page.getByLabel(/sujet/i).click();
  await page.getByRole('option', { name: 'Signaler un bug' }).click();
  await expect(page.getByTestId('bug-context')).toBeVisible();

  await page.getByLabel(/^nom/i).fill('QA Visitor');
  await page.getByLabel(/e-mail/i).fill('qa-visitor@test.com');
  await page.getByLabel(/message/i).fill('Le lecteur plante à la page 3.');

  const submit = page.getByRole('button', { name: /^envoyer$/i });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(
    page.getByText('Message envoyé — nous vous répondrons par e-mail.'),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /nouveau message/i }).click();
  // Blank form returns — signed-out submitters keep no prefill.
  await expect(page.getByLabel(/^nom/i)).toHaveValue('');
  await expect(page.getByLabel(/message/i)).toHaveValue('');
});

test('FE: honeypot field is present but hidden from real users', async ({ page }) => {
  await page.goto('/contact');
  const honeypot = page.locator('input[name="website"]');
  await expect(honeypot).toHaveAttribute('aria-hidden', 'true');
  await expect(honeypot).toHaveAttribute('tabindex', '-1');
});

test('FE-8: no horizontal overflow on /contact at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
