/**
 * QA e2e for MC-14 — call capacity: auto-close when full, reopen when a seat frees.
 * user-stories/02-matching-collaboration/MC-14-call-capacity-auto-close-reopen.md
 *
 * Covers the acceptance checklist:
 *   1. Accepting the LAST sought seat auto-closes the call (closed/full); a non-final accept leaves
 *      it open.
 *   2. Removing (MC-7) or withdrawing (MC-6) a validated (accepted) applicant on a full/auto-closed
 *      call REOPENS it and it accepts applications again.
 *   3. An owner manual close ("Clôturer l'appel") stays closed even if a seat later frees.
 *   4. POST /applications on a closed call -> 409; the open board excludes closed calls.
 *   5. The applicant-side pill shows the decided status ("Acceptée"/"Refusée") instead of
 *      "Candidature envoyée" once decided.
 *
 * Hermeticity: same convention as calls-batch-fixes.spec.ts — every account is a fresh signup, every
 * call is created live and deleted at the end (`cleanupCall`), nothing touches the shared seed.js
 * fixtures (camille/dr1-camille-roux, seeded ProjectCall rows).
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';
const SAMPLE_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/avatar.jpg'));

let usernameSeq = 0;
function nextUsername(): string {
  usernameSeq += 1;
  return `qa-mc14-${Date.now().toString(36)}-${usernameSeq}`;
}

async function signUpVerifyAndLogin(page: Page, email: string, displayName: string): Promise<void> {
  const signupRes = await page.request.post(`${API}/auth/signup`, {
    data: { email, displayName, username: nextUsername(), password: PASSWORD, birthdate: '1990-01-01', acceptCgu: true },
  });
  if (!signupRes.ok()) throw new Error(`signup failed: ${signupRes.status()} ${await signupRes.text()}`);

  let token: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await page.request.get(`${API}/auth/verify-email/dev-latest?email=${encodeURIComponent(email)}`);
    if (r.ok()) {
      token = ((await r.json()) as { token: string }).token;
      break;
    }
    await page.waitForTimeout(300);
  }
  if (!token) throw new Error('dev-latest token not found');
  const confirmRes = await page.request.post(`${API}/auth/verify-email/confirm`, { data: { token } });
  if (!confirmRes.ok()) throw new Error(`confirm failed: ${confirmRes.status()}`);

  const loginRes = await page.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  if (!loginRes.ok()) throw new Error(`login failed: ${loginRes.status()}`);
}

async function setCreatorRoles(page: Page, roles: string[]): Promise<void> {
  const res = await page.request.patch(`${API}/profiles/me`, { data: { creatorRoles: roles } });
  expect(res.status()).toBe(200);
}

const FUTURE_DEADLINE = new Date(Date.now() + 30 * 86_400_000).toISOString();

async function createCall(page: Page, title: string, seats: Record<string, number>): Promise<string> {
  const res = await page.request.post(`${API}/calls`, {
    data: {
      title,
      description: 'Description de test QA MC-14 — capacité et clôture automatique.',
      genres: ['shonen'],
      seats,
      deadline: FUTURE_DEADLINE,
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function cleanupCall(ownerPage: Page, callId: string): Promise<void> {
  const res = await ownerPage.request.get(`${API}/me/calls/applications`);
  if (res.ok()) {
    const body = (await res.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
    const group = body.groups.find((g) => g.callId === callId);
    for (const app of group?.applications ?? []) {
      await ownerPage.request.delete(`${API}/applications/${app.id}`);
    }
  }
  await ownerPage.request.delete(`${API}/calls/${callId}`);
}

const board = (page: Page) => page.locator('.ep-call-board-card');
const cardByTitle = (page: Page, title: string) => board(page).filter({ hasText: title });

async function filterSeekingDessinateur(page: Page): Promise<void> {
  await page.getByRole('group', { name: 'Je cherche :' }).getByRole('button', { name: 'Dessinateur·rice' }).click();
}

/** Apply to `title` as the currently-logged-in `page`, via the full UI flow (matches calls-batch-fixes). */
async function applyViaUi(page: Page, title: string): Promise<void> {
  await page.goto('/appels');
  await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
  await filterSeekingDessinateur(page);
  const card = cardByTitle(page, title);
  await card.getByRole('button', { name: 'Candidater' }).click();
  const dialog = page.getByRole('dialog', { name: 'Candidater' });
  await dialog.locator('input[type="file"]').setInputFiles({ name: 's.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });
  await expect(dialog.getByRole('listitem').filter({ has: page.getByAltText('Échantillon téléversé') })).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
  await dialog.getByText('Fermer', { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Criteria 1, 2 (remove half), 4 — accepting the last seat auto-closes; the closed call 409s new
// applications and drops off the open board; removing the accepted applicant (MC-7) reopens it and
// it accepts applications again.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MC-14 — auto-close on last accept, gate, and reopen on MC-7 remove', () => {
  const ts = Date.now();
  const OWNER_EMAIL = `qa-mc14-owner-${ts}@e2e.local`;
  const APPLICANT_A_EMAIL = `qa-mc14-a-${ts}@e2e.local`;
  const APPLICANT_B_EMAIL = `qa-mc14-b-${ts}@e2e.local`;
  const TITLE = `QA MC14 Full Close ${ts}`;

  test('accepting the only sought seat closes the call, gates B, and removing the accepted applicant reopens it for B', async ({
    page,
    browser,
  }) => {
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signUpVerifyAndLogin(ownerPage, OWNER_EMAIL, 'QA MC14 Owner');
    await setCreatorRoles(ownerPage, ['scenariste']);
    const callId = await createCall(ownerPage, TITLE, { dessinateur: 1 });

    // Applicant A applies via the full UI flow.
    const aCtx = await browser.newContext();
    const aPage = await aCtx.newPage();
    await signUpVerifyAndLogin(aPage, APPLICANT_A_EMAIL, 'QA MC14 Applicant A');
    await setCreatorRoles(aPage, ['dessinateur']);
    await applyViaUi(aPage, TITLE);

    // Applicant B — logged in, sees "Candidater" while the call is still open (1 seat sought, none
    // accepted yet).
    await signUpVerifyAndLogin(page, APPLICANT_B_EMAIL, 'QA MC14 Applicant B');
    await setCreatorRoles(page, ['dessinateur']);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await filterSeekingDessinateur(page);
    await expect(cardByTitle(page, TITLE).getByRole('button', { name: 'Candidater' })).toBeVisible();

    // Owner accepts A — the ONLY sought seat — should auto-close the call (status closed, full).
    const listRes = await ownerPage.request.get(`${API}/me/calls/applications`);
    const listBody = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
    const appId = listBody.groups.find((g) => g.callId === callId)!.applications[0].id;
    const acceptRes = await ownerPage.request.patch(`${API}/applications/${appId}`, { data: { status: 'accepted' } });
    expect(acceptRes.status()).toBe(200);

    // Criterion 1 — auto-closed with the last (only) seat filled.
    let detail = (await (await ownerPage.request.get(`${API}/calls/${callId}`)).json()) as {
      status: string;
      remainingSeats: number;
    };
    expect(detail.status).toBe('closed');
    expect(detail.remainingSeats).toBe(0);

    // Criterion 4 — the open board excludes it.
    const openBoard = (await (await page.request.get(`${API}/calls?status=open`)).json()) as { items: Array<{ id: string }> };
    expect(openBoard.items.some((c) => c.id === callId)).toBe(false);

    // Criterion 4 — B: no "Candidater" once closed (board default view is "all", so the closed card
    // still shows, badged "Clôturé").
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await filterSeekingDessinateur(page);
    const closedCard = cardByTitle(page, TITLE);
    await expect(closedCard).toBeVisible();
    await expect(closedCard.getByText('Clôturé')).toBeVisible();
    await expect(closedCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);

    // Criterion 4 — POST /applications on a closed call -> 409.
    const applyRes = await page.request.post(`${API}/calls/${callId}/applications`, {
      data: { samples: [{ mediaId: 'does-not-matter-should-409-first' }] },
    });
    expect(applyRes.status()).toBe(409);

    // Criterion 2 — owner removes the accepted applicant (MC-7) -> reopens.
    const removeRes = await ownerPage.request.delete(`${API}/applications/${appId}`);
    expect(removeRes.status()).toBe(204);

    detail = (await (await ownerPage.request.get(`${API}/calls/${callId}`)).json()) as { status: string; remainingSeats: number };
    expect(detail.status).toBe('open');
    expect(detail.remainingSeats).toBe(1);

    // It accepts applications again — B applies successfully end-to-end.
    await applyViaUi(page, TITLE);

    await cleanupCall(ownerPage, callId);
    await ownerCtx.close();
    await aCtx.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 1 (partial fill stays open) + Criterion 2 (MC-6 withdraw reopen half).
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MC-14 — non-final accept stays open; MC-6 withdraw of the accepted seat reopens', () => {
  const ts = Date.now();

  test('accepting a non-final seat leaves the call open; the applicant withdrawing the accepted seat reopens it', async ({
    page,
    browser,
  }) => {
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signUpVerifyAndLogin(ownerPage, `qa-mc14-owner2-${ts}@e2e.local`, 'QA MC14 Owner 2');
    await setCreatorRoles(ownerPage, ['scenariste']);
    const title = `QA MC14 Non Final ${ts}`;
    // 2 seats sought — accepting the only applicant fills 1/2, must stay open.
    const callId = await createCall(ownerPage, title, { dessinateur: 2 });

    await signUpVerifyAndLogin(page, `qa-mc14-c-${ts}@e2e.local`, 'QA MC14 Applicant C');
    await setCreatorRoles(page, ['dessinateur']);
    await applyViaUi(page, title);

    const listRes = await ownerPage.request.get(`${API}/me/calls/applications`);
    const listBody = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
    const appId = listBody.groups.find((g) => g.callId === callId)!.applications[0].id;
    const acceptRes = await ownerPage.request.patch(`${API}/applications/${appId}`, { data: { status: 'accepted' } });
    expect(acceptRes.status()).toBe(200);

    // Criterion 1 — a non-final accept (1/2 seats filled) leaves the call open.
    let detail = (await (await ownerPage.request.get(`${API}/calls/${callId}`)).json()) as { status: string; remainingSeats: number };
    expect(detail.status).toBe('open');
    expect(detail.remainingSeats).toBe(1);

    // Applicant withdraws the accepted application (MC-6) via the UI.
    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    const row = page.locator('.ep-candidature-row').filter({ hasText: title });
    await expect(row.getByText('Acceptée', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Retirer' }).click();
    await row.getByRole('group', { name: 'Confirmer le retrait de la candidature' }).getByRole('button', { name: 'Confirmer le retrait' }).click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    // The call was already open (never auto-closed at 1/2) — remains open, seat count back to 2.
    detail = (await (await ownerPage.request.get(`${API}/calls/${callId}`)).json()) as { status: string; remainingSeats: number };
    expect(detail.status).toBe('open');
    expect(detail.remainingSeats).toBe(2);

    await cleanupCall(ownerPage, callId);
    await ownerCtx.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 3 — an owner manual close ("Clôturer l'appel") stays closed even after a seat frees.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MC-14 — manual close stays closed even when a seat later frees', () => {
  const ts = Date.now();

  test('manual close while an accepted seat exists is never reopened by a later MC-6 withdraw', async ({ page, browser }) => {
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signUpVerifyAndLogin(ownerPage, `qa-mc14-owner3-${ts}@e2e.local`, 'QA MC14 Owner 3');
    await setCreatorRoles(ownerPage, ['scenariste']);
    const title = `QA MC14 Manual Close ${ts}`;
    // 2 seats — accepting 1 keeps it open (Clôturer l'appel only renders while !closed) so the
    // manual-close path is reachable via the UI with an accepted seat already in place.
    const callId = await createCall(ownerPage, title, { dessinateur: 2 });

    await signUpVerifyAndLogin(page, `qa-mc14-d-${ts}@e2e.local`, 'QA MC14 Applicant D');
    await setCreatorRoles(page, ['dessinateur']);
    await applyViaUi(page, title);

    const listRes = await ownerPage.request.get(`${API}/me/calls/applications`);
    const listBody = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
    const appId = listBody.groups.find((g) => g.callId === callId)!.applications[0].id;
    const acceptRes = await ownerPage.request.patch(`${API}/applications/${appId}`, { data: { status: 'accepted' } });
    expect(acceptRes.status()).toBe(200);

    // Owner manually closes the call via the UI while the accepted seat still exists.
    await ownerPage.goto('/candidatures-recues');
    await expect(ownerPage.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await ownerPage.getByRole('combobox', { name: "Choisir l'appel" }).click();
    await ownerPage.getByRole('option', { name: `« ${title} »` }).click();
    await ownerPage.getByRole('button', { name: `Voir l'appel « ${title} »` }).click();
    const detailModal = ownerPage.getByRole('dialog').first();
    await expect(detailModal).toBeVisible();
    await detailModal.getByRole('button', { name: "Clôturer l'appel" }).click();
    await detailModal.getByRole('group', { name: "Confirmer la clôture de l'appel" }).getByRole('button', { name: 'Confirmer la clôture' }).click();
    await expect(detailModal.getByText('Clôturé').first()).toBeVisible({ timeout: 10_000 });
    await detailModal.getByText('Fermer', { exact: true }).click();

    let detail = (await (await ownerPage.request.get(`${API}/calls/${callId}`)).json()) as { status: string };
    expect(detail.status).toBe('closed');

    // The applicant withdraws the accepted application (MC-6), freeing a seat.
    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    const row = page.locator('.ep-candidature-row').filter({ hasText: title });
    await expect(row.getByText('Acceptée', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Retirer' }).click();
    await row.getByRole('group', { name: 'Confirmer le retrait de la candidature' }).getByRole('button', { name: 'Confirmer le retrait' }).click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    // Criterion 3 — a MANUAL close is never auto-reopened by a freed seat.
    detail = (await (await ownerPage.request.get(`${API}/calls/${callId}`)).json()) as { status: string };
    expect(detail.status).toBe('closed');

    // No "Candidater" resurfaces for a third-party applicant either.
    const eCtx = await browser.newContext();
    const ePage = await eCtx.newPage();
    await signUpVerifyAndLogin(ePage, `qa-mc14-e-${ts}@e2e.local`, 'QA MC14 Applicant E');
    await setCreatorRoles(ePage, ['dessinateur']);
    await ePage.goto('/appels');
    await expect(ePage.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await filterSeekingDessinateur(ePage);
    const stillClosedCard = cardByTitle(ePage, title);
    await expect(stillClosedCard).toBeVisible();
    await expect(stillClosedCard.getByText('Clôturé')).toBeVisible();
    await expect(stillClosedCard.getByRole('button', { name: 'Candidater' })).toHaveCount(0);
    await eCtx.close();

    await cleanupCall(ownerPage, callId);
    await ownerCtx.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 5 — the applicant-side pill shows the decided status ("Acceptée") instead of
// "Candidature envoyée" once decided. Isolated in its own test: the realistic trigger for an
// accepted decision is often the SAME accept that auto-closes the call (criterion 1), so this
// specifically exercises status:'accepted' AND status:'closed' together on the board card.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MC-14 — criterion 5: applicant board pill shows the decided status', () => {
  const ts = Date.now();

  test('the accepted applicant sees "Acceptée" (not just "Clôturé") on their own board card after the auto-close', async ({
    page,
    browser,
  }) => {
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    let callId: string | null = null;
    try {
      await signUpVerifyAndLogin(ownerPage, `qa-mc14-owner4-${ts}@e2e.local`, 'QA MC14 Owner 4');
      await setCreatorRoles(ownerPage, ['scenariste']);
      const title = `QA MC14 Pill ${ts}`;
      callId = await createCall(ownerPage, title, { dessinateur: 1 });

      await signUpVerifyAndLogin(page, `qa-mc14-f-${ts}@e2e.local`, 'QA MC14 Applicant F');
      await setCreatorRoles(page, ['dessinateur']);
      await applyViaUi(page, title);

      const listRes = await ownerPage.request.get(`${API}/me/calls/applications`);
      const listBody = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
      const appId = listBody.groups.find((g) => g.callId === callId)!.applications[0].id;
      const acceptRes = await ownerPage.request.patch(`${API}/applications/${appId}`, { data: { status: 'accepted' } });
      expect(acceptRes.status()).toBe(200);
      const detail = (await (await ownerPage.request.get(`${API}/calls/${callId}`)).json()) as { status: string };
      expect(detail.status).toBe('closed'); // confirms this is exactly the auto-close scenario

      await page.reload();
      await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
      await filterSeekingDessinateur(page);
      const ownCard = cardByTitle(page, title);
      await expect(ownCard).toBeVisible();
      // See qa-report.md defect #1: CallBoardCard's `showCandidater = !closed && !call.isOwner` gates
      // the WHOLE applied-pill slot away on a closed call, so this currently fails — the applicant who
      // was just accepted (and whose acceptance caused the auto-close) sees no status pill at all.
      await expect(ownCard.getByText('Acceptée', { exact: true })).toBeVisible();
    } finally {
      if (callId) await cleanupCall(ownerPage, callId);
      await ownerCtx.close();
    }
  });
});
