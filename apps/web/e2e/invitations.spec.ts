/**
 * MC-3 (receive side) — Invitations inbox (/invitations).
 *
 * Real backend (no route mocking): proves GET /invitations?direction=received + PATCH /invitations/:id
 * actually drive the inbox, that the avatar-dropdown entry routes there, that responding flips the
 * status server-side, that the status filter chips work, and that an invitation notification links to
 * /invitations (the NOTIF_HREF fix).
 *
 * Dedicated INV_INBOX / INV_FROM_A / INV_FROM_B fixture accounts (apps/api/prisma/e2e-seed.js) — no
 * other spec references them, so a parallel sibling can't disturb the absolute status/count/filter
 * assertions here. INV_INBOX starts with: 1 pending (from A, dessinateur → "écrire", has a project),
 * 1 accepted (from B), 1 declined (from B), and one unread invitation notification.
 *
 * Hermeticity traps (per the repo memory): a stale API on :3001 makes every assertion fail confusingly
 * (kill it + flush `rl:*` before running); Postgres is on :5433.
 *
 * Scope note (CLAUDE.md): only this story's spec + the auth/nav smoke run per story; the full e2e
 * suite runs at epic boundaries.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';

const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

async function loginViaCookie(page: Page, email: string, namePattern: RegExp) {
  const res = await page.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  if (res.status() !== 200) {
    throw new Error(`login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  await page.goto('/');
  await expect(page.getByRole('button', { name: namePattern })).toBeVisible({ timeout: 10_000 });
}

const INBOX = /menu de e2e inv_inbox/i;

// Single mutating account across the file — run in declared order (inbox/filter assert the pending
// row that the Accepter test then consumes).
test.describe.configure({ mode: 'serial' });

test('MC3-E2E: avatar dropdown → Invitations shows the received inbox', async ({ page }) => {
  await loginViaCookie(page, ACCOUNTS.INV_INBOX.email, INBOX);

  await page.getByRole('button', { name: INBOX }).click();
  const entry = page.getByRole('menuitem', { name: /^invitations$/i });
  await expect(entry).toBeVisible({ timeout: 6_000 });
  await expect(entry).toHaveAttribute('href', '/invitations');
  await entry.click();

  await expect(page).toHaveURL('/invitations', { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible();
  await expect(page.getByText('Toutes les propositions de collaboration reçues.')).toBeVisible();

  // A is a dessinateur → invites to "écrire"; three rows total (pending, accepted, declined).
  await expect(page.getByText(/vous invite à écrire/).first()).toBeVisible();
  await expect(page.getByText('● En attente')).toBeVisible();
  await expect(page.getByText('✓ Acceptée')).toBeVisible();
  await expect(page.getByText('✕ Refusée')).toBeVisible();
});

test('MC3-E2E: Accepter flips the status (server-side)', async ({ page }) => {
  await loginViaCookie(page, ACCOUNTS.INV_INBOX.email, INBOX);
  await page.goto('/invitations');
  await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible();

  await page.getByRole('button', { name: 'Accepter' }).click();

  // Two accepted rows now (the pre-seeded one + the just-accepted). No more pending badge.
  await expect(page.getByText('✓ Acceptée')).toHaveCount(2, { timeout: 8_000 });
  await expect(page.getByText('● En attente')).toHaveCount(0);

  // Persisted: a reload keeps it accepted.
  await page.reload();
  await expect(page.getByText('✓ Acceptée')).toHaveCount(2, { timeout: 8_000 });
  await expect(page.getByRole('button', { name: 'Accepter' })).toHaveCount(0);
});

test('MC3-E2E: status filter chips filter client-side', async ({ page }) => {
  await loginViaCookie(page, ACCOUNTS.INV_INBOX.email, INBOX);
  await page.goto('/invitations');
  await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible();

  // "Refusées" chip → only the declined row remains.
  await page.getByRole('button', { name: /Refusées/ }).click();
  await expect(page.getByText('✕ Refusée')).toBeVisible();
  await expect(page.getByText('✓ Acceptée')).toHaveCount(0);

  // Back to "Toutes".
  await page.getByRole('button', { name: /Toutes/ }).click();
  await expect(page.getByText('✕ Refusée')).toBeVisible();
  await expect(page.getByText('✓ Acceptée').first()).toBeVisible();
});

test('MC3-E2E: an invitation notification links to /invitations', async ({ page }) => {
  await loginViaCookie(page, ACCOUNTS.INV_INBOX.email, INBOX);
  await page.goto('/notifications');

  const notif = page.getByRole('button').filter({ hasText: /invité·e à collaborer/i }).first();
  await expect(notif).toBeVisible({ timeout: 8_000 });
  await notif.click();
  await expect(page).toHaveURL('/invitations', { timeout: 10_000 });
});
