/**
 * MC-15 « Répondre · Modifier · Supprimer · J'aime » — scoped e2e acceptance suite.
 *
 * ONE action layer, THREE surfaces: the MC-9 widget (DMs + groups), the MC-11 salon dock and the
 * CS-8 project Discussion. All three read and write the SAME `Message` table, so what differs is
 * only the per-surface matrix:
 *
 *   widget / project Discussion : Répondre ✔  Modifier ✔  Supprimer ✔  J'aime ✔
 *   salon « Le Comptoir »       : Répondre ✔  Modifier ✘  Supprimer ✘  J'aime ✔
 *
 * The salon's two ✘ are enforced by the SERVER (403), not by the menu — this spec proves both: the
 * items are absent AND a direct PATCH/DELETE is refused.
 *
 * Fixture: `e2e-cs8-discussion` (CS10_A owner + CS10_B co-author, two real members) — its thread also
 * backs the widget case, so this spec never touches MC-9's seeded unread fixtures. Hermeticity traps: a stale API on :3001 429s everything (kill it + flush
 * `rl:*`); Postgres on :5433; re-seed before running.
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const A_EMAIL = 'qa_e2e_cs10_a@test.com'; // project owner
const B_EMAIL = 'qa_e2e_cs10_b@test.com'; // project co-author
const SLUG = 'e2e-cs8-discussion';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

async function openDiscussion(page: Page) {
  await page.goto(`/projet/${SLUG}?tab=discussion`);
  await expect(page.getByText('Discussion du projet')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Écrire à l’équipe')).toBeVisible({ timeout: 10_000 });
}

async function sendMessage(page: Page, text: string) {
  await page.getByLabel('Écrire à l’équipe').fill(text);
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 10_000 });
}

/** The "…" trigger of the bubble carrying `text` (the row is the message's own container). */
function actionsFor(page: Page, text: string) {
  return page
    .locator('[data-message-id]')
    .filter({ hasText: text })
    .getByRole('button', { name: /^Actions du message/ })
    .first();
}

// ─────────────────────────────────────────────────────────────────────────────
// CS-8 project Discussion — the full matrix row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-15 — project Discussion (Répondre · Modifier · Supprimer · J’aime)', () => {
  test.describe.configure({ mode: 'serial' });

  const OWNER_MSG = `MC15 base ${Date.now()}`;
  const REPLY_MSG = `MC15 réponse ${Date.now()}`;

  test('MC15-E1: the "…" opens on MY message with the three items, and on SOMEONE ELSE’S with Répondre only', async ({
    page,
  }) => {
    await login(page, A_EMAIL);
    await openDiscussion(page);
    await sendMessage(page, OWNER_MSG);

    await actionsFor(page, OWNER_MSG).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Répondre' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Modifier' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Supprimer' })).toBeVisible();
    await page.keyboard.press('Escape');

    // The co-author sees the same bubble as INCOMING: Répondre only (edit/delete are author-only).
    await login(page, B_EMAIL);
    await openDiscussion(page);
    await expect(page.getByText(OWNER_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });
    await actionsFor(page, OWNER_MSG).click();
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Répondre' })).toBeVisible();
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Modifier' })).toHaveCount(0);
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Supprimer' })).toHaveCount(0);
  });

  test('MC15-E2: Répondre quotes the message, and clicking the quote jumps to the original', async ({ page }) => {
    await login(page, B_EMAIL);
    await openDiscussion(page);
    await expect(page.getByText(OWNER_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });
    // Grab the ORIGINAL's id BEFORE the reply exists — afterwards its excerpt matches the text too.
    const originalId = await page
      .locator('[data-message-id]')
      .filter({ hasText: OWNER_MSG })
      .first()
      .getAttribute('data-message-id');
    expect(originalId).toBeTruthy();

    await actionsFor(page, OWNER_MSG).click();
    await page.getByRole('menuitem', { name: 'Répondre' }).click();
    await expect(page.getByText(/Réponse à/)).toBeVisible();

    await sendMessage(page, REPLY_MSG);
    // The sent bubble renders the quote above its own body…
    const quote = page.getByRole('button', { name: /^Aller au message de/ }).last();
    await expect(quote).toBeVisible({ timeout: 10_000 });
    // …and it survives a reload (the pointer is persisted, not a client-side decoration).
    await page.reload();
    await expect(page.getByRole('button', { name: /^Aller au message de/ }).last()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /^Aller au message de/ }).last().click();
    await expect(page.locator(`[data-message-id="${originalId}"]`)).toBeInViewport({ timeout: 5_000 });
  });

  test('MC15-E3: Modifier edits in place, « modifié » appears and survives a reload', async ({ page }) => {
    await login(page, B_EMAIL);
    await openDiscussion(page);
    await expect(page.getByText(REPLY_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });

    await actionsFor(page, REPLY_MSG).click();
    await page.getByRole('menuitem', { name: 'Modifier' }).click();
    const field = page.getByRole('textbox', { name: 'Modifier le message' });
    await field.fill(`${REPLY_MSG} (corrigé)`);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText(`${REPLY_MSG} (corrigé)`, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('modifié').first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(`${REPLY_MSG} (corrigé)`, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('modifié').first()).toBeVisible();
  });

  test('MC15-E4: double-click likes; a second member sees the count; the heart unlikes', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const LIKE_MSG = `MC15 like ${Date.now()}`;
    try {
      await login(pageA, A_EMAIL);
      await openDiscussion(pageA);
      await sendMessage(pageA, LIKE_MSG);

      await login(pageB, B_EMAIL);
      await openDiscussion(pageB);
      await expect(pageB.getByText(LIKE_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });

      // B double-clicks the bubble → liked (D-2 keeps the heart clickable too, asserted below).
      await pageB.getByText(LIKE_MSG, { exact: true }).dblclick();
      await expect(
        pageB.getByRole('button', { name: /^Je n’aime plus le message/ }).first(),
      ).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

      // A likes it too → the count reaches 2 and is rendered (D-5: shown only above one like).
      await pageA
        .locator('[data-message-id]')
        .filter({ hasText: LIKE_MSG })
        .getByRole('button', { name: /J’aime le message/ })
        .first()
        .click();
      // Asserted through the toggle's accessible name: the body text itself contains digits, and
      // D-5 shows the count only above one like — the name carries both state and count.
      await expect(
        pageA
          .locator('[data-message-id]')
          .filter({ hasText: LIKE_MSG })
          .getByRole('button', { name: /le message/ })
          .first(),
      ).toHaveAccessibleName(/2 j’aime/, { timeout: 10_000 });

      // Clicking the heart again removes B's like.
      await pageB.getByRole('button', { name: /^Je n’aime plus le message/ }).first().click();
      await expect(
        pageB.getByRole('button', { name: /^J’aime le message/ }).first(),
      ).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('MC15-E5: Supprimer asks first, then the message disappears LIVE for the other member', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const DOOMED = `MC15 à supprimer ${Date.now()}`;
    try {
      await login(pageA, A_EMAIL);
      await openDiscussion(pageA);
      await sendMessage(pageA, DOOMED);

      await login(pageB, B_EMAIL);
      await openDiscussion(pageB);
      await expect(pageB.getByText(DOOMED, { exact: true })).toBeVisible({ timeout: 15_000 });

      await actionsFor(pageA, DOOMED).click();
      await pageA.getByRole('menuitem', { name: 'Supprimer' }).click();
      // A destroy is never one click.
      await expect(pageA.getByText('Supprimer le message')).toBeVisible();
      await expect(pageA.getByText(DOOMED, { exact: true })).toBeVisible();
      await pageA.getByRole('button', { name: 'Supprimer', exact: true }).last().click();

      await expect(pageA.getByText(DOOMED, { exact: true })).toHaveCount(0, { timeout: 10_000 });
      // …and it is gone for B without a reload (message:deleted).
      await expect(pageB.getByText(DOOMED, { exact: true })).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  /**
   * R2-B (round 2) — « voir qui a aimé ». The heart is already a toggle (D-2), so a control that
   * both toggles AND opens a list on the same gesture would be a trap: the heart toggles, the COUNT
   * opens the list. This proves opening never toggles (R2-B3) and that the list is fetched on demand.
   */
  test('MC15-E11 (R2-B): the count opens « Aimé par » with the liker’s name, and never toggles my like', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const LIKED = `MC15 R2B ${Date.now()}`;
    try {
      await login(pageA, A_EMAIL);
      await openDiscussion(pageA);
      await sendMessage(pageA, LIKED);

      await login(pageB, B_EMAIL);
      await openDiscussion(pageB);
      await expect(pageB.getByText(LIKED, { exact: true })).toBeVisible({ timeout: 15_000 });
      await pageB
        .locator('[data-message-id]')
        .filter({ hasText: LIKED })
        .getByRole('button', { name: /^J’aime le message/ })
        .first()
        .click();

      // A sees the count appear live (D-8: shown from the first like — it IS the affordance).
      const countBtn = pageA
        .locator('[data-message-id]')
        .filter({ hasText: LIKED })
        .getByRole('button', { name: /^Voir qui aime le message/ })
        .first();
      await expect(countBtn).toBeVisible({ timeout: 15_000 });
      await countBtn.click();

      const panel = pageA.getByRole('dialog', { name: 'Aimé par' });
      await expect(panel).toBeVisible({ timeout: 10_000 });
      await expect(panel).toContainText('E2E CS10_B');

      // R2-B3: opening the list did NOT like anything on A's behalf — A's own heart is untouched.
      await expect(
        pageA
          .locator('[data-message-id]')
          .filter({ hasText: LIKED })
          .getByRole('button', { name: /^J’aime le message/ })
          .first(),
      ).toHaveAttribute('aria-pressed', 'false');

      // Escape closes it and hands focus back to the count (keyboard operable).
      await pageA.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(countBtn).toBeFocused();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MC-11 salon — Répondre + J'aime only, and the server backs that up
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-15 — the salon carries NEITHER Modifier NOR Supprimer', () => {
  test.describe.configure({ mode: 'serial' });

  async function openSalon(page: Page) {
    await page.goto('/');
    const header = page.getByRole('button', { name: /Le Comptoir/ });
    await expect(header).toBeVisible({ timeout: 10_000 });
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  }

  test('MC15-E6: the menu offers Répondre alone — and PATCH/DELETE on a salon message are 403', async ({
    page,
    context,
  }) => {
    await login(page, A_EMAIL);
    await openSalon(page);

    // Join, then post through the API with the browser's own session (the dock's own path is MC-11's).
    await context.request.post(`${API}/salon/join`);
    const body = `MC15 salon ${Date.now()}`;
    const posted = await context.request.post(`${API}/salon/messages`, { data: { body } });
    expect(posted.ok()).toBeTruthy();
    const message = (await posted.json()) as { id: string };

    await page.reload();
    await openSalon(page);
    const feed = page.getByRole('log', { name: 'Le Comptoir' });
    await expect(feed.getByText(body)).toBeVisible({ timeout: 15_000 });

    await feed.getByRole('button', { name: /^Actions du message/ }).last().click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Répondre' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Modifier' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Supprimer' })).toHaveCount(0);

    // The gate is the SERVER's, not the menu's: a client that sends them anyway is refused.
    const patch = await context.request.patch(`${API}/messages/${message.id}`, {
      data: { text: 'réécriture interdite' },
    });
    expect(patch.status()).toBe(403);
    const del = await context.request.delete(`${API}/messages/${message.id}`);
    expect(del.status()).toBe(403);
  });

  test('MC15-E7: a salon message can be quoted and liked', async ({ page, context }) => {
    await login(page, A_EMAIL);
    await context.request.post(`${API}/salon/join`);
    const body = `MC15 salon quote ${Date.now()}`;
    expect((await context.request.post(`${API}/salon/messages`, { data: { body } })).ok()).toBeTruthy();

    await openSalon(page);
    const feed = page.getByRole('log', { name: 'Le Comptoir' });
    await expect(feed.getByText(body)).toBeVisible({ timeout: 15_000 });

    // J'aime through the heart (never double-click only).
    await feed.getByRole('button', { name: /J’aime le message/ }).last().click();
    await expect(
      feed.getByRole('button', { name: /^Je n’aime plus le message/ }).last(),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

    // Répondre puts the quote in the dock's composer.
    await feed.getByRole('button', { name: /^Actions du message/ }).last().click();
    await page.getByRole('menuitem', { name: 'Répondre' }).click();
    await expect(page.getByText(/Réponse à/)).toBeVisible();
  });

  /**
   * R2-A / D-7 (round 2) — a DELIBERATE departure from an `Explicit` replica screen, approved by the
   * user on 2026-08-02: the prototype (line 2975) draws every salon bubble identically (flex-start,
   * card fill, sender name above). Own messages now align RIGHT with the ink fill, like the widget
   * and the Discussion panel. Do NOT "restore the prototype" — MC-11's story notes record this too.
   */
  test('MC15-E10 (R2-A): my salon message aligns RIGHT and drops its own label; theirs stays LEFT', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const stamp = Date.now();
    const MINE = `MC15 R2A mine ${stamp}`;
    const THEIRS = `MC15 R2A theirs ${stamp}`;
    try {
      await login(pageA, A_EMAIL);
      await ctxA.request.post(`${API}/salon/join`);
      expect((await ctxA.request.post(`${API}/salon/messages`, { data: { body: MINE } })).ok()).toBeTruthy();

      await login(pageB, B_EMAIL);
      await ctxB.request.post(`${API}/salon/join`);
      expect((await ctxB.request.post(`${API}/salon/messages`, { data: { body: THEIRS } })).ok()).toBeTruthy();

      await openSalon(pageA);
      const rowMine = pageA.locator('[data-message-id]').filter({ hasText: MINE }).first();
      const rowTheirs = pageA.locator('[data-message-id]').filter({ hasText: THEIRS }).first();
      await expect(rowMine).toBeVisible({ timeout: 15_000 });

      await expect(rowMine).toHaveAttribute('data-mine', 'true');
      await expect(rowMine).toHaveCSS('align-self', 'flex-end');
      // My own name above my own bubble is noise once the side already says it.
      await expect(rowMine).not.toContainText('E2E CS10_A');

      await expect(rowTheirs).toHaveAttribute('data-mine', 'false');
      await expect(rowTheirs).toHaveCSS('align-self', 'flex-start');
      await expect(rowTheirs).toContainText('E2E CS10_B');
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MC-9 widget — the same shared components inside the floating panel
// ─────────────────────────────────────────────────────────────────────────────

test('MC15-E8: the widget’s bubbles carry the menu (mine: 3 items, theirs: Répondre)', async ({
  browser,
}) => {
  // Deliberately NOT the MC-9 MSG_A/MSG_B seeded DM: opening it marks it read and would eat the
  // unread badge MC9-E1 asserts. This drives the CS-8 project thread instead, which THIS spec owns —
  // the widget lists it as a « E2E CS8 · Discussion » row (Conversation.projectId).
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const MINE = `MC15 widget mine ${Date.now()}`;
  const THEIRS = `MC15 widget theirs ${Date.now()}`;
  try {
    await login(pageB, B_EMAIL);
    await openDiscussion(pageB);
    await sendMessage(pageB, THEIRS);

    await login(pageA, A_EMAIL);
    await openDiscussion(pageA); // provisions/refreshes the conversation for A too
    await sendMessage(pageA, MINE);

    await pageA.getByRole('button', { name: /^Messages/ }).click();
    const panel = pageA.getByRole('dialog', { name: 'Messages' });
    await panel.getByText('E2E CS8 · Discussion', { exact: true }).first().click();

    const log = panel.getByRole('log', { name: 'Messages' });
    await expect(log.getByText(MINE, { exact: true })).toBeVisible({ timeout: 15_000 });

    await log.getByRole('button', { name: 'Actions du message de moi' }).last().click();
    await expect(pageA.getByRole('menu').getByRole('menuitem')).toHaveCount(3);

    await log.getByRole('button', { name: /Actions du message de E2E CS10_B/ }).last().click();
    await expect(pageA.getByRole('menu').getByRole('menuitem')).toHaveCount(1);
    await expect(pageA.getByRole('menu').getByRole('menuitem', { name: 'Répondre' })).toBeVisible();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive — the menu never leaves the viewport, asserted by RECT (never toBeVisible)
// ─────────────────────────────────────────────────────────────────────────────

for (const width of [375, 768, 1280]) {
  test(`MC15-E9: at ${width}px the actions menu stays inside the viewport and nothing overflows`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
    await login(page, A_EMAIL);
    await openDiscussion(page);

    const msg = `MC15 responsive ${width} ${Date.now()}`;
    await sendMessage(page, msg);

    // The LAST message sits at the bottom edge, where an unclamped menu paints off-screen.
    await actionsFor(page, msg).click();
    const items = page.getByRole('menuitem');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    }
    await page.keyboard.press('Escape');

    expect(
      await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();

    // The salon dock draws the same action layer in a much narrower box — unfold it and re-check that
    // the bubble + "…" + heart row still fits (a mobile overflow would only show here).
    const dock = page.getByRole('button', { name: /Le Comptoir/ });
    await dock.click();
    await expect(page.getByRole('log', { name: 'Le Comptoir' })).toBeVisible({ timeout: 10_000 });
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
  });
}
