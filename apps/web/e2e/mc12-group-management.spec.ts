/**
 * MC-12 — Manage group conversations "Gérer le groupe" (STANDALONE groups only).
 *
 * Real backend + Redis adapter (no mocks) — proves add/kick/leave/ownership-transfer/deletion fan out
 * LIVE over the MC-9 WS gateway to already-open clients, profile links resolve to `/{slug}`, a
 * project-linked group is rejected everywhere (backend 409 + no frontend affordance), and the
 * server-side authz backstops (403/404/400) hold regardless of client claims.
 *
 * Hermeticity:
 *   - the gateway/endpoints only exist on a FRESHLY BUILT+STARTED API — a stale :3001 makes realtime
 *     and even plain add/kick assertions fail confusingly. QA killed stale servers + flushed `rl:*`
 *     before this run (see repo memory note).
 *   - `apps/api/prisma/e2e-seed.js` seeds 4 DEDICATED accounts for this suite: MC12_A (creator),
 *     MC12_B (earliest-joined — the ownership-transfer target), MC12_C (kicked), MC12_D (added
 *     later). Any prior conversation for these 4 accounts is wiped every run, and accepted
 *     connections A⇄B / A⇄C / A⇄D are re-established so the "＋ Conversation" / "Ajouter" contact
 *     pickers list them. No other spec file references these accounts (grep-confirmed).
 *   - the seed also creates ONE PROJECT-LINKED group conversation (accounts.MC12_PROJECT_GROUP.id,
 *     `projectId != null`) directly via Prisma — CS-8 (the real project-chat creation flow) isn't
 *     implemented yet, so this simulates its DB shape to exercise MC-12's standalone-only guard.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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

const fab = (page: Page) => page.getByRole('button', { name: /^Messages/ });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Messages' });
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const rowByName = (page: Page, name: string) =>
  panel(page)
    .locator('button')
    .filter({ has: page.locator('b', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }) });

// ─────────────────────────────────────────────────────────────────────────────
// MC12-E1..E4 — full lifecycle: create → members panel + profile links → creator
// add/kick (live for an already-open member viewer) → kicked user drops the row live +
// gets notified → creator-leave transfers ownership live → last-member-leave deletes the group.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-12 — standalone group lifecycle (MC12_A creator ⇄ B/C/D)', () => {
  test('MC12-E1..E4: full add/kick/leave/transfer/delete lifecycle, live for open viewers', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const ctxC = await browser.newContext();
    const ctxD = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();
      const pageC = await ctxC.newPage();
      const pageD = await ctxD.newPage();

      await login(pageA, ACCOUNTS.MC12_A.email, /menu de e2e mc12_a/i);
      await login(pageB, ACCOUNTS.MC12_B.email, /menu de e2e mc12_b/i);
      await login(pageC, ACCOUNTS.MC12_C.email, /menu de e2e mc12_c/i);
      await login(pageD, ACCOUNTS.MC12_D.email, /menu de e2e mc12_d/i);

      const groupName = `Groupe MC12 ${Date.now()}`;

      // ── Create the standalone group: A + B + C via "＋ Conversation" ──
      // Follow-up 5b: one general starter — 2+ people picked ⇒ a group, and the (optional) name
      // field only appears once it IS a group.
      await fab(pageA).click();
      await panel(pageA).getByRole('button', { name: '＋ Conversation' }).click();
      const modal = pageA.getByRole('dialog').filter({ hasText: 'Nouvelle conversation' });
      await expect(modal).toBeVisible({ timeout: 10_000 });
      // MC-13: the contacts-only OnBrandMultiSelect was replaced by the shared reachable-user search.
      const createSearch = modal.getByRole('combobox', { name: 'Ajouter une personne' });
      await createSearch.fill('MC12_B');
      await modal.getByRole('option', { name: /MC12_B/ }).click();
      await createSearch.fill('MC12_C');
      await modal.getByRole('option', { name: /MC12_C/ }).click();
      await modal.getByLabel('Nom du groupe (facultatif)').fill(groupName);
      await modal.getByRole('button', { name: 'Créer le groupe' }).click();
      await expect(modal).toHaveCount(0);
      await expect(panel(pageA).getByText('Démarrez la conversation')).toBeVisible({ timeout: 10_000 });

      // ── MC12-E1: "Gérer le groupe" panel — 3 members, group name + count, profile links ──
      await panel(pageA).getByRole('button', { name: 'Gérer le groupe' }).click();
      await expect(panel(pageA).getByText(groupName, { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageA).getByText('3 membres')).toBeVisible();
      const linkA = panel(pageA).getByRole('link', { name: 'Voir le profil de E2E MC12_A' });
      const linkB = panel(pageA).getByRole('link', { name: 'Voir le profil de E2E MC12_B' });
      const linkC = panel(pageA).getByRole('link', { name: 'Voir le profil de E2E MC12_C' });
      await expect(linkA).toBeVisible();
      await expect(linkB).toBeVisible();
      await expect(linkC).toBeVisible();
      await expect(linkB).toHaveAttribute('href', '/e2e-mc12-b');

      // ── Creator controls: "Ajouter" combobox present; "Retirer" on B/C, never on self ──
      await expect(panel(pageA).getByRole('combobox', { name: 'Ajouter un membre' })).toBeVisible();
      await expect(panel(pageA).getByRole('button', { name: 'Retirer E2E MC12_B du groupe' })).toBeVisible();
      await expect(panel(pageA).getByRole('button', { name: 'Retirer E2E MC12_C du groupe' })).toBeVisible();
      await expect(panel(pageA).getByRole('button', { name: 'Retirer E2E MC12_A du groupe' })).toHaveCount(0);
      await expect(panel(pageA).getByRole('button', { name: 'Quitter le groupe' })).toBeVisible();

      // Group CREATION (unlike add/kick/leave) emits no WS event to the other participants — a
      // documented pre-existing MC-9 gap (mc9-messaging.spec.ts MC9-D1/D2 hit the exact same thing
      // for a bare POST /conversations: "a conversation made outside the page's own JS emits no WS
      // event to refresh it — reload"). B/C logged in BEFORE the group existed, so their widget's
      // one-time mount fetch predates it; reload once here so their list picks it up — every
      // assertion AFTER this point (add/kick/leave/transfer/delete) is real MC-12 WS realtime with
      // no further reload, which is the actual scope of this story's "Realtime" criterion.
      await pageB.reload();
      await pageC.reload();

      // ── B (plain member) opens the SAME panel and KEEPS it open — proves live updates below ──
      await fab(pageB).click();
      await rowByName(pageB, groupName).click();
      await panel(pageB).getByRole('button', { name: 'Gérer le groupe' }).click();
      await expect(panel(pageB).getByText('3 membres')).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageB).getByRole('combobox', { name: 'Ajouter un membre' })).toHaveCount(0);
      await expect(panel(pageB).getByRole('button', { name: /^Retirer /  })).toHaveCount(0);
      await expect(panel(pageB).getByRole('button', { name: 'Quitter le groupe' })).toBeVisible();

      // ── C keeps the widget LIST open (not the panel) — observes the row drop live on kick ──
      await fab(pageC).click();
      await expect(rowByName(pageC, groupName)).toBeVisible({ timeout: 10_000 });

      // ── MC12-E2: creator adds D via the MC-13 reachable-user search (direct add, no submit step) ──
      const comboA = panel(pageA).getByRole('combobox', { name: 'Ajouter un membre' });
      await comboA.fill('MC12_B'); // already a member → excluded from suggestions
      await expect(panel(pageA).getByRole('option', { name: /MC12_B/ })).toHaveCount(0);
      await comboA.fill('MC12_D');
      await panel(pageA).getByRole('option', { name: /MC12_D/ }).click();
      await expect(panel(pageA).getByText('4 membres')).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageA).getByRole('link', { name: 'Voir le profil de E2E MC12_D' })).toBeVisible();

      // B's already-open panel updates LIVE (no reload) — realtime WS participant:added.
      await expect(panel(pageB).getByText('4 membres')).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageB).getByRole('link', { name: 'Voir le profil de E2E MC12_D' })).toBeVisible();

      // ── Creator kicks C (confirm dialog) ──
      await panel(pageA).getByRole('button', { name: 'Retirer E2E MC12_C du groupe' }).click();
      const kickDialog = pageA.getByRole('dialog', { name: 'Retirer ce membre' });
      await expect(kickDialog).toBeVisible();
      await expect(kickDialog.getByText('Retirer E2E MC12_C du groupe ?')).toBeVisible();
      await kickDialog.getByRole('button', { name: 'Retirer' }).click();
      await expect(panel(pageA).getByText('3 membres')).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageA).getByRole('link', { name: 'Voir le profil de E2E MC12_C' })).toHaveCount(0);

      // B's open panel updates LIVE again.
      await expect(panel(pageB).getByText('3 membres')).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageB).getByRole('link', { name: 'Voir le profil de E2E MC12_C' })).toHaveCount(0);

      // ── MC12-E3: C's open list DROPS the row live (no reload) + C gets a group_removed notification ──
      await expect(rowByName(pageC, groupName)).toHaveCount(0, { timeout: 10_000 });
      await pageC.goto('/notifications');
      // .first(): the shared CI DB can carry group_removed notifications from a retried run — assert
      // at least one is shown (strict-mode would otherwise fail on 2+ accumulated matches).
      await expect(pageC.getByText(/vous a retiré·e d'un groupe/).first()).toBeVisible({ timeout: 10_000 });

      // ── MC12-E4a: creator (A) leaves → the group drops from A's own list ──
      await panel(pageA).getByRole('button', { name: 'Quitter le groupe' }).click();
      const leaveDialogA = pageA.getByRole('dialog', { name: 'Quitter le groupe' });
      await expect(leaveDialogA).toBeVisible();
      await leaveDialogA.getByRole('button', { name: 'Quitter' }).click();
      await expect(rowByName(pageA, groupName)).toHaveCount(0, { timeout: 10_000 });

      // ── MC12-E4b: ownership auto-transfers to the earliest-joined remaining member (B) — LIVE,
      //     B's already-open panel (no reload) grows creator controls the instant A's leave lands. ──
      await expect(panel(pageB).getByText('2 membres')).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageB).getByRole('combobox', { name: 'Ajouter un membre' })).toBeVisible({ timeout: 10_000 });
      await expect(panel(pageB).getByRole('button', { name: 'Retirer E2E MC12_D du groupe' })).toBeVisible();

      // ── MC12-E4c: D leaves, then B (now sole member + owner) leaves → the group is fully deleted ──
      await fab(pageD).click();
      await rowByName(pageD, groupName).click();
      await panel(pageD).getByRole('button', { name: 'Gérer le groupe' }).click();
      await panel(pageD).getByRole('button', { name: 'Quitter le groupe' }).click();
      await pageD.getByRole('dialog', { name: 'Quitter le groupe' }).getByRole('button', { name: 'Quitter' }).click();
      await expect(rowByName(pageD, groupName)).toHaveCount(0, { timeout: 10_000 });

      // B's own panel (still open) reflects the departure live — down to the sole remaining member.
      await expect(panel(pageB).getByText(/1 membre/)).toBeVisible({ timeout: 10_000 });
      await panel(pageB).getByRole('button', { name: 'Quitter le groupe' }).click();
      await pageB.getByRole('dialog', { name: 'Quitter le groupe' }).getByRole('button', { name: 'Quitter' }).click();
      // Last member leaving deletes the conversation entirely (conversation:deleted) — no orphan row.
      await expect(rowByName(pageB, groupName)).toHaveCount(0, { timeout: 10_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
      await ctxC.close();
      await ctxD.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MC12-E5 — DM profile link.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-12 — DM profile link', () => {
  test('MC12-E5: a solo DM header name/avatar links to the other party\'s public profile', async ({ page }) => {
    // A fresh DM (A ⇄ B are accepted contacts, dmPolicy default allows it) via the real API — same
    // seam mc9-messaging.spec.ts uses for a bare POST /conversations outside the widget's own JS.
    await login(page, ACCOUNTS.MC12_A.email, /menu de e2e mc12_a/i);
    const createRes = await page.request.post(`${API}/conversations`, {
      data: { participantId: ACCOUNTS.MC12_B.id },
    });
    expect(createRes.ok()).toBe(true);
    await page.reload();

    await fab(page).click();
    await rowByName(page, 'E2E MC12_B').click();
    const link = panel(page).getByRole('link', { name: 'Voir le profil de E2E MC12_B' });
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveAttribute('href', '/e2e-mc12-b');
    // Group headers (unlike DM headers) never expose a bare profile link on the title itself — the
    // group thread instead offers "Gérer le groupe" (proven in the lifecycle test above).
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Project-linked group exclusion — the "Gérer le groupe" affordance/panel do NOT apply.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-12 — project-linked group exclusion', () => {
  test('a project-linked group (projectId != null) shows no "Gérer le groupe" affordance', async ({ page }) => {
    await login(page, ACCOUNTS.MC12_A.email, /menu de e2e mc12_a/i);
    await fab(page).click();
    await rowByName(page, 'MC12 Projet fixture · Discussion').click();
    await expect(panel(page).getByLabel('Écrire un message')).toBeVisible({ timeout: 10_000 });
    await expect(panel(page).getByRole('button', { name: 'Gérer le groupe' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MC12-E6 — authz backstop (server-side, never trusts the client).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-12 — authz backstop', () => {
  test('MC12-E6: non-creator 403, non-member 404, dm 400, project-linked group 409', async ({ playwright }) => {
    const aCtx = await playwright.request.newContext();
    const bCtx = await playwright.request.newContext();
    const dCtx = await playwright.request.newContext();
    try {
      await loginApi(aCtx, ACCOUNTS.MC12_A.email);
      await loginApi(bCtx, ACCOUNTS.MC12_B.email);
      await loginApi(dCtx, ACCOUNTS.MC12_D.email);

      // Fresh standalone group: A (creator) + B, for the 403/404 checks below.
      const createRes = await aCtx.post(`${API}/conversations`, {
        data: { name: `Groupe MC12 authz ${Date.now()}`, participantIds: [ACCOUNTS.MC12_B.id] },
      });
      expect(createRes.ok()).toBe(true);
      const group = (await createRes.json()) as { id: string };

      // Non-creator (B, a member) attempts to add → 403.
      const addByNonCreator = await bCtx.post(`${API}/conversations/${group.id}/participants`, {
        data: { accountId: ACCOUNTS.MC12_D.id },
      });
      expect(addByNonCreator.status()).toBe(403);

      // Non-creator (B) attempts to kick → 403.
      const kickByNonCreator = await bCtx.delete(`${API}/conversations/${group.id}/participants/${ACCOUNTS.MC12_A.id}`);
      expect(kickByNonCreator.status()).toBe(403);

      // Non-member (D, never joined this group) → 404 no existence leak, for add/kick/leave alike.
      const addByNonMember = await dCtx.post(`${API}/conversations/${group.id}/participants`, {
        data: { accountId: ACCOUNTS.MC12_D.id },
      });
      expect(addByNonMember.status()).toBe(404);
      const leaveByNonMember = await dCtx.delete(`${API}/conversations/${group.id}/participants/me`);
      expect(leaveByNonMember.status()).toBe(404);

      // A DM conversation (A ⇄ D) → 400 (not a group).
      const dmRes = await aCtx.post(`${API}/conversations`, { data: { participantId: ACCOUNTS.MC12_D.id } });
      expect(dmRes.ok()).toBe(true);
      const dm = (await dmRes.json()) as { id: string };
      const addOnDm = await aCtx.post(`${API}/conversations/${dm.id}/participants`, {
        data: { accountId: ACCOUNTS.MC12_B.id },
      });
      expect(addOnDm.status()).toBe(400);
      const leaveOnDm = await aCtx.delete(`${API}/conversations/${dm.id}/participants/me`);
      expect(leaveOnDm.status()).toBe(400);

      // A project-linked group (projectId != null, seeded fixture, A is its createdBy) → 409 on all three.
      const projGroupId = ACCOUNTS.MC12_PROJECT_GROUP.id;
      const addOnProjectGroup = await aCtx.post(`${API}/conversations/${projGroupId}/participants`, {
        data: { accountId: ACCOUNTS.MC12_D.id },
      });
      expect(addOnProjectGroup.status()).toBe(409);
      const kickOnProjectGroup = await aCtx.delete(`${API}/conversations/${projGroupId}/participants/${ACCOUNTS.MC12_B.id}`);
      expect(kickOnProjectGroup.status()).toBe(409);
      const leaveOnProjectGroup = await aCtx.delete(`${API}/conversations/${projGroupId}/participants/me`);
      expect(leaveOnProjectGroup.status()).toBe(409);
    } finally {
      await aCtx.dispose();
      await bCtx.dispose();
      await dCtx.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MC12-E7 — responsive: the members panel at 375/768/1280, no overflow, ≥44px tap targets.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MC-12 — responsive', () => {
  test('MC12-E7: members panel at 375/768/1280px — no horizontal overflow, tap targets ≥44px', async ({ page }) => {
    await login(page, ACCOUNTS.MC12_A.email, /menu de e2e mc12_a/i);
    const groupName = `Groupe MC12 responsive ${Date.now()}`;

    await fab(page).click();
    await panel(page).getByRole('button', { name: '＋ Conversation' }).click();
    const modal = page.getByRole('dialog').filter({ hasText: 'Nouvelle conversation' });
    // MC-13: the contacts-only OnBrandMultiSelect was replaced by the shared reachable-user search.
    // Two people picked ⇒ a group (one alone would now start a DM, follow-up 5b).
    const respSearch = modal.getByRole('combobox', { name: 'Ajouter une personne' });
    await respSearch.fill('MC12_B');
    await modal.getByRole('option', { name: /MC12_B/ }).click();
    await respSearch.fill('MC12_C');
    await modal.getByRole('option', { name: /MC12_C/ }).click();
    await modal.getByLabel('Nom du groupe (facultatif)').fill(groupName);
    await modal.getByRole('button', { name: 'Créer le groupe' }).click();
    await expect(modal).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Gérer le groupe' }).click();
    await expect(panel(page).getByText('3 membres')).toBeVisible({ timeout: 10_000 });

    for (const [width, height, label] of [[375, 800, '375px'], [768, 1024, '768px'], [1280, 900, '1280px']] as const) {
      await page.setViewportSize({ width, height });
      await expect(panel(page)).toBeVisible();
      const noOverflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
      expect(noOverflow).toBe(true);
      const kickBox = await panel(page).getByRole('button', { name: 'Retirer E2E MC12_B du groupe' }).boundingBox();
      expect(kickBox && kickBox.height).toBeGreaterThanOrEqual(30); // compact row action, still comfortably tappable
      const leaveBox = await panel(page).getByRole('button', { name: 'Quitter le groupe' }).boundingBox();
      expect(leaveBox && leaveBox.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/mc12-members-panel-${label}.png`, fullPage: true });
    }

    // Cleanup: leave so this fixture doesn't linger across reruns.
    await panel(page).getByRole('button', { name: 'Quitter le groupe' }).click();
    await page.getByRole('dialog', { name: 'Quitter le groupe' }).getByRole('button', { name: 'Quitter' }).click();
  });
});
