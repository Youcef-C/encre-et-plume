/**
 * CS-10 — Co-author permissions & revenue split "Gérer le groupe" — scoped e2e acceptance suite.
 *
 * Real backend + seeded e2e DB (apps/api/prisma/e2e-seed.js, "CS-10 'Gérer le groupe' fixture"
 * block): CS10_A owns `e2e-cs10-groupe` alone (leader/100 %); CS10_B is an already-accepted
 * Connection of A (so the InviteModal's picker — D5, no `recipient`/`fromWork` prop — finds B in
 * the contacts pool) but starts with NO membership row — this spec drives the real
 * invite → accept → promote → toggle → split → revoke flow itself, plus the last-leader and
 * sum-100 invariants and a direct-API authz probe (a forged request cannot bypass server checks).
 *
 * Split-test convention (CLAUDE.md): this spec + the auth/nav smoke only, not the full e2e suite.
 * Hermeticity traps: a stale API on :3001 429s everything (kill it + flush `rl:*`); Postgres on :5433.
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password123';
const A_EMAIL = 'qa_e2e_cs10_a@test.com';
const B_EMAIL = 'qa_e2e_cs10_b@test.com';
const C_EMAIL = 'qa_e2e_cs10_c@test.com';
const SLUG = 'e2e-cs10-groupe';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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

function roleSelect(page: Page, name: string) {
  return page.getByRole('combobox', { name: `Statut de ${name}` });
}

test.describe('CS-10 Gérer le groupe — e2e-cs10-groupe (A owner/leader, B invitee)', () => {
  test.describe.configure({ mode: 'serial' });

  /** The Scénario card CS10-E6 creates — CS10-E17 replays the direct-API write bypass against it. */
  let scenarioPageId = '';

  test('CS10-E0: logged out /projet/{slug}/groupe redirects to sign-in', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto(`/projet/${SLUG}/groupe`);
    await expect(page).toHaveURL(new RegExp(`/connexion\\?next=%2Fprojet%2F${SLUG}%2Fgroupe|/connexion\\?next=/projet/${SLUG}/groupe`), {
      timeout: 10_000,
    });
    await ctx.close();
  });

  test('CS10-E1: A alone — replica header, empty-state hint, only own row, no revoke button', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await expect(page.getByRole('heading', { name: 'Groupe & permissions' })).toBeVisible();
    await expect(
      page.getByText('Gérez les membres du projet, leur statut, la fusion (merge) des versions et le partage des revenus.'),
    ).toBeVisible();
    await expect(page.getByText("Vous êtes seul·e dans le groupe pour l'instant.")).toBeVisible();
    await expect(page.getByText('Vous', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Révoquer/ })).toHaveCount(0);
    // Prototype replica: exact column header labels, in order.
    for (const label of ['Membre', 'Lecture', 'Écriture', 'Corrections', 'Fusion', 'Admin']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Autorisation de fusion (merge)', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Partage des revenus', { exact: true })).toBeVisible();
  });

  test('CS10-E2: A invites B via the "＋ Inviter un membre" picker modal (D5) → sent, pending row shows', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await page.getByRole('button', { name: '＋ Inviter un membre' }).click();
    await expect(page.getByRole('dialog', { name: 'Proposer une collab' })).toBeVisible();

    // 2026-07-26: the Contacts dropdown was retired — the reachable-user search IS the recipient
    // field now, listing contacts idle and turning a pick into a chip (same flow as MC3-D1).
    const dialog = page.getByRole('dialog', { name: 'Proposer une collab' });
    await dialog.getByRole('option', { name: /E2E CS10_B/ }).click();
    await expect(
      dialog.getByRole('list', { name: 'Destinataires sélectionnés' }).getByText('E2E CS10_B'),
    ).toBeVisible();
    await page.getByRole('button', { name: "Envoyer l'invitation" }).click();
    await expect(page.getByText('Envoyée')).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: 'Fermer', exact: true }).and(page.locator('.ep-btn-primary')).click();

    // The modal close refetches — B shows as a display-only "· En attente" row (D3/D7).
    await expect(page.getByText('E2E CS10_B').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('· En attente')).toBeVisible();
  });

  test('CS10-E3: B accepts the invite from /invitations (MC-3, real membership grant)', async ({ page }) => {
    await login(page, B_EMAIL);
    await page.goto('/invitations');
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText('Acceptée', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('CS10-E4: A sees B as Membre (real membership row, defaults: member/0 %/écriture+corrections)', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await expect(page.getByText('E2E CS10_B').first()).toBeVisible({ timeout: 8_000 });
    // AcceptedChip renders "·" + a CheckIcon (no text) + "Accepté" with no space between
    // text nodes (U-4 icon sweep) — the chip's own text content is "·Accepté", never the
    // standalone string "Accepté", so this must NOT use { exact: true }.
    await expect(page.getByText('Accepté').last()).toBeVisible();
    await expect(roleSelect(page, 'E2E CS10_B')).toHaveText(/Membre/);
    // Member row: real interactive switches (not the leader's implied static check icon).
    await expect(page.getByRole('switch', { name: 'Écriture — E2E CS10_B' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'Fusion — E2E CS10_B' })).toHaveAttribute('aria-checked', 'false');
  });

  test('CS10-E5: A toggles B\'s Fusion on then Écriture off (PATCH /members/:id, response swap)', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    const fusion = page.getByRole('switch', { name: 'Fusion — E2E CS10_B' });
    await fusion.click();
    await expect(fusion).toHaveAttribute('aria-checked', 'true', { timeout: 8_000 });
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Fusion — E2E CS10_B' })).toHaveAttribute('aria-checked', 'true');

    const ecriture = page.getByRole('switch', { name: 'Écriture — E2E CS10_B' });
    await ecriture.click();
    await expect(ecriture).toHaveAttribute('aria-checked', 'false', { timeout: 8_000 });
  });

  test("CS10-E6: without Écriture, B's editor is read-only (Lecture seule banner, CS-4 seam wired)", async ({ page, browser }) => {
    // A creates a Scénario card so there is something to open.
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}`);
    const scenarioCol = page.getByRole('group').filter({ hasText: 'Scénario' });
    await scenarioCol.getByRole('button', { name: '＋ Ajouter une carte' }).click();
    await expect(scenarioCol.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 5_000 });
    const cardLink = page.locator('div[draggable="true"]').filter({ hasText: 'Page 1' }).getByRole('link', { name: 'Éditer le scénario' });
    await cardLink.click();
    await expect(page).toHaveURL(new RegExp(`/projet/${SLUG}/editeur/`), { timeout: 10_000 });
    const pageId = page.url().split('/editeur/')[1];
    scenarioPageId = pageId!;

    const bCtx = await browser.newContext();
    const bPage = await bCtx.newPage();
    await login(bPage, B_EMAIL);
    await bPage.goto(`/projet/${SLUG}/editeur/${pageId}`);
    await expect(bPage.getByText('Lecture seule')).toBeVisible({ timeout: 10_000 });
    // Round 3 (F16-R3) — the banner alone let a bypass survive two QA rounds (see CS10-E17): the
    // write affordance must also be disabled so the UI doesn't dead-end on the server's 403. (The
    // "nouvelle version" split button only renders once an asset exists — asserted in CS10-E17.)
    await expect(bPage.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
    await bCtx.close();
  });

  // ── Round 3 · B-2 (reviewer, blocking, HIGH) ──────────────────────────────────────────────────
  // CS10-E6 asserted only the client-side banner — a UI observation — which is exactly why the
  // « Écriture » bypass survived. The permission was enforced on the WS relay only; the editor's
  // REST persistence routes were member-gated but not permission-gated, so B (Écriture OFF) got
  // `PATCH /pages/:id/document → 200` (materializing the project's scenario asset) and
  // `POST …/versions → 201`. This replays that exact reproduction, inverted, plus a positive control.
  test('CS10-E17: direct-API write probe — without Écriture both editor write routes 403; with it they succeed', async ({ page, browser }) => {
    expect(scenarioPageId).not.toBe('');
    const draft = {
      // A VALID (empty) Yjs update — `Y.encodeStateAsUpdate(new Y.Doc())` is the two bytes [0,0].
      // Arbitrary bytes would persist an undecodable CRDT state that makes the client's `sync`
      // handler throw in `Y.applyUpdate` before it ever reads the payload (see frontend-notes O1).
      ydocState: Buffer.from([0, 0]).toString('base64'),
      contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'forgé' }] }] },
      html: '<p>écriture forcée par appel direct</p>',
    };

    const bCtx = await browser.newContext();
    const bPage = await bCtx.newPage();
    await login(bPage, B_EMAIL); // B's real session cookies ride on bCtx.request
    const b = bCtx.request;

    // Écriture is OFF (set through the real UI in CS10-E5) → both write routes must refuse.
    const blockedSave = await b.patch(`${API}/pages/${scenarioPageId}/document`, { data: draft });
    expect(blockedSave.status()).toBe(403);
    expect((await blockedSave.json()).message).toContain('Écriture');
    const blockedSnapshot = await b.post(`${API}/pages/${scenarioPageId}/document/versions`, { data: { html: draft.html } });
    expect(blockedSnapshot.status()).toBe(403);

    // Reading stays open to any member — the toggle governs writing, not seeing.
    expect((await b.get(`${API}/pages/${scenarioPageId}/document`)).status()).toBe(200);

    // Positive control: A flips Écriture back ON, the SAME two calls now go through — proving the
    // routes read the permission, not just membership (which never changed).
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    const ecriture = page.getByRole('switch', { name: 'Écriture — E2E CS10_B' });
    await ecriture.click();
    await expect(ecriture).toHaveAttribute('aria-checked', 'true', { timeout: 8_000 });

    expect((await b.patch(`${API}/pages/${scenarioPageId}/document`, { data: draft })).status()).toBe(200);
    expect((await b.post(`${API}/pages/${scenarioPageId}/document/versions`, { data: { html: draft.html } })).status()).toBe(201);

    // Restore the suite's state (CS10-E8 asserts the stored Écriture toggle is still off after a demote).
    await ecriture.click();
    await expect(ecriture).toHaveAttribute('aria-checked', 'false', { timeout: 8_000 });

    // The server gate follows the toggle back down (not just the UI).
    expect((await b.patch(`${API}/pages/${scenarioPageId}/document`, { data: draft })).status()).toBe(403);

    // F16-R3, second half: now that the asset exists the "nouvelle version" split button renders —
    // with Écriture off again it must be disabled too, matching the server gate.
    await bPage.goto(`/projet/${SLUG}/editeur/${scenarioPageId}`);
    await expect(bPage.getByText('Lecture seule')).toBeVisible({ timeout: 10_000 });
    await expect(bPage.getByRole('button', { name: 'Enregistrer une nouvelle version' })).toBeDisabled();
    await bCtx.close();
  });

  test('CS10-E7: A promotes B to Co-chef·fe → permission cells become the implied static check icon', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await roleSelect(page, 'E2E CS10_B').click();
    await page.getByRole('option', { name: 'Co-chef·fe' }).click();
    await expect(roleSelect(page, 'E2E CS10_B')).toHaveText(/Co-chef·fe/, { timeout: 8_000 });
    // Leadership implies every permission — no interactive switch left on that row.
    await expect(page.getByRole('switch', { name: /E2E CS10_B/ })).toHaveCount(0);
  });

  // ── Round 2 · B-1 (reviewer, blocking) ────────────────────────────────────────────────────────
  // `POST /invitations` used to gate on `ownerId === sender`, so the CO-LEADER role CS-10 itself
  // introduces was 403'd on the one action the Groupe page offers them. Runs here, between E7
  // (B promoted) and E8 (B demoted), because it needs B to actually hold co-leadership.
  test('CS10-E15: a CO-LEADER can invite from the Groupe page — project preselected, invite sent', async ({ page }) => {
    await login(page, B_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await page.getByRole('button', { name: '＋ Inviter un membre' }).click();
    await expect(page.getByRole('dialog', { name: 'Proposer une collab' })).toBeVisible();

    // F15-R2: `/projects/mine` is owner-scoped, so without the fix the picker was blank for B.
    const projectRow = page.getByRole('radio', { name: /E2E CS10 · Groupe/ });
    await expect(projectRow).toBeVisible({ timeout: 8_000 });
    await expect(projectRow).toHaveAttribute('aria-checked', 'true');

    // 2026-07-26: Contacts dropdown retired — the reachable-user search is the recipient field.
    await page.getByRole('dialog', { name: 'Proposer une collab' }).getByRole('option', { name: /E2E CS10_C/ }).click();
    await page.getByRole('button', { name: "Envoyer l'invitation" }).click();
    await expect(page.getByText('Envoyée')).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: 'Fermer', exact: true }).and(page.locator('.ep-btn-primary')).click();
    await expect(page.getByText('E2E CS10_C').first()).toBeVisible({ timeout: 8_000 });

    // Direct-API probe: the co-leader gate is server-side, not just an unblocked button.
    const projectId = await getProjectId(page.context().request, SLUG);
    const cId = await getAccountId(page.context().request, C_EMAIL);
    const asColeader = await page.context().request.post(`${API}/invitations`, {
      data: { kind: 'direct', toUsers: [cId], projectId },
    });
    // 201 with a per-recipient result (a second send to the same person is a `duplicate`, not a 403).
    expect(asColeader.status()).toBe(201);
    expect((await asColeader.json()).results[0].status).not.toBe(undefined);
  });

  test('CS10-E8: A demotes B back to Membre — stored toggles restored (Écriture still off)', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await roleSelect(page, 'E2E CS10_B').click();
    await page.getByRole('option', { name: 'Membre', exact: true }).click();
    await expect(roleSelect(page, 'E2E CS10_B')).toHaveText(/Membre/, { timeout: 8_000 });
    await expect(page.getByRole('switch', { name: 'Écriture — E2E CS10_B' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Fusion — E2E CS10_B' })).toHaveAttribute('aria-checked', 'true');

    // B-1's other half: a PLAIN member is still refused the project invite, server-side.
    const projectId = await getProjectId(page.context().request, SLUG);
    const bCtx = await page.context().browser()!.newContext();
    const bLogin = await bCtx.request.post(`${API}/auth/login`, { data: { email: B_EMAIL, password: PASSWORD } });
    expect(bLogin.ok()).toBeTruthy();
    const asMember = await bCtx.request.post(`${API}/invitations`, {
      data: { kind: 'direct', toUsers: ['whoever'], projectId },
    });
    expect(asMember.status()).toBe(403);
    expect((await asMember.json()).message).toBe('Ce projet ne vous appartient pas.');
    await bCtx.close();
  });

  // ── Round 2 · U-3 (user, blocking) ────────────────────────────────────────────────────────────
  // The switches used to be laid out per-row and drifted out of their column. Asserted, not eyeballed.
  // Placed here because it needs B to still be a plain member (a leader row has no switch).
  test('CS10-E16: permission switches line up with their column header (1280) and are ≥44px (375)', async ({ page }) => {
    await login(page, A_EMAIL);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projet/${SLUG}/groupe`);
    const header = page.locator('.ep-group-head .ep-group-cell').filter({ hasText: 'Fusion' });
    const sw = page.getByRole('switch', { name: 'Fusion — E2E CS10_B' });
    await expect(sw).toBeVisible({ timeout: 8_000 });
    const hBox = (await header.boundingBox())!;
    const sBox = (await sw.boundingBox())!;
    const center = sBox.x + sBox.width / 2;
    expect(center).toBeGreaterThanOrEqual(hBox.x);
    expect(center).toBeLessThanOrEqual(hBox.x + hBox.width);

    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/projet/${SLUG}/groupe`);
    const mobileSw = page.getByRole('switch', { name: 'Fusion — E2E CS10_B' });
    await expect(mobileSw).toBeVisible({ timeout: 8_000 });
    const mBox = (await mobileSw.boundingBox())!;
    expect(mBox.width).toBeGreaterThanOrEqual(44);
    expect(mBox.height).toBeGreaterThanOrEqual(44);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test('CS10-E9: last-leader protection — A (sole leader) cannot demote self to Membre', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await roleSelect(page, 'E2E CS10_A').click();
    await page.getByRole('option', { name: 'Membre', exact: true }).click();
    await expect(page.getByText('Le groupe doit garder au moins un·e chef·fe de groupe.')).toBeVisible({ timeout: 8_000 });
    await expect(roleSelect(page, 'E2E CS10_A')).toHaveText(/Chef·fe de groupe/);
  });

  test('CS10-E10: B (plain member) sees the group read-only — no controls, but "Votre part"', async ({ page }) => {
    await login(page, B_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await expect(page.getByText('Votre part')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Révoquer/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '＋ Inviter un membre' })).toHaveCount(0);
    await expect(page.locator('input[type="number"]')).toHaveCount(0);
    await expect(page.getByRole('slider')).toHaveCount(0);
  });

  test('CS10-E11: revenue split — sum ≠ 100 disables save + shows the error; sum = 100 saves and persists', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);

    const aInput = page.getByLabel('Votre part exacte');
    const bInput = page.getByLabel('Part exacte de E2E CS10_B');
    await aInput.fill('60');
    await bInput.fill('20');
    await expect(page.getByText('Le total des parts doit faire 100 %.')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Enregistrer la répartition' })).toBeDisabled();

    await bInput.fill('40');
    await expect(page.getByText('Total : 100 %')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer la répartition' })).toBeEnabled();
    await page.getByRole('button', { name: 'Enregistrer la répartition' }).click();
    await expect(page.getByText('Le total des parts doit faire 100 %.')).toHaveCount(0, { timeout: 8_000 });

    await page.reload();
    await expect(page.getByLabel('Votre part exacte')).toHaveValue('60');
    await expect(page.getByLabel('Part exacte de E2E CS10_B')).toHaveValue('40');
    // U-2: the slider mirrors the same draft.
    await expect(page.getByRole('slider', { name: 'Votre part' })).toHaveValue('60');
  });

  test('CS10-E12: revoke B (confirm modal, .ep-btn-danger) → B disappears, share (40 %) returns to A', async ({ page }) => {
    await login(page, A_EMAIL);
    await page.goto(`/projet/${SLUG}/groupe`);
    await page.getByRole('button', { name: 'Révoquer E2E CS10_B' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Révoquer E2E CS10_B ?')).toBeVisible();
    await expect(dialog.getByText(/Sa part de 40 % sera transférée/)).toBeVisible();
    const confirmBtn = dialog.getByRole('button', { name: 'Révoquer' });
    await expect(confirmBtn).toHaveClass(/ep-btn-danger/);
    await confirmBtn.click();

    await expect(page.getByText('E2E CS10_B')).toHaveCount(0, { timeout: 8_000 });
    await expect(page.getByLabel('Votre part exacte')).toHaveValue('100');
    await expect(page.getByText('Total : 100 %')).toBeVisible();

    // B lost access — 403/404, never the workspace.
    const bCtx = await page.context().browser()!.newContext();
    const bPage = await bCtx.newPage();
    await login(bPage, B_EMAIL);
    await bPage.goto(`/projet/${SLUG}/groupe`);
    await expect(bPage.getByText('Groupe indisponible', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(bPage.getByText('Projet introuvable', { exact: true })).toBeVisible();
    await bCtx.close();
  });

  test('CS10-E13: direct-API authz probe — forged requests are rejected server-side, not just hidden client-side', async ({ page }) => {
    await login(page, A_EMAIL);
    const ctx = page.context();

    // Unknown member id → 404.
    const unknown = await ctx.request.patch(`${API}/members/does-not-exist`, { data: { groupRole: 'leader' } });
    expect(unknown.status()).toBe(404);

    // Sum ≠ 100 rejected even when sent straight to the API (A is now the sole/only member: 100 %).
    const badSplit = await ctx.request.patch(`${API}/projects/${SLUG}/revenue-split`, {
      data: { shares: [{ memberId: (await getSelfMemberId(ctx.request, SLUG)), pct: 50 }] },
    });
    expect(badSplit.status()).toBe(400);
    expect((await badSplit.json()).message).toContain('100');

    // A non-member (a fixture account with no relation to this project) is rejected on GET (project
    // is private → 404, never leaking existence) and on mutations (403/404).
    const utilisateur = await ctx.request.post(`${API}/auth/login`, {
      data: { email: 'qa_e2e_utilisateur@test.com', password: PASSWORD },
    });
    expect(utilisateur.ok()).toBeTruthy();
    const strangerCtx = await page.context().browser()!.newContext();
    const stranger = strangerCtx.request;
    // Re-login inside the fresh context so its cookie jar carries the stranger's session.
    const strangerLogin = await stranger.post(`${API}/auth/login`, {
      data: { email: 'qa_e2e_utilisateur@test.com', password: PASSWORD },
    });
    expect(strangerLogin.ok()).toBeTruthy();
    const strangerGet = await stranger.get(`${API}/projects/${SLUG}/members`);
    expect(strangerGet.status()).toBe(404);
    const strangerSplit = await stranger.patch(`${API}/projects/${SLUG}/revenue-split`, {
      data: { shares: [{ memberId: 'whatever', pct: 100 }] },
    });
    expect([403, 404]).toContain(strangerSplit.status());
    await strangerCtx.close();
  });

  test('CS10-E14: responsive — 375 / 768 / 1280, no horizontal overflow, stacked mobile cards', async ({ page }) => {
    await login(page, A_EMAIL);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/projet/${SLUG}/groupe`);
      await expect(page.getByRole('heading', { name: 'Groupe & permissions' })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
    }
    // Mobile: the fixed-width column header is hidden, rows stack (F8).
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/projet/${SLUG}/groupe`);
    await expect(page.locator('.ep-group-head')).toBeHidden();
  });
});

/** Read the caller's own WorkCreator id from the group payload — used to build a valid-shape,
 *  invalid-VALUE split request for the direct-API sum-100 probe (CS10-E13). */
async function getSelfMemberId(ctx: import('@playwright/test').APIRequestContext, slug: string): Promise<string> {
  const res = await ctx.get(`${API}/projects/${slug}/members`);
  const body = await res.json();
  return body.viewer.memberId as string;
}

/** The Project id behind a slug — `POST /invitations` takes an id, not a slug (deviation D5). */
async function getProjectId(ctx: import('@playwright/test').APIRequestContext, slug: string): Promise<string> {
  const res = await ctx.get(`${API}/projects/${slug}/members`);
  return (await res.json()).projectId as string;
}

/** Resolve a fixture account id by display name through the caller's own contacts list. */
async function getAccountId(ctx: import('@playwright/test').APIRequestContext, email: string): Promise<string> {
  const key = email.replace('qa_e2e_', '').replace('@test.com', '').toUpperCase(); // cs10_c → CS10_C
  const res = await ctx.get(`${API}/contacts`);
  const body = await res.json();
  const hit = (body.items as { userId: string; name: string }[]).find((i) => i.name === `E2E ${key}`);
  if (!hit) throw new Error(`No contact named "E2E ${key}" for this session`);
  return hit.userId;
}
