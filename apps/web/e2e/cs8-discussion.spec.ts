/**
 * CS-8 « Espace projet → Discussion » — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB (apps/api/prisma/e2e-seed.js, "CS-8: project Discussion fixture"):
 * `e2e-cs8-discussion` is owned by CS10_A with CS10_B as a co-author — TWO members, so the thread's
 * both-directions visibility is real, not simulated. The conversation itself is NOT seeded: it is
 * provisioned by the API on first access, which is precisely CS-8's provisioning path.
 *
 * Split-test convention (CLAUDE.md): this spec + the auth/nav smoke only, plus mc9-messaging as the
 * shared-backend regression. Hermeticity traps: a stale API on :3001 429s everything (kill it +
 * flush `rl:*`); Postgres on :5433.
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASSWORD = 'password123';
const A_EMAIL = 'qa_e2e_cs10_a@test.com'; // owner
const B_EMAIL = 'qa_e2e_cs10_b@test.com'; // co-author
const STRANGER_EMAIL = 'qa_e2e_cs13_stranger@test.com'; // signed in, NOT a project member
const SLUG = 'e2e-cs8-discussion';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
}

async function openDiscussion(page: Page) {
  await page.goto(`/projet/${SLUG}?tab=discussion`);
  await expect(page.getByText('Discussion du projet')).toBeVisible({ timeout: 15_000 });
  // Wait for the history fetch to settle (the composer only renders once canPost is known).
  await expect(page.getByLabel('Écrire à l’équipe')).toBeVisible({ timeout: 10_000 });
}

async function sendMessage(page: Page, text: string) {
  await page.getByLabel('Écrire à l’équipe').fill(text);
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe('CS-8 Discussion — the team thread', () => {
  test.describe.configure({ mode: 'serial' });

  const OWNER_MSG = `Le nemu de la planche 4 est prêt ${Date.now()}`;
  const MEMBER_MSG = `Parfait, je relis le dialogue ${Date.now()}`;

  test('CS8-E1: the owner sends a message and it survives a reload (one thread per project)', async ({ page }) => {
    await login(page, A_EMAIL);
    await openDiscussion(page);
    // First access on a fresh fixture: the thread is empty until the first send.
    await expect(page.getByText('Aucun message')).toBeVisible();

    await sendMessage(page, OWNER_MSG);

    await page.reload();
    await expect(page.getByText(OWNER_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('CS8-E2: the co-author reads it and replies in the SAME thread (both directions)', async ({ page }) => {
    await login(page, B_EMAIL);
    await openDiscussion(page);
    // The owner's message is incoming for B — sender label above the bubble.
    await expect(page.getByText(OWNER_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });

    await sendMessage(page, MEMBER_MSG);
  });

  test('CS8-E3: the owner sees the reply (one conversation, no second thread)', async ({ page }) => {
    await login(page, A_EMAIL);
    await openDiscussion(page);
    await expect(page.getByText(MEMBER_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(OWNER_MSG, { exact: true })).toBeVisible();
  });

  test('CS8-E4: « Envoyer » stays disabled on an empty composer (F6)', async ({ page }) => {
    await login(page, A_EMAIL);
    await openDiscussion(page);
    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    await page.getByLabel('Écrire à l’équipe').fill('a');
    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  });

  // R2-3: the destroy affordance is now a "…" menu on the left of the bubble, holding « Supprimer ».
  test('CS8-E5: deleting my own message goes through the "…" menu and a confirmation (D-3/R2-3)', async ({ page }) => {
    await login(page, B_EMAIL);
    await openDiscussion(page);

    const bubble = page.getByText(MEMBER_MSG, { exact: true });
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    // MC-15: EVERY bubble carries the trigger (Répondre / J'aime apply to anyone's message), so the
    // trigger is scoped to this message's own row instead of counted across the thread.
    const actions = page
      .locator('[data-message-id]')
      .filter({ hasText: MEMBER_MSG })
      .getByRole('button', { name: /^Actions du message/ })
      .first();
    await expect(actions).toBeVisible();

    await actions.click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Supprimer le message');
    // Cancelling destroys nothing.
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(bubble).toBeVisible();

    await actions.click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(bubble).toHaveCount(0, { timeout: 10_000 });

    await page.reload();
    await expect(page.getByText(MEMBER_MSG, { exact: true })).toHaveCount(0, { timeout: 15_000 });
  });

  test("CS8-E6: I cannot delete someone else's message", async ({ page }) => {
    await login(page, A_EMAIL);
    await openDiscussion(page);
    await expect(page.getByText(OWNER_MSG, { exact: true })).toBeVisible({ timeout: 15_000 });
    // MC-15: my OWN bubble offers the three items…
    await page
      .locator('[data-message-id]')
      .filter({ hasText: OWNER_MSG })
      .getByRole('button', { name: /^Actions du message/ })
      .first()
      .click();
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Supprimer' })).toBeVisible();
    // …and no bare delete icon survives anywhere (the round-1 affordance is gone, not hidden).
    await expect(page.getByRole('button', { name: 'Supprimer mon message' })).toHaveCount(0);
    // Someone else's bubble offering Répondre and NOTHING destructive is covered end-to-end by
    // MC15-E1 (mc15-message-actions.spec.ts), where both members are logged in on the same thread.
  });
});

test.describe('CS-8 Discussion — authorization', () => {
  test('CS8-E7: a non-member sees no discussion at all (private project → 404 card)', async ({ page }) => {
    await login(page, STRANGER_EMAIL);
    await page.goto(`/projet/${SLUG}?tab=discussion`);
    await expect(page.getByText('Projet introuvable')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Discussion du projet')).toHaveCount(0);
    await expect(page.getByLabel('Écrire à l’équipe')).toHaveCount(0);
  });
});

test.describe('CS-8 Discussion — responsive sweep (375/768/1280)', () => {
  for (const width of [375, 768, 1280]) {
    test(`${width}px — no page-level horizontal overflow; composer reachable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, A_EMAIL);
      await openDiscussion(page);

      expect(await noHorizontalOverflow(page)).toBe(true);
      await expect(page.getByRole('button', { name: 'Envoyer' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Joindre un fichier' })).toBeVisible();
      await page.screenshot({ path: `test-results/cs8-discussion-${width}.png`, fullPage: true });
    });
  }

  /**
   * R2-C (review BLK-2) — `toBeVisible()` knows nothing about stacking-order occlusion, which is why
   * round 1 passed while the composer sat UNDER the fixed MC-9 FAB / MC-11 salon dock. The only
   * assertion that catches it is a real hit test at the control's own painted edges.
   */
  test('CS8-E10: at 375px a hit test on the composer resolves to the composer (R2-C)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await login(page, A_EMAIL);
    await openDiscussion(page);
    // The global widgets must be on screen — they are what buried the composer.
    await expect(page.getByRole('button', { name: /^Messages/ })).toBeVisible();

    const input = page.getByLabel('Écrire à l’équipe');
    const send = page.getByRole('button', { name: 'Envoyer' });

    expect(await hitTestEdges(input)).toEqual(['self', 'self', 'self']);
    expect(await hitTestEdges(send)).toEqual(['self', 'self', 'self']);
  });

  /**
   * The band is fixed to the VIEWPORT, so clearing it at one scroll offset is luck, not a fix. On a
   * shorter phone (375×667) the composer starts below the fold and scrolls up THROUGH the band —
   * this parks it right in the middle of it and asserts it still owns its own pixels.
   */
  test('CS8-E11: the composer still clears the widgets when scrolled into their band (R2-C)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, A_EMAIL);
    await openDiscussion(page);

    // Scroll to the exact offset where the composer WOULD paint inside the fixed band.
    await page.evaluate(() => {
      const el = document.querySelector('.ep-discussion-composer')!;
      window.scrollBy(0, el.getBoundingClientRect().bottom - (window.innerHeight - 55));
    });

    expect(await hitTestEdges(page.getByLabel('Écrire à l’équipe'))).toEqual(['self', 'self', 'self']);
    expect(await hitTestEdges(page.getByRole('button', { name: 'Envoyer' }))).toEqual(['self', 'self', 'self']);
  });
});

/**
 * R3-C (review REG-1 / R3-2) — the LAST message of a thread sits at the bottom of the log, i.e. where
 * a menu hanging below its trigger paints off-screen. `toBeVisible()` sees neither occlusion nor
 * off-screen paint (that is what let round 1's buried composer pass), so this measures every item's
 * bounding rect against the viewport.
 */
test.describe('CS-8 Discussion — the last message’s menu stays on screen (R3-C)', () => {
  for (const width of [375, 1280]) {
    test(`${width}px — every "…" menu item of the last message is inside the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await login(page, A_EMAIL);
      await openDiscussion(page);

      // Fill the thread so its last bubble is pinned to the bottom of the log.
      const stamp = Date.now();
      for (let i = 0; i < 6; i++) await sendMessage(page, `R3C ${stamp} ligne ${i}`);

      // Park the panel as low as it goes: page scrolled to its end, log scrolled to its newest row.
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const log = document.querySelector('[role="log"]');
        if (log) log.scrollTop = log.scrollHeight;
      });

      const triggers = page.getByRole('button', { name: /^Actions du message/ });
      await triggers.last().click({ force: true });
      const items = page.getByRole('menuitem');
      await expect(items.first()).toBeVisible();

      const viewport = page.viewportSize()!;
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = (await items.nth(i).boundingBox())!;
        expect(box, `menu item ${i} has no box`).toBeTruthy();
        expect.soft(box.x, `item ${i} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(box.y, `item ${i} top edge`).toBeGreaterThanOrEqual(0);
        expect.soft(box.x + box.width, `item ${i} right edge`).toBeLessThanOrEqual(viewport.width);
        expect.soft(box.y + box.height, `item ${i} bottom edge`).toBeLessThanOrEqual(viewport.height);
      }
    });
  }
});

/**
 * `document.elementFromPoint` at the left / right / bottom edges of the control: 'self' when the
 * point really lands on it, otherwise a description of whatever is painted on top.
 */
async function hitTestEdges(target: Locator): Promise<string[]> {
  const box = (await target.boundingBox())!;
  const points = [
    { x: box.x + 3, y: box.y + box.height / 2 },
    { x: box.x + box.width - 3, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2, y: box.y + box.height - 3 },
  ];
  return target.evaluate(
    (el, pts) =>
      pts.map((p) => {
        const hit = document.elementFromPoint(p.x, p.y);
        if (hit && (hit === el || el.contains(hit))) return 'self';
        return `${hit?.tagName ?? 'nothing'} “${(hit?.textContent ?? '').trim().slice(0, 24)}”`;
      }),
    points,
  );
}

/**
 * R2-A + R2-B (review BLK-1 + BLK-3) — membership drives the thread, NOT who opens the Discussion
 * tab. Driven entirely through the API so no page visit can accidentally trigger the read-path
 * backfill and mask the defect: that lazy sync is exactly what round 1 relied on.
 */
test.describe('CS-8 Discussion — the thread follows membership', () => {
  async function loginApi(ctx: APIRequestContext, email: string) {
    const res = await ctx.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    expect(res.status(), `loginApi ${email}`).toBe(200);
  }

  /** The project's row in MC-9's own conversation list — what the Messages widget renders. */
  async function projectThread(ctx: APIRequestContext, projectId: string): Promise<string | null> {
    const res = await ctx.get(`${API}/conversations`);
    expect(res.status()).toBe(200);
    const { items } = (await res.json()) as { items: { id: string; projectId: string | null }[] };
    return items.find((c) => c.projectId === projectId)?.id ?? null;
  }

  // CS10_C, not CS10_B: the CS-10 spec drives its own A→B invite, and a pending one would make this
  // one answer `duplicate`. A→C is cleared by the seed and touched by nothing else.
  const C_EMAIL = 'qa_e2e_cs10_c@test.com';

  test('CS8-E9: created → invited → revoked, all through MC-9’s own routes', async ({ playwright }) => {
    const aCtx = await playwright.request.newContext();
    const bCtx = await playwright.request.newContext();
    await loginApi(aCtx, A_EMAIL);
    await loginApi(bCtx, C_EMAIL);

    // 1 · A creates a project. NOBODY opens a Discussion tab in this whole test.
    const title = `E2E CS8 R2 ${Date.now()}`;
    const created = await aCtx.post(`${API}/projects`, { data: { type: 'manga', title } });
    expect(created.status()).toBe(201);
    const { id: projectId, slug } = (await created.json()) as { id: string; slug: string };

    // R2-B — the thread is already listed for the owner, from day one.
    const convId = await projectThread(aCtx, projectId);
    expect(convId, 'a new project must have its thread listed in GET /conversations').toBeTruthy();

    // 2 · B accepts an invitation → gains the thread with no other member acting (R2-B, other end).
    const invited = await aCtx.post(`${API}/invitations`, {
      data: { toUsers: [ACCOUNTS.CS10_C.id], projectId },
    });
    expect(invited.status()).toBe(201);
    const invitationId = (await invited.json()).results[0].invitation.id as string;
    expect((await bCtx.patch(`${API}/invitations/${invitationId}`, { data: { status: 'accepted' } })).status()).toBe(200);

    expect(await projectThread(bCtx, projectId)).toBe(convId);
    expect((await bCtx.get(`${API}/conversations/${convId}/messages`)).status()).toBe(200);

    // 3 · A revokes B. R2-A: MC-9's OWN routes must refuse IMMEDIATELY — that is the route that was
    // open in round 1, and the revoked account is the one that can never trigger a read-path sync.
    const group = await (await aCtx.get(`${API}/projects/${slug}/members`)).json();
    const bRow = (group.members as { id: string; accountId: string }[]).find(
      (m) => m.accountId === ACCOUNTS.CS10_C.id,
    );
    expect(bRow, 'B must be a member before the revoke').toBeTruthy();
    expect((await aCtx.delete(`${API}/members/${bRow!.id}`)).status()).toBe(200);

    expect((await bCtx.get(`${API}/conversations/${convId}/messages`)).status()).toBe(404);
    expect(
      (await bCtx.post(`${API}/conversations/${convId}/messages`, { data: { body: 'je ne devrais pas pouvoir' } })).status(),
    ).toBe(404);
    // …and it is gone from their widget too (no realtime fan-out target left).
    expect(await projectThread(bCtx, projectId)).toBeNull();

    await aCtx.dispose();
    await bCtx.dispose();
  });
});
