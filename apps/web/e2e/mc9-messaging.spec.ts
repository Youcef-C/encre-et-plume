/**
 * MC-9 — Messaging (floating widget) + the BE-RT1 "realtime F-5 notifications" scope addition.
 *
 * Real backend + Redis adapter (no mocks) — the whole point of this suite is proving the socket.io
 * gateway actually fans out across two independent browser contexts. Hermeticity traps (heeded):
 *   - the gateway only exists on a FRESHLY BUILT+STARTED API — a stale :3001 makes every realtime
 *     assertion fail confusingly. QA killed stale servers + flushed `rl:*` before this run.
 *   - `apps/api/prisma/e2e-seed.js` (driven by global-setup.ts) seeds, for two DEDICATED e2e
 *     accounts (MSG_A ⇄ MSG_B), deterministic messaging fixtures:
 *       - a DM with 3 messages, the last 2 (from MSG_B) unread for MSG_A;
 *       - a group "Projet · Lames de Brume" (MSG_A + MSG_B + MSG_C) with 1 unread MSG_B
 *         message "nemu planche 4 prêt".
 *     → MSG_A's launcher badge starts at totalUnread = 3 (2 DM + 1 group).
 *
 * Isolation note (fixed a real CI flake): this suite used to read/assert this seeded state on the
 * SHARED hermetic accounts UTILISATEUR / TARGET / ADMIN. Six OTHER spec files (notifications,
 * profile, roles, media, onboarding, search) also log in as those same accounts, and CI runs spec
 * FILES in parallel — a sibling mutating UTILISATEUR's state mid-run flaked this suite's absolute
 * unread-count/message-count assertions (e.g. badge asserted "3 non lus", observed "1 non lus").
 * Fix: MSG_A/MSG_B/MSG_C/MSG_CONTACT/MSG_FRESH are dedicated to THIS spec — grep confirms no other
 * spec file references them — so no sibling can contaminate them regardless of run order/parallelism.
 *
 * Account map (from .e2e-accounts.json): MSG_A = "E2E MSG_A", MSG_B = "E2E MSG_B".
 * displayName is always `E2E ${KEY}` (e2e-seed.js) — used verbatim in list-row / preview assertions.
 *
 * For the realtime F-5 scope (RT-1/2/3) this suite uses ADMIN2 / ADMIN3 / MSG_FRESH. ADMIN2/ADMIN3
 * are only used here as connection-request SENDERS (their role is irrelevant to that); MSG_FRESH is
 * the dedicated (not roles.spec.ts-shared) recipient whose "zero pending requests" baseline must hold
 * regardless of what roles.spec.ts does to the shared FRESH account concurrently.
 * The "＋ Groupe" contact and the /contacts "Message" seam target both use the dedicated MSG_CONTACT
 * account (connected to MSG_A) instead of the shared ADMIN2, so neither reads state ADMIN2's other
 * consumers (roles.spec.ts mutates its role) could disturb.
 */
import { test, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { io, type Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';

const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

async function login(page: Page, email: string, namePattern: RegExp) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: namePattern })).toBeVisible({ timeout: 10_000 });
}

async function loginApi(ctx: APIRequestContext, email: string) {
  const res = await ctx.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  if (res.status() !== 200) {
    throw new Error(`loginApi failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}

async function sessionCookie(ctx: BrowserContext): Promise<string> {
  const cookies = await ctx.cookies();
  const c = cookies.find((c) => c.name === 'ep_session');
  if (!c) throw new Error('ep_session cookie not found — login must run first');
  return c.value;
}

/** Raw socket.io-client connected as the given account (protocol-level proof, independent of any page). */
function rawSocket(cookieValue: string): Socket {
  return io(API, {
    withCredentials: true,
    extraHeaders: { Cookie: `ep_session=${cookieValue}` },
    transports: ['polling', 'websocket'],
    forceNew: true,
  });
}

function waitForEvent<T = unknown>(socket: Socket, event: string, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload ?? (true as unknown as T));
    });
  });
}

const fab = (page: Page) => page.getByRole('button', { name: /^Messages/ });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Messages' });
// A row's accessible name is its bold conv.name — matched EXACTLY. Loose substring matching is unsafe
// here: a group row's preview embeds the sender's display name (e.g. "E2E MSG_B : nemu planche 4
// prêt"), which collides with a DM row literally named "E2E MSG_B".
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const rowByName = (page: Page, name: string) =>
  panel(page)
    .locator('button')
    .filter({ has: page.locator('b', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }) });

// Serial mode is configured PER describe block below (not file-wide): each block's tests are
// ordering-dependent on ONE ANOTHER (e.g. E3's mark-read is assumed by E6's unread math), but the
// blocks themselves are independent fixture domains. Playwright replays a WHOLE serial group from
// its start on any retry — a file-wide `test.describe.configure` would mean a flaky retry of, say,
// MC9-E6 replays E1-E5 too, rerunning E1's "pristine badge" assertion against fixture state already
// mutated by the first (failed) attempt's E2-E5/E6/E7. Scoping serial per block confines a retry to
// only the group that actually failed, so a sibling group's already-seeded assertions can't drift.

// ─────────────────────────────────────────────────────────────────────────────
// Core widget: anatomy, states, a11y, responsive (single MSG_A context)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-9 widget anatomy — MSG_A (seeded unread fixtures)', () => {
  test.describe.configure({ mode: 'serial' });

  test('MC9-E0: logged-out — no launcher bubble anywhere', async ({ page }) => {
    await page.goto('/');
    await expect(fab(page)).toHaveCount(0);
  });

  test('MC9-E1: FAB shows the seeded unread badge; panel header/controls/search/list rows replica', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);

    const launcher = fab(page);
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-label', 'Messages, 3 non lus');

    await launcher.click();
    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Messages', { exact: true })).toBeVisible();
    await expect(dialog.getByText('3', { exact: true })).toBeVisible(); // header count chip
    await expect(dialog.getByRole('button', { name: '＋ Groupe' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Réduire' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeVisible();
    await expect(dialog.getByRole('searchbox', { name: 'Rechercher une conversation' })).toBeVisible();

    // Group row is newest (lastMessageAt 13:00 > DM's 12:03) → listed first.
    const groupRow = rowByName(page, 'Projet · Lames de Brume');
    await expect(groupRow).toBeVisible();
    await expect(groupRow.getByText('E2E MSG_B : nemu planche 4 prêt')).toBeVisible();
    await expect(groupRow.getByLabel('1 non lu')).toBeVisible();

    const dmRow = rowByName(page, 'E2E MSG_B');
    await expect(dmRow).toBeVisible();
    await expect(dmRow.getByText('On se cale un créneau demain ?')).toBeVisible();
    await expect(dmRow.getByLabel('2 non lu')).toBeVisible();
  });

  test('MC9-E2: search filters the list (client-side, auto-applies)', async ({ page }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
    await fab(page).click();
    const search = panel(page).getByRole('searchbox', { name: 'Rechercher une conversation' });
    await search.fill('Lames de Brume');
    await expect(rowByName(page, 'Projet · Lames de Brume')).toBeVisible();
    await expect(rowByName(page, 'E2E MSG_B')).toHaveCount(0);
    await search.fill('zzz-no-match');
    await expect(panel(page).getByText('Aucune conversation trouvée.')).toBeVisible();
  });

  test('MC9-E3: opening the DM shows history, composer, mark-read clears the row + badge; reload persists', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
    await fab(page).click();
    await rowByName(page, 'E2E MSG_B').click();

    const dialog = panel(page);
    await expect(dialog.getByText('Salut, tu es dispo cette semaine ?')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Oui, avec plaisir.')).toBeVisible();
    await expect(dialog.getByText('On se cale un créneau demain ?')).toBeVisible();
    await expect(dialog.getByLabel('Écrire un message')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Réduire' })).toBeVisible(); // still the panel header

    // Opening the thread marks it read: badge drops from 3 → 1 (only the group stays unread).
    await expect(fab(page)).toHaveAttribute('aria-label', 'Messages, 1 non lus', { timeout: 10_000 });

    await page.reload();
    await expect(fab(page)).toHaveAttribute('aria-label', 'Messages, 1 non lus', { timeout: 10_000 });
  });

  test('MC9-E4: a11y — Esc closes the panel (list view) and refocuses the FAB; minimize collapses to the FAB', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
    const launcher = fab(page);
    await launcher.click();
    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Réduire' }).click();
    // Minimize preserves nothing yet to preserve (no thread open) but panel collapses to the FAB.
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeVisible();

    // Panel auto-focuses itself on open (panelRef.current.focus()) — Esc from there closes + refocuses.
    await launcher.click();
    await expect(panel(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  // Regression for a fixed a11y defect: opening a conversation thread unmounts the focused list-row
  // button, so focus must be re-homed into the dialog (the widget's Escape handler lives on the
  // dialog's own onKeyDown — a keydown targeting <body> would never reach it). The fix re-focuses the
  // panel whenever the active conversation changes (MessagingWidget focus effect depends on it).
  test('MC9-E4b: Esc still closes the panel once a thread is open (focus stays inside the dialog)', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
    await fab(page).click();
    await rowByName(page, 'E2E MSG_B').click();
    await expect(panel(page).getByRole('log', { name: 'Messages' })).toBeVisible({ timeout: 10_000 });

    // Focus was re-homed into the dialog subtree (not dropped to <body>).
    const focusInDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const a = document.activeElement;
      return !!d && !!a && (d === a || d.contains(a));
    });
    expect(focusInDialog).toBe(true);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0); // Esc closes the panel from the thread view
  });

  test('MC9-E5: responsive — 375/768/1280px, full-width sheet on mobile, no overflow, FAB tap target ≥44px', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload();
    const launcher = fab(page);
    await expect(launcher).toBeVisible();
    const box = await launcher.boundingBox();
    expect(box && box.width).toBeGreaterThanOrEqual(44);
    expect(box && box.height).toBeGreaterThanOrEqual(44);
    await launcher.click();
    await expect(panel(page)).toBeVisible();
    const noOverflow375 = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow375).toBe(true);
    await page.screenshot({ path: 'test-results/mc9-widget-375px.png', fullPage: true });
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await fab(page).click();
    await expect(panel(page)).toBeVisible();
    const noOverflow768 = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow768).toBe(true);
    await page.screenshot({ path: 'test-results/mc9-widget-768px.png', fullPage: true });
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await fab(page).click();
    await expect(panel(page)).toBeVisible();
    const noOverflow1280 = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow1280).toBe(true);
    await page.screenshot({ path: 'test-results/mc9-widget-1280px.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Realtime messaging — two independent browser contexts, real Redis-adapter socket.io.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-9 realtime messaging — context A (MSG_A) + context B (MSG_B)', () => {
  test.describe.configure({ mode: 'serial' });

  test('MC9-E6: B sends a message via the UI → A (widget already open on the DM, no reload) receives the bubble + list/badge bump live; A marks read → B sees "Lu"', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await login(pageA, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
      await login(pageB, ACCOUNTS.MSG_B.email, /menu de e2e msg_b/i);

      // A opens the widget on the DM thread and reads it (badge → 1, only the group left unread).
      await fab(pageA).click();
      await rowByName(pageA, 'E2E MSG_B').click();
      await expect(panel(pageA).getByRole('log', { name: 'Messages' }).getByText('On se cale un créneau demain ?')).toBeVisible({ timeout: 10_000 });
      await expect(fab(pageA)).toHaveAttribute('aria-label', 'Messages, 1 non lus', { timeout: 10_000 });

      // B opens the same DM (from B's perspective, the DM shows MSG_A's name).
      await fab(pageB).click();
      await rowByName(pageB, 'E2E MSG_A').click();
      await expect(panel(pageB).getByRole('log', { name: 'Messages' }).getByText('On se cale un créneau demain ?')).toBeVisible({ timeout: 10_000 });

      // B types → A's list is showing the thread (not the list) so assert via the thread typing line
      // instead of the row; go back to the list on A momentarily to see the row-level indicator too.
      await panel(pageB).getByLabel('Écrire un message').fill('Un message qui déclenche typing');
      await expect(panel(pageA).getByText('E2E MSG_B écrit…')).toBeVisible({ timeout: 8_000 });
      await panel(pageB).getByLabel('Écrire un message').fill(''); // stop typing (blur/clear)
      await panel(pageB).getByLabel('Écrire un message').blur();

      // B sends a greeting — A must receive it live, no reload. Body is unique per run so it can't
      // collide with seeded history AND so getByText only ever matches the reconciled bubble.
      const greeting = `Bonjour, ceci est un test ! ${Date.now()}`;
      await panel(pageB).getByLabel('Écrire un message').fill(greeting);
      await panel(pageB).getByRole('button', { name: 'Envoyer' }).click();
      await expect(panel(pageB).getByRole('log', { name: 'Messages' }).getByText(greeting)).toBeVisible({ timeout: 10_000 }); // B's own optimistic→ack bubble

      await expect(panel(pageA).getByRole('log', { name: 'Messages' }).getByText(greeting)).toBeVisible({ timeout: 10_000 }); // realtime delivery, NO reload
      // A was actively reading the open thread → the message is auto-marked read; B should see "Lu" under it.
      await expect(panel(pageB).getByText('Lu', { exact: true })).toBeVisible({ timeout: 10_000 });

      // A's badge must NOT have bumped (thread was open+active when the message arrived).
      await expect(fab(pageA)).toHaveAttribute('aria-label', 'Messages, 1 non lus');
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('MC9-E7: B sends a message while A is on an unrelated page (widget closed) → A\'s FAB badge updates live with no reload', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await login(pageA, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
      await pageA.goto('/decouvrir');
      await expect(pageA.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
      // Widget starts closed on this fresh page load.
      await expect(panel(pageA)).toHaveCount(0);
      const before = await fab(pageA).getAttribute('aria-label');

      await login(pageB, ACCOUNTS.MSG_B.email, /menu de e2e msg_b/i);
      await fab(pageB).click();
      await rowByName(pageB, 'E2E MSG_A').click();
      await panel(pageB).getByLabel('Écrire un message').fill('Toujours là ?');
      await panel(pageB).getByRole('button', { name: 'Envoyer' }).click();
      // Fixture accounts persist across CI runs, so this exact copy can already appear earlier
      // in the thread history from a prior run — assert the newest bubble specifically.
      await expect(panel(pageB).getByRole('log', { name: 'Messages' }).getByText('Toujours là ?').last()).toBeVisible({ timeout: 10_000 });

      // A never reloaded /decouvrir — the FAB badge must still bump live.
      await expect(async () => {
        const after = await fab(pageA).getAttribute('aria-label');
        expect(after).not.toBe(before);
        expect(after).toMatch(/non lus/);
      }).toPass({ timeout: 10_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ＋ Groupe creation + the MC-8 contacts "Message" seam (needs an accepted connection first).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-9 group creation + MC-8 « Message » seam (MSG_A ⇄ MSG_CONTACT)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ playwright }) => {
    // Establish an accepted connection MSG_A ⇄ MSG_CONTACT so MSG_CONTACT appears as a selectable
    // contact in the "＋ Groupe" multi-select and as a Contacts row for the MC-8 seam test.
    const uCtx = await playwright.request.newContext();
    const aCtx = await playwright.request.newContext();
    try {
      await loginApi(uCtx, ACCOUNTS.MSG_A.email);
      const reqRes = await uCtx.post(`${API}/connections/requests`, { data: { toUser: ACCOUNTS.MSG_CONTACT.id } });
      // Idempotent: 409 "déjà en contact" means the desired end state (an accepted connection)
      // already exists — proceed. Only a fresh 201 needs the accept step below.
      if (reqRes.status() === 409) return;
      if (reqRes.status() !== 201) throw new Error(`connection request failed: ${reqRes.status()} ${await reqRes.text()}`);
      const { id: requestId } = (await reqRes.json()) as { id: string };

      await loginApi(aCtx, ACCOUNTS.MSG_CONTACT.email);
      const decideRes = await aCtx.patch(`${API}/connections/requests/${requestId}`, { data: { status: 'accepted' } });
      if (decideRes.status() !== 200) throw new Error(`accept failed: ${decideRes.status()} ${await decideRes.text()}`);
    } finally {
      await uCtx.dispose();
      await aCtx.dispose();
    }
  });

  test('MC9-E8: "＋ Groupe" — name + a contact via OnBrandMultiSelect → thread opens empty, send works', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
    await fab(page).click();
    await panel(page).getByRole('button', { name: '＋ Groupe' }).click();

    const modal = page.getByRole('dialog', { name: 'Nouveau groupe' }).or(page.getByRole('dialog').filter({ hasText: 'Nouveau groupe' }));
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByLabel('Nom du groupe').fill('Projet · Test QA');
    await modal.getByRole('button', { name: /^Contacts/ }).click();
    await modal.getByRole('checkbox', { name: 'E2E MSG_CONTACT' }).check();
    await modal.getByRole('button', { name: 'Créer le groupe' }).click();

    await expect(modal).toHaveCount(0);
    const dialog = panel(page);
    await expect(dialog.getByText('Démarrez la conversation')).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel('Écrire un message').fill('Bienvenue dans le groupe !');
    await dialog.getByRole('button', { name: 'Envoyer' }).click();
    await expect(dialog.getByText('Bienvenue dans le groupe !')).toBeVisible({ timeout: 10_000 });
  });

  test('MC9-E9: /contacts « Message à E2E MSG_CONTACT » opens (or starts) the DM directly (openMsg behavior)', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    const row = page.locator('li').filter({ hasText: 'E2E MSG_CONTACT' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    const messageBtn = row.getByRole('button', { name: 'Message à E2E MSG_CONTACT' });
    await expect(messageBtn).toBeEnabled();
    await messageBtn.click();

    const dialog = panel(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Either the fresh empty DM or (if MC9-E8's group didn't create a DM) an empty thread — either
    // way this proves the seam opens a live thread with the composer ready, not a disabled no-op.
    await expect(dialog.getByLabel('Écrire un message')).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round 2 — composer attachment SENDING (closes reviewer B1: the ＋ "Joindre un fichier"
// control was previously a dead button — no onClick, no <input type="file">). Drives the
// real F-10 pipeline (requestUpload kind=attachment/visibility=private → PUT presigned →
// finalizeMedia → poll getMedia until ready) from the widget's hidden file input, across two
// contexts, so the send→receive round trip AND the participant-gated signed URL render are
// both proven at the UI level (previously only unit/API-proven per the reviewer's note).
// ─────────────────────────────────────────────────────────────────────────────

const ATTACHMENT_FIXTURE = path.join(__dirname, 'fixtures/avatar-50x50.jpg');

test.describe('MC-9 composer attachments — Round 2 send path (MSG_A ⇄ MSG_B)', () => {
  test.describe.configure({ mode: 'serial' });

  test('MC9-E10: A attaches an image and sends attachment-only → B\'s open thread receives it live (message:new) and renders an AttachmentTile via the signed URL', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await login(pageA, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
      await login(pageB, ACCOUNTS.MSG_B.email, /menu de e2e msg_b/i);

      await fab(pageA).click();
      await rowByName(pageA, 'E2E MSG_B').click();
      await expect(panel(pageA).getByLabel('Écrire un message')).toBeVisible({ timeout: 10_000 });

      await fab(pageB).click();
      await rowByName(pageB, 'E2E MSG_A').click();
      await expect(panel(pageB).getByLabel('Écrire un message')).toBeVisible({ timeout: 10_000 });

      // Pick the fixture via the hidden <input type="file"> — setInputFiles does not require
      // visibility, and this is the exact input the ＋ button's onClick programmatically clicks.
      await panel(pageA).locator('input[type="file"]').setInputFiles(ATTACHMENT_FIXTURE);

      // A pending chip with the filename appears immediately.
      const chip = panel(pageA).getByText('avatar-50x50.jpg');
      await expect(chip).toBeVisible({ timeout: 5_000 });
      const sendBtn = panel(pageA).getByRole('button', { name: 'Envoyer' });

      // The upload→finalize→worker-ready round trip may finish before this assertion runs (tiny
      // fixture, fast worker), so tolerate either observing the transient "Téléversement…" state or
      // having already reached ready — either way Send must end up enabled with no error surfaced.
      await expect(async () => {
        await expect(sendBtn).toBeEnabled();
      }).toPass({ timeout: 30_000 });
      await expect(panel(pageA).getByText('Échec de l’envoi de la pièce jointe')).toHaveCount(0);

      // Attachment-only send — body stays empty (F7's "composer with attachment support").
      await sendBtn.click();

      // A's own thread renders the tile (its own optimistic→ack bubble round trip). NOTE: the
      // rendered <img alt> is the SERVER-resolved attachment name — messages.service.ts derives it
      // from the storage bucketKey (a hash), not the client's original filename — so match by
      // extension rather than the picked filename (confirmed by reading resolveAttachments()).
      const imgA = panel(pageA).locator('[role="log"] img');
      await expect(imgA).toBeVisible({ timeout: 10_000 });
      const attachmentName = await imgA.getAttribute('alt');
      expect(attachmentName).toMatch(/\.jpe?g$/i);
      await expect
        .poll(() => imgA.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
        .toBeGreaterThan(0);

      // B receives it live (message:new, NO reload) and renders the same AttachmentTile — the
      // identical resolved name (same Message.attachments row seen by both participants) — proves
      // the participant-gated signed URL resolves for the recipient too (F-10 attachment-authz,
      // now proven end-to-end through the UI, not just media.service.spec.ts).
      const imgB = panel(pageB).getByRole('img', { name: attachmentName! });
      await expect(imgB).toBeVisible({ timeout: 10_000 });
      await expect
        .poll(() => imgB.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
        .toBeGreaterThan(0);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('MC9-E11: removing a chip before send excludes it — the message goes out text-only, no new attachment tile', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
    await fab(page).click();
    await rowByName(page, 'E2E MSG_B').click();
    await expect(panel(page).getByLabel('Écrire un message')).toBeVisible({ timeout: 10_000 });
    // Wait for the async message-history fetch to actually settle before counting anything below —
    // a known seeded message renders only once messagesState reaches 'ready'.
    await expect(panel(page).getByText('On se cale un créneau demain ?')).toBeVisible({ timeout: 10_000 });

    await panel(page).locator('input[type="file"]').setInputFiles(ATTACHMENT_FIXTURE);
    const chip = panel(page).getByText('avatar-50x50.jpg');
    await expect(chip).toBeVisible({ timeout: 5_000 });

    await panel(page).getByRole('button', { name: 'Retirer avatar-50x50.jpg' }).click();
    await expect(chip).toHaveCount(0);

    const marker = `Texte seul ${Date.now()}`;
    await panel(page).getByLabel('Écrire un message').fill(marker);
    await panel(page).getByRole('button', { name: 'Envoyer' }).click();

    await expect(panel(page).getByText(marker, { exact: true })).toBeVisible({ timeout: 10_000 });
    // No attachment tile was added by THIS send — the removed chip never reached the wire. Scope the
    // check to the just-sent message's own bubble (a direct <div> child of the log): a whole-log image
    // count is racy because MC9-E10's attachment can arrive live in this shared MSG_A↔MSG_B thread
    // between capture and assert (the actual flake this fixes).
    const sentBubble = panel(page).locator('[role="log"] > div').filter({ hasText: marker });
    await expect(sentBubble.locator('img')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BE-RT1 scope addition — realtime F-5 notifications (RT-1/RT-2/RT-3).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('BE-RT1 — realtime F-5 notifications (connection requests → live header badge)', () => {
  test('RT-1/RT-2/RT-3: MSG_FRESH\'s own socket receives unread:changed only for ITS OWN events; the header "demandes en attente" badge updates live with no reload', async ({
    browser,
    playwright,
  }) => {
    const freshCtx = await browser.newContext();
    const admin2Api = await playwright.request.newContext();
    const admin3Api = await playwright.request.newContext();
    let rawFreshSocket: Socket | null = null;
    try {
      const freshPage = await freshCtx.newPage();
      await login(freshPage, ACCOUNTS.MSG_FRESH.email, /menu de e2e msg_fresh/i);

      // Baseline: MSG_FRESH has zero pending connection requests → no "Demandes" badge. Dedicated
      // (not the shared FRESH account roles.spec.ts also resets/uses) so this baseline can't be
      // disturbed by a sibling spec running concurrently.
      await freshPage.getByRole('button', { name: /menu de e2e msg_fresh/i }).click();
      await expect(freshPage.getByRole('img', { name: /demandes en attente/i })).toHaveCount(0);

      // A raw, independent socket authenticated as MSG_FRESH (protocol-level proof, decoupled from the UI).
      const cookie = await sessionCookie(freshCtx);
      rawFreshSocket = rawSocket(cookie);
      await waitForEvent(rawFreshSocket, 'connect', 10_000);

      // RT-3 (negative): ADMIN2 → ADMIN3 connection request never targets MSG_FRESH's room. ADMIN2/
      // ADMIN3 are used here only as request senders — their role (mutated by roles.spec.ts) is
      // irrelevant to sending a connection request.
      await loginApi(admin2Api, ACCOUNTS.ADMIN2.email);
      const otherReq = await admin2Api.post(`${API}/connections/requests`, { data: { toUser: ACCOUNTS.ADMIN3.id } });
      expect(otherReq.status()).toBe(201);
      const leaked = await waitForEvent(rawFreshSocket, 'unread:changed', 2_000);
      expect(leaked).toBeNull(); // MSG_FRESH's socket must NOT see an event meant for ADMIN3

      // RT-1 (positive): ADMIN3 → MSG_FRESH connection request DOES reach MSG_FRESH's own room.
      await loginApi(admin3Api, ACCOUNTS.ADMIN3.email);
      const receivedPromise = waitForEvent(rawFreshSocket, 'unread:changed', 10_000);
      const reqToFresh = await admin3Api.post(`${API}/connections/requests`, { data: { toUser: ACCOUNTS.MSG_FRESH.id } });
      expect(reqToFresh.status()).toBe(201);
      const received = await receivedPromise;
      expect(received).not.toBeNull();

      // RT-2: the SAME event, relayed through the browser's own socket → UnreadProvider.refresh(),
      // makes the header badge appear live in the ALREADY-OPEN dropdown — no reload, no refocus.
      await expect(freshPage.getByRole('img', { name: '1 demandes en attente' })).toBeVisible({ timeout: 10_000 });
    } finally {
      rawFreshSocket?.disconnect();
      await freshCtx.close();
      await admin2Api.dispose();
      await admin3Api.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MC-9 delta (2026-07-09) — DM requests ("Demandes" tab) + F-19 "Confidentialité" dmPolicy.
//
// MSG_C ⇄ MSG_FRESH is a genuinely never-messaged, unconnected pair (grep-confirmed against
// e2e-seed.js: no fixture conversation or MC-8 connection links them — MSG_C only appears as the
// silent third participant of the MSG_A/MSG_B group, and MSG_FRESH is otherwise untouched by the
// messaging fixtures). e2e-seed.js wipes every seeded account's conversations on every run, so this
// block's mutations are naturally hermetic across re-runs.
//
// Honest simulation note: this delta ships the widget's "Demandes" tab, the request action bar, the
// "Demande envoyée" pill, and the Confidentialité settings section (FE-1..FE-3) — it does NOT add a
// new "message this stranger" entry point anywhere in the app (the only two existing seams,
// Contacts and Mes candidatures, both presuppose an existing connection/accepted application). QA
// therefore opens the initial request via the real `POST /conversations` call (the same call any
// future "message a stranger" trigger would make) and drives every subsequent step — Demandes tab,
// Accepter/Refuser, "Demande envoyée", the settings control, and the contacts-only refusal — through
// the real UI.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-9 delta — DM requests + dmPolicy (MSG_C ⇄ MSG_FRESH)', () => {
  test.describe.configure({ mode: 'serial' });

  test('MC9-D1: a non-contact DM lands only in "Demandes"; recipient Accepter opens the thread; sender\'s "Demande envoyée" pill clears live', async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctxSender = await browser.newContext();
    const ctxRecipient = await browser.newContext();
    try {
      const senderPage = await ctxSender.newPage();
      const recipientPage = await ctxRecipient.newPage();
      await login(senderPage, ACCOUNTS.MSG_C.email, /menu de e2e msg_c/i);
      await login(recipientPage, ACCOUNTS.MSG_FRESH.email, /menu de e2e msg_fresh/i);

      // Opening request — MSG_FRESH is on the default 'requests' policy at this point in the run.
      const createRes = await senderPage.request.post(`${API}/conversations`, {
        data: { participantId: ACCOUNTS.MSG_FRESH.id },
      });
      expect(createRes.ok()).toBe(true);
      const created = (await createRes.json()) as { id: string; status: string };
      expect(created.status).toBe('requested');

      // MessagingProvider fetches the conversation list once at mount (login happened BEFORE this
      // conversation existed) and a bare `POST /conversations` made outside the page's own JS emits
      // no WS event to refresh it — reload both pages so their widgets pick up the fresh state.
      await senderPage.reload();
      await recipientPage.reload();

      // Sender: the outgoing request shows in the MAIN list (not a separate tab) with "Demande
      // envoyée" above an ENABLED composer — opening message(s) are allowed (D7, no cap).
      await fab(senderPage).click();
      await rowByName(senderPage, 'E2E MSG_FRESH').click();
      await expect(panel(senderPage).getByText('Demande envoyée')).toBeVisible({ timeout: 10_000 });
      const composer = panel(senderPage).getByLabel('Écrire un message');
      await expect(composer).toBeEnabled();
      const opening = `Salut, ravi de te contacter ! ${Date.now()}`;
      await composer.fill(opening);
      await panel(senderPage).getByRole('button', { name: 'Envoyer' }).click();
      await expect(panel(senderPage).getByText(opening)).toBeVisible({ timeout: 10_000 });

      // Recipient — the request lands ONLY in "Demandes" (own count), never the main list.
      await fab(recipientPage).click();
      await expect(rowByName(recipientPage, 'E2E MSG_C')).toHaveCount(0);
      const demandesTab = panel(recipientPage).getByRole('tab', { name: /Demandes/ });
      await expect(demandesTab).toBeVisible();
      await demandesTab.click();
      await expect(rowByName(recipientPage, 'E2E MSG_C')).toBeVisible({ timeout: 10_000 });
      await rowByName(recipientPage, 'E2E MSG_C').click();

      // Recipient sees the opening message, a "Demande de message" bar INSTEAD of the composer.
      await expect(panel(recipientPage).getByText(opening)).toBeVisible({ timeout: 10_000 });
      await expect(panel(recipientPage).getByText('Demande de message')).toBeVisible();
      await expect(panel(recipientPage).getByLabel('Écrire un message')).toHaveCount(0);

      await panel(recipientPage).getByRole('button', { name: 'Accepter' }).click();
      // The bar is replaced by a real composer — the thread is now a normal open thread.
      const recipientComposer = panel(recipientPage).getByLabel('Écrire un message');
      await expect(recipientComposer).toBeVisible({ timeout: 10_000 });
      const reply = `Avec plaisir ! ${Date.now()}`;
      await recipientComposer.fill(reply);
      await panel(recipientPage).getByRole('button', { name: 'Envoyer' }).click();
      await expect(panel(recipientPage).getByText(reply)).toBeVisible({ timeout: 10_000 });

      // Sender: the reply arrives live (no reload) and the "Demande envoyée" pill is gone.
      await expect(panel(senderPage).getByText(reply)).toBeVisible({ timeout: 10_000 });
      await expect(panel(senderPage).getByText('Demande envoyée')).toHaveCount(0);
    } finally {
      await ctxSender.close();
      await ctxRecipient.close();
    }
  });

  test('MC9-D2: recipient declines a request — the row disappears and further sends are refused', async ({
    browser,
  }) => {
    const ctxSender = await browser.newContext();
    const ctxRecipient = await browser.newContext();
    try {
      const senderPage = await ctxSender.newPage();
      const recipientPage = await ctxRecipient.newPage();
      await login(senderPage, ACCOUNTS.MSG_B.email, /menu de e2e msg_b/i);
      await login(recipientPage, ACCOUNTS.MSG_FRESH.email, /menu de e2e msg_fresh/i);

      // MSG_B ⇄ MSG_FRESH: another never-messaged pair (MSG_B's only fixture conversation is with
      // MSG_A/MSG_C, per e2e-seed.js) — MSG_C ⇄ MSG_FRESH is already 'open' from MC9-D1.
      const createRes = await senderPage.request.post(`${API}/conversations`, {
        data: { participantId: ACCOUNTS.MSG_FRESH.id },
      });
      expect(createRes.ok()).toBe(true);
      const created = (await createRes.json()) as { id: string; status: string };
      expect(created.status).toBe('requested');

      // Same mount-time-fetch staleness as MC9-D1 — refresh before touching the widget.
      await recipientPage.reload();

      await fab(recipientPage).click();
      await panel(recipientPage).getByRole('tab', { name: /Demandes/ }).click();
      await rowByName(recipientPage, 'E2E MSG_B').click();
      await panel(recipientPage).getByRole('button', { name: 'Refuser' }).click();

      // Back to the list, row gone.
      await expect(panel(recipientPage).getByText('Demande de message')).toHaveCount(0);
      await panel(recipientPage).getByRole('tab', { name: /Demandes/ }).click();
      await expect(rowByName(recipientPage, 'E2E MSG_B')).toHaveCount(0);

      // Further sends on the declined conversation are refused with the neutral (block-indistinct)
      // copy — for BOTH parties (D2). Checked at the API level (server backstop; the UI never
      // exposes a composer for a row it no longer lists).
      const senderSendRes = await senderPage.request.post(`${API}/conversations/${created.id}/messages`, {
        data: { body: 'Encore là ?' },
      });
      expect(senderSendRes.status()).toBe(400);
      expect(((await senderSendRes.json()) as { message: string }).message).toBe("Impossible d'envoyer le message.");

      const recipientSendRes = await recipientPage.request.post(`${API}/conversations/${created.id}/messages`, {
        data: { body: 'Toujours pas.' },
      });
      expect(recipientSendRes.status()).toBe(400);
    } finally {
      await ctxSender.close();
      await ctxRecipient.close();
    }
  });

  test('MC9-D3: "Confidentialité" → "Contacts uniquement" refuses a stranger, but the already-open MSG_C thread stays usable', async ({
    page,
    browser,
  }) => {
    await login(page, ACCOUNTS.MSG_FRESH.email, /menu de e2e msg_fresh/i);
    await page.goto('/parametres');
    const combobox = page.getByRole('combobox', { name: "Qui peut m'envoyer des messages" });
    await combobox.click();
    await page.getByRole('option', { name: 'Contacts uniquement' }).click();
    await expect(page.getByText('Préférence enregistrée.')).toBeVisible({ timeout: 10_000 });

    // A stranger (MSG_A — never connected to, nor previously messaged, MSG_FRESH) is refused.
    const strangerCtx = await browser.newContext();
    try {
      const strangerPage = await strangerCtx.newPage();
      await login(strangerPage, ACCOUNTS.MSG_A.email, /menu de e2e msg_a/i);
      const refusedRes = await strangerPage.request.post(`${API}/conversations`, {
        data: { participantId: ACCOUNTS.MSG_FRESH.id },
      });
      expect(refusedRes.status()).toBe(400);
      const body = (await refusedRes.json()) as { message: string };
      expect(body.message).toBe("Ce membre n'accepte que les messages de ses contacts.");
    } finally {
      await strangerCtx.close();
    }

    // The already-open MSG_C ⇄ MSG_FRESH thread (accepted in MC9-D1) is unaffected — a policy
    // change never retro-closes an existing open thread (D5).
    const senderCtx = await browser.newContext();
    try {
      const senderPage = await senderCtx.newPage();
      await login(senderPage, ACCOUNTS.MSG_C.email, /menu de e2e msg_c/i);
      await fab(senderPage).click();
      await rowByName(senderPage, 'E2E MSG_FRESH').click();
      const composer = panel(senderPage).getByLabel('Écrire un message');
      await expect(composer).toBeEnabled({ timeout: 10_000 });
      const marker = `Toujours là malgré le changement de politique ${Date.now()}`;
      await composer.fill(marker);
      await panel(senderPage).getByRole('button', { name: 'Envoyer' }).click();
      await expect(panel(senderPage).getByText(marker)).toBeVisible({ timeout: 10_000 });
    } finally {
      await senderCtx.close();
    }

    // Restore the default so a re-run / any later test reading MSG_FRESH isn't affected.
    await page.request.patch(`${API}/accounts/me/preferences`, { data: { dmPolicy: 'requests' } });
  });
});
