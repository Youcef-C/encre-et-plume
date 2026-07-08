/**
 * MC-9 — Messaging (floating widget) + the BE-RT1 "realtime F-5 notifications" scope addition.
 *
 * Real backend + Redis adapter (no mocks) — the whole point of this suite is proving the socket.io
 * gateway actually fans out across two independent browser contexts. Hermeticity traps (heeded):
 *   - the gateway only exists on a FRESHLY BUILT+STARTED API — a stale :3001 makes every realtime
 *     assertion fail confusingly. QA killed stale servers + flushed `rl:*` before this run.
 *   - `apps/api/prisma/e2e-seed.js` (driven by global-setup.ts) seeds, for the two standard e2e
 *     accounts (UTILISATEUR ⇄ TARGET), deterministic messaging fixtures:
 *       - a DM with 3 messages, the last 2 (from TARGET) unread for UTILISATEUR;
 *       - a group "Projet · Lames de Brume" (UTILISATEUR + TARGET + ADMIN) with 1 unread TARGET
 *         message "nemu planche 4 prêt".
 *     → UTILISATEUR's launcher badge starts at totalUnread = 3 (2 DM + 1 group).
 *
 * Account map (from .e2e-accounts.json): UTILISATEUR = "E2E UTILISATEUR", TARGET = "E2E TARGET".
 * displayName is always `E2E ${KEY}` (e2e-seed.js) — used verbatim in list-row / preview assertions.
 *
 * For the realtime F-5 scope (RT-1/2/3) this suite uses ADMIN2 / ADMIN3 / FRESH — three accounts
 * untouched by the messaging fixtures and reseeded from scratch every full e2e run (global-teardown
 * deletes every qa_e2e_* account + its Connections/Notifications at the end of the PREVIOUS run,
 * global-setup upserts fresh ones at the start of this one) — so their connection/notification state
 * is guaranteed empty at the start of THIS run, same precondition roles.spec.ts already relies on.
 * ADMIN2 is also used (separately, connected to UTILISATEUR) as the "＋ Groupe" contact and the
 * /contacts "Message" seam target — kept apart from FRESH so the two don't cross-pollute each
 * other's "starts at zero" assumptions.
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
// here: a group row's preview embeds the sender's display name (e.g. "E2E TARGET : nemu planche 4
// prêt"), which collides with a DM row literally named "E2E TARGET".
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const rowByName = (page: Page, name: string) =>
  panel(page)
    .locator('button')
    .filter({ has: page.locator('b', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }) });

test.describe.configure({ mode: 'serial' });

// ─────────────────────────────────────────────────────────────────────────────
// Core widget: anatomy, states, a11y, responsive (single UTILISATEUR context)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-9 widget anatomy — UTILISATEUR (seeded unread fixtures)', () => {
  test('MC9-E0: logged-out — no launcher bubble anywhere', async ({ page }) => {
    await page.goto('/');
    await expect(fab(page)).toHaveCount(0);
  });

  test('MC9-E1: FAB shows the seeded unread badge; panel header/controls/search/list rows replica', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);

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
    await expect(groupRow.getByText('E2E TARGET : nemu planche 4 prêt')).toBeVisible();
    await expect(groupRow.getByLabel('1 non lu')).toBeVisible();

    const dmRow = rowByName(page, 'E2E TARGET');
    await expect(dmRow).toBeVisible();
    await expect(dmRow.getByText('On se cale un créneau demain ?')).toBeVisible();
    await expect(dmRow.getByLabel('2 non lu')).toBeVisible();
  });

  test('MC9-E2: search filters the list (client-side, auto-applies)', async ({ page }) => {
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
    await fab(page).click();
    const search = panel(page).getByRole('searchbox', { name: 'Rechercher une conversation' });
    await search.fill('Lames de Brume');
    await expect(rowByName(page, 'Projet · Lames de Brume')).toBeVisible();
    await expect(rowByName(page, 'E2E TARGET')).toHaveCount(0);
    await search.fill('zzz-no-match');
    await expect(panel(page).getByText('Aucune conversation trouvée.')).toBeVisible();
  });

  test('MC9-E3: opening the DM shows history, composer, mark-read clears the row + badge; reload persists', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
    await fab(page).click();
    await rowByName(page, 'E2E TARGET').click();

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
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
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
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
    await fab(page).click();
    await rowByName(page, 'E2E TARGET').click();
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
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);

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

test.describe('MC-9 realtime messaging — context A (UTILISATEUR) + context B (TARGET)', () => {
  test('MC9-E6: B sends a message via the UI → A (widget already open on the DM, no reload) receives the bubble + list/badge bump live; A marks read → B sees "Lu"', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await login(pageA, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
      await login(pageB, ACCOUNTS.TARGET.email, /menu de e2e target/i);

      // A opens the widget on the DM thread and reads it (badge → 1, only the group left unread).
      await fab(pageA).click();
      await rowByName(pageA, 'E2E TARGET').click();
      await expect(panel(pageA).getByText('On se cale un créneau demain ?')).toBeVisible({ timeout: 10_000 });
      await expect(fab(pageA)).toHaveAttribute('aria-label', 'Messages, 1 non lus', { timeout: 10_000 });

      // B opens the same DM (from B's perspective, the DM shows UTILISATEUR's name).
      await fab(pageB).click();
      await rowByName(pageB, 'E2E UTILISATEUR').click();
      await expect(panel(pageB).getByText('On se cale un créneau demain ?')).toBeVisible({ timeout: 10_000 });

      // B types → A's list is showing the thread (not the list) so assert via the thread typing line
      // instead of the row; go back to the list on A momentarily to see the row-level indicator too.
      await panel(pageB).getByLabel('Écrire un message').fill('Un message qui déclenche typing');
      await expect(panel(pageA).getByText('E2E TARGET écrit…')).toBeVisible({ timeout: 8_000 });
      await panel(pageB).getByLabel('Écrire un message').fill(''); // stop typing (blur/clear)
      await panel(pageB).getByLabel('Écrire un message').blur();

      // B sends "Bonjour !" — A must receive it live, no reload.
      await panel(pageB).getByLabel('Écrire un message').fill('Bonjour !');
      await panel(pageB).getByRole('button', { name: 'Envoyer' }).click();
      await expect(panel(pageB).getByText('Bonjour !')).toBeVisible({ timeout: 10_000 }); // B's own optimistic→ack bubble

      await expect(panel(pageA).getByText('Bonjour !')).toBeVisible({ timeout: 10_000 }); // realtime delivery, NO reload
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

      await login(pageA, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
      await pageA.goto('/decouvrir');
      await expect(pageA.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
      // Widget starts closed on this fresh page load.
      await expect(panel(pageA)).toHaveCount(0);
      const before = await fab(pageA).getAttribute('aria-label');

      await login(pageB, ACCOUNTS.TARGET.email, /menu de e2e target/i);
      await fab(pageB).click();
      await rowByName(pageB, 'E2E UTILISATEUR').click();
      await panel(pageB).getByLabel('Écrire un message').fill('Toujours là ?');
      await panel(pageB).getByRole('button', { name: 'Envoyer' }).click();
      await expect(panel(pageB).getByText('Toujours là ?')).toBeVisible({ timeout: 10_000 });

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

test.describe('MC-9 group creation + MC-8 « Message » seam (UTILISATEUR ⇄ ADMIN2)', () => {
  test.beforeAll(async ({ playwright }) => {
    // Establish an accepted connection UTILISATEUR ⇄ ADMIN2 so ADMIN2 appears as a selectable contact
    // in the "＋ Groupe" multi-select and as a Contacts row for the MC-8 seam test.
    const uCtx = await playwright.request.newContext();
    const aCtx = await playwright.request.newContext();
    try {
      await loginApi(uCtx, ACCOUNTS.UTILISATEUR.email);
      const reqRes = await uCtx.post(`${API}/connections/requests`, { data: { toUser: ACCOUNTS.ADMIN2.id } });
      if (reqRes.status() !== 201) throw new Error(`connection request failed: ${reqRes.status()} ${await reqRes.text()}`);
      const { id: requestId } = (await reqRes.json()) as { id: string };

      await loginApi(aCtx, ACCOUNTS.ADMIN2.email);
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
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
    await fab(page).click();
    await panel(page).getByRole('button', { name: '＋ Groupe' }).click();

    const modal = page.getByRole('dialog', { name: 'Nouveau groupe' }).or(page.getByRole('dialog').filter({ hasText: 'Nouveau groupe' }));
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByLabel('Nom du groupe').fill('Projet · Test QA');
    await modal.getByRole('button', { name: /^Contacts/ }).click();
    await modal.getByRole('checkbox', { name: 'E2E ADMIN2' }).check();
    await modal.getByRole('button', { name: 'Créer le groupe' }).click();

    await expect(modal).toHaveCount(0);
    const dialog = panel(page);
    await expect(dialog.getByText('Démarrez la conversation')).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel('Écrire un message').fill('Bienvenue dans le groupe !');
    await dialog.getByRole('button', { name: 'Envoyer' }).click();
    await expect(dialog.getByText('Bienvenue dans le groupe !')).toBeVisible({ timeout: 10_000 });
  });

  test('MC9-E9: /contacts « Message à E2E ADMIN2 » opens (or starts) the DM directly (openMsg behavior)', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts & connexions', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    const row = page.locator('li').filter({ hasText: 'E2E ADMIN2' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    const messageBtn = row.getByRole('button', { name: 'Message à E2E ADMIN2' });
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

test.describe('MC-9 composer attachments — Round 2 send path (UTILISATEUR ⇄ TARGET)', () => {
  test('MC9-E10: A attaches an image and sends attachment-only → B\'s open thread receives it live (message:new) and renders an AttachmentTile via the signed URL', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await login(pageA, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
      await login(pageB, ACCOUNTS.TARGET.email, /menu de e2e target/i);

      await fab(pageA).click();
      await rowByName(pageA, 'E2E TARGET').click();
      await expect(panel(pageA).getByLabel('Écrire un message')).toBeVisible({ timeout: 10_000 });

      await fab(pageB).click();
      await rowByName(pageB, 'E2E UTILISATEUR').click();
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
    await login(page, ACCOUNTS.UTILISATEUR.email, /menu de e2e utilisateur/i);
    await fab(page).click();
    await rowByName(page, 'E2E TARGET').click();
    await expect(panel(page).getByLabel('Écrire un message')).toBeVisible({ timeout: 10_000 });
    // Wait for the async message-history fetch to actually settle before counting anything below —
    // a known seeded message renders only once messagesState reaches 'ready'.
    await expect(panel(page).getByText('On se cale un créneau demain ?')).toBeVisible({ timeout: 10_000 });

    // MC9-E10 already left one attachment tile in this same DM's history — count the log's <img>s
    // rather than assert zero, so this test is independent of run order / prior sends in the thread.
    const logImages = panel(page).locator('[role="log"] img');
    const before = await logImages.count();

    await panel(page).locator('input[type="file"]').setInputFiles(ATTACHMENT_FIXTURE);
    const chip = panel(page).getByText('avatar-50x50.jpg');
    await expect(chip).toBeVisible({ timeout: 5_000 });

    await panel(page).getByRole('button', { name: 'Retirer avatar-50x50.jpg' }).click();
    await expect(chip).toHaveCount(0);

    const marker = `Texte seul ${Date.now()}`;
    await panel(page).getByLabel('Écrire un message').fill(marker);
    await panel(page).getByRole('button', { name: 'Envoyer' }).click();

    await expect(panel(page).getByText(marker, { exact: true })).toBeVisible({ timeout: 10_000 });
    // No attachment tile was added by this send — the removed chip never reached the wire.
    await expect(logImages).toHaveCount(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BE-RT1 scope addition — realtime F-5 notifications (RT-1/RT-2/RT-3).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('BE-RT1 — realtime F-5 notifications (connection requests → live header badge)', () => {
  test('RT-1/RT-2/RT-3: FRESH\'s own socket receives unread:changed only for ITS OWN events; the header "demandes en attente" badge updates live with no reload', async ({
    browser,
    playwright,
  }) => {
    const freshCtx = await browser.newContext();
    const admin2Api = await playwright.request.newContext();
    const admin3Api = await playwright.request.newContext();
    let rawFreshSocket: Socket | null = null;
    try {
      const freshPage = await freshCtx.newPage();
      await login(freshPage, ACCOUNTS.FRESH.email, /menu de e2e fresh/i);

      // Baseline: FRESH has zero pending connection requests → no "Demandes" badge.
      await freshPage.getByRole('button', { name: /menu de e2e fresh/i }).click();
      await expect(freshPage.getByRole('img', { name: /demandes en attente/i })).toHaveCount(0);

      // A raw, independent socket authenticated as FRESH (protocol-level proof, decoupled from the UI).
      const cookie = await sessionCookie(freshCtx);
      rawFreshSocket = rawSocket(cookie);
      await waitForEvent(rawFreshSocket, 'connect', 10_000);

      // RT-3 (negative): ADMIN2 → ADMIN3 connection request never targets FRESH's room.
      await loginApi(admin2Api, ACCOUNTS.ADMIN2.email);
      const otherReq = await admin2Api.post(`${API}/connections/requests`, { data: { toUser: ACCOUNTS.ADMIN3.id } });
      expect(otherReq.status()).toBe(201);
      const leaked = await waitForEvent(rawFreshSocket, 'unread:changed', 2_000);
      expect(leaked).toBeNull(); // FRESH's socket must NOT see an event meant for ADMIN3

      // RT-1 (positive): ADMIN3 → FRESH connection request DOES reach FRESH's own room.
      await loginApi(admin3Api, ACCOUNTS.ADMIN3.email);
      const receivedPromise = waitForEvent(rawFreshSocket, 'unread:changed', 10_000);
      const reqToFresh = await admin3Api.post(`${API}/connections/requests`, { data: { toUser: ACCOUNTS.FRESH.id } });
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
