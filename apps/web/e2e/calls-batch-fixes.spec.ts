/**
 * QA e2e for the 2026-07-10 calls/applications/profile bug-fix batch. Amendments covered (see
 * user-stories/02-matching-collaboration/MC-{4,5,6,7,9}-*.md + F-3's "## Amendment(s) (2026-07-10)"):
 *   1. MC-5 — applying with APPLICATION_MAX_SAMPLES (3) samples does not disable "Envoyer".
 *   2. MC-7 — owner "Retirer" removes an applicant (pending AND accepted, freeing the seat);
 *      non-owner cannot (404).
 *   3. MC-6 — withdraw a pending application, edit it (message + samples, no re-upload of kept
 *      pieces), and view it via "Voir" (all statuses).
 *   4. MC-4 — "Clôturer l'appel" ends a call early: blocks new applications, drops from the open
 *      board, keeps accepted applicants; delete stays blocked once someone is accepted.
 *   6. MC-6 — withdraw-when-ACCEPTED (functional, click-through): the shared seeded fixture used by
 *      mc6-mes-candidatures.spec.ts (MC6-E5) only asserts the "Retirer" button now renders on an
 *      accepted row (structural) — actually clicking it there would destroy that file's shared
 *      baseline. This spec proves the full click → confirm → row gone → seat freed flow on a
 *      dedicated scratch call instead.
 *   7. F-3 — a stale/invalid seeking.targetRole no longer blocks a creatorRoles save; the accepted
 *      application's appliedAs stays untouched.
 *
 * Hermeticity (2 rounds of CI regressions fixed this): NOTHING below touches the shared
 * camille/dr1-camille-roux account or any seed.js ProjectCall. Round 1 found item 7's `psql`
 * shellout unreachable from CI's Postgres + mutating a shared fixture at runtime — fixed by reading
 * a DEDICATED e2e-seed.js fixture (F3_STALE_ROLE) read-only instead. Round 2 found items 1 and 3+6
 * reusing the shared camille account applying to shared seed.js calls ("Récit fantastique" /
 * "Aventure onirique"), leaving residual applications that broke mc5-apply-call.spec.ts's MC5-E7/E8
 * (which assert those cards still show "Candidater" for camille) — fixed the same way: a DEDICATED
 * e2e-seed.js applicant account (MC_BATCH_SCENARISTE, own 2 portfolio pieces) applying to a
 * throwaway call created LIVE by a fresh signup account and deleted at the end of each test
 * (`cleanupCall`) — never a permanently-seeded ProjectCall, so it can't inflate the exact open-call
 * totals `appels.spec.ts` asserts (e.g. "10 total") or intrude on the "newest open calls" band
 * `trouver.spec.ts`'s MC1-E9 asserts. Items 2/4/6 were already hermetic this way (fresh signup
 * accounts + a live-created, cleaned-up call each) and are unchanged.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';
const SAMPLE_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/avatar.jpg'));

// Dedicated e2e-seed.js fixtures (apps/api/prisma/e2e-seed.js) — never the shared camille/dr1-*
// accounts, never a seed.js ProjectCall. Read once at module load.
const ACCOUNTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
) as Record<string, { email: string; id: string }>;

// Username (max 30 chars, DTO-enforced) is generated independently of the email — slicing a
// descriptive `emailLocalPart-${Date.now()}` down to 30 chars silently truncates the LAST few
// timestamp digits, which collide across two QA runs started within the same ~second (the
// truncated prefix is then identical → 409 USERNAME_TAKEN). A counter + base36 timestamp keeps it
// short and unique without ever truncating the entropy away.
let usernameSeq = 0;
function nextUsername(): string {
  usernameSeq += 1;
  return `qa-${Date.now().toString(36)}-${usernameSeq}`;
}

/** Sign up via API + dev-latest verify, return a logged-in page context (matches privacy.spec.ts). */
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

async function loginUi(page: Page, email: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });
}

const FUTURE_DEADLINE = new Date(Date.now() + 30 * 86_400_000).toISOString();

async function createCall(page: Page, title: string, seats: Record<string, number>): Promise<string> {
  const res = await page.request.post(`${API}/calls`, {
    data: {
      title,
      description: 'Description de test QA pour le lot de correctifs du 2026-07-10.',
      genres: ['shonen'],
      seats,
      deadline: FUTURE_DEADLINE,
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

// Hygiene: this file's scratch calls otherwise pile up newest-first on the shared /appels board across
// repeated runs (no reseed in between locally), pushing seeded fixtures other spec files rely on
// (e.g. mc6-mes-candidatures.spec.ts's "Récit fantastique"/"Seinen urbain") off page 1 and making
// THEM time out. Delete is blocked while an application is accepted, so remove any remaining
// application first (any status, owner-scoped, works regardless — that's item 2's own fix) then
// delete the call.
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

// The board paginates and defaults to newest-first — a seeded call can get pushed past page 1 once
// enough scratch calls accumulate across QA runs. Narrowing via the "Je cherche :" role filter (which
// this batch's scratch calls, all seeking dessinateur, don't match) keeps the seeded scénariste-seeking
// fixtures reliably on page 1 regardless of how many scratch calls exist.
async function filterSeekingScenariste(page: Page): Promise<void> {
  await page.getByRole('group', { name: 'Je cherche :' }).getByRole('button', { name: 'Scénariste' }).click();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 + 3 (part) — MC-5 max-samples submit + MC-6 view/edit pre-fill. Applicant is the DEDICATED
// e2e-seed fixture MC_BATCH_SCENARISTE (own 2 portfolio pieces, own account — never the shared
// camille/dr1-camille-roux, which left residual applications on shared seed.js calls and broke
// mc5-apply-call.spec.ts's MC5-E7/E8, a real CI regression). The call itself is a throwaway created
// live by a fresh signup account and deleted at the end of each test (`cleanupCall`) — never
// permanently seeded, so it can't inflate the exact open-call totals appels.spec.ts asserts, and
// (being deleted well before any other spec runs its own board checks) can't race the "newest open
// calls" band trouver.spec.ts's MC1-E9 asserts either.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Item 1 — MC-5 apply at MAX samples', () => {
  const APPLICANT_EMAIL = ACCOUNTS.MC_BATCH_SCENARISTE.email;
  const MESSAGE = 'QA batch — candidature à 3/3 échantillons.';

  test('applies with 3/3 samples (2 portfolio + 1 upload) — "Envoyer" is enabled AND actually submits', async ({
    page,
    browser,
  }) => {
    const ts = Date.now();
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signUpVerifyAndLogin(ownerPage, `qa-mc5max-owner-${ts}@e2e.local`, 'QA MC5 Max Owner');
    await setCreatorRoles(ownerPage, ['dessinateur']);
    const title = `QA MC5 Max Samples ${ts}`;
    const callId = await createCall(ownerPage, title, { scenariste: 1 });

    await loginUi(page, APPLICANT_EMAIL);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await filterSeekingScenariste(page);

    const card = cardByTitle(page, title);
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });

    await dialog.getByAltText('Échantillon 1').click();
    await dialog.getByAltText('Échantillon 2').click();
    await expect(dialog.getByText('2/3')).toBeVisible();

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'sample.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });
    const uploaded = dialog.getByRole('listitem').filter({ has: page.getByAltText('Échantillon téléversé') });
    await expect(uploaded).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('3/3')).toBeVisible();

    // Structural half of the fix: the button itself must not be visually disabled at MAX.
    const submitBtn = dialog.getByRole('button', { name: 'Envoyer ma candidature' });
    await expect(submitBtn).toBeEnabled();
    await expect(submitBtn).toHaveCSS('opacity', '1');

    // Functional half: clicking it must actually submit — not silently no-op. See qa-report.md
    // defect #1: handleSubmit()'s OWN internal guard (`if (pending || uploadBusy) return;`) was not
    // updated alongside the button's `disabled` prop, so uploadBusy stuck true at MAX (the
    // UploadControl unmounts before it can report onBusyChange(false)) still wedges the click.
    await dialog.getByLabel('VOTRE MESSAGE').fill(MESSAGE);
    await submitBtn.click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await cleanupCall(ownerPage, callId);
    await ownerCtx.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 + 6 — MC-6 "Voir" (all statuses) + "Modifier" (pending only, pre-filled, no forced re-upload).
// Deliberately uses only 2/3 samples (NOT max) so this proof is independent of item 1's defect above.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Item 3 + 6 — MC-6 view + edit a pending application (pre-filled, no re-upload)', () => {
  const APPLICANT_EMAIL = ACCOUNTS.MC_BATCH_SCENARISTE.email;
  const MESSAGE = 'QA batch — candidature à 2 échantillons (voir/modifier).';

  test('applies with 2 samples, then "Voir" shows message+samples and "Modifier" pre-fills + saves without re-upload', async ({
    page,
    browser,
  }) => {
    const ts = Date.now();
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signUpVerifyAndLogin(ownerPage, `qa-mc5view-owner-${ts}@e2e.local`, 'QA MC5 View Owner');
    await setCreatorRoles(ownerPage, ['dessinateur']);
    const title = `QA MC5 View Edit ${ts}`;
    const callId = await createCall(ownerPage, title, { scenariste: 1 });

    await loginUi(page, APPLICANT_EMAIL);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await filterSeekingScenariste(page);

    const card = cardByTitle(page, title);
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candidater' });
    await dialog.getByAltText('Échantillon 1').click();
    await expect(dialog.getByText('1/3')).toBeVisible();
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'sample.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });
    await expect(dialog.getByRole('listitem').filter({ has: page.getByAltText('Échantillon téléversé') })).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog.getByText('2/3')).toBeVisible();
    await dialog.getByLabel('VOTRE MESSAGE').fill(MESSAGE);
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    const row = page.locator('.ep-candidature-row').filter({ hasText: title });
    await expect(row).toBeVisible();

    // "Voir" — read-only detail: full message + 2 samples (image links, portfolio + upload).
    await row.getByRole('button', { name: 'Voir', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Ma candidature' });
    await expect(detail).toBeVisible();
    await expect(detail.getByText(MESSAGE)).toBeVisible();
    await expect(detail.getByRole('link', { name: /Voir l'échantillon/ })).toHaveCount(2);
    await detail.getByRole('button', { name: 'Fermer' }).click();
    await expect(detail).toHaveCount(0);

    // "Modifier" — pending only — pre-filled with the existing message AND existing samples.
    const modifierBtn = row.getByRole('button', { name: `Modifier ma candidature pour « ${title} »` });
    await expect(modifierBtn).toBeVisible();
    await modifierBtn.click();

    // The dialog's accessible name follows its own title text ("Modifier ma candidature" in edit mode,
    // not "Candidater").
    const editDialog = page.getByRole('dialog', { name: 'Modifier ma candidature' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });
    await expect(editDialog.getByLabel('VOTRE MESSAGE')).toHaveValue(MESSAGE);
    await expect(editDialog.getByText('2/3')).toBeVisible();
    // The portfolio thumbnail comes back pre-selected (aria-pressed on the wrapping button, not the img)
    // — no re-upload needed for it.
    const portfolioBtn1 = editDialog.getByRole('button').filter({ has: page.getByAltText('Échantillon 1') });
    await expect(portfolioBtn1).toHaveAttribute('aria-pressed', 'true');
    // The uploaded piece comes back as a removable chip (its ref round-trips, no re-upload control for it).
    const uploadedChip = editDialog.getByRole('listitem').filter({ has: page.getByAltText('Échantillon téléversé') });
    await expect(uploadedChip).toBeVisible();

    // Remove the uploaded piece (down to 1/3, the kept portfolio ref — no new upload needed) and save.
    await uploadedChip.getByRole('button', { name: 'Retirer cet échantillon' }).click();
    await expect(editDialog.getByText('1/3')).toBeVisible();
    await editDialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(editDialog).toHaveCount(0, { timeout: 10_000 });

    // Confirm the PATCH actually persisted 1 sample (not silently ignored) via the detail view.
    await row.getByRole('button', { name: 'Voir', exact: true }).click();
    const detail2 = page.getByRole('dialog', { name: 'Ma candidature' });
    await expect(detail2).toBeVisible();
    await expect(detail2.getByRole('link', { name: /Voir l'échantillon/ })).toHaveCount(1);
    await detail2.getByRole('button', { name: 'Fermer' }).click();

    await cleanupCall(ownerPage, callId);
    await ownerCtx.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 + 4 + 6 — MC-7 remove-applicant (pending/accepted/non-owner), MC-4 close-early, and the
// functional MC-6 withdraw-when-accepted proof. Dedicated scratch owner + applicant + intruder.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Item 2 — MC-7 remove an applicant (owner-only, any status, frees the seat)', () => {
  const ts = Date.now();
  const OWNER_EMAIL = `qa-batch-owner-${ts}@e2e.local`;
  const APPLICANT_EMAIL = `qa-batch-applicant-${ts}@e2e.local`;
  const INTRUDER_EMAIL = `qa-batch-intruder-${ts}@e2e.local`;
  const CALL_TITLE = `QA Batch Retrait ${ts}`;

  test('owner sees "Retirer" on a PENDING applicant; removing it deletes the application; a non-owner cannot (404)', async ({
    page,
    browser,
  }) => {
    await signUpVerifyAndLogin(page, OWNER_EMAIL, 'QA Batch Owner');
    await setCreatorRoles(page, ['scenariste']);
    const callId = await createCall(page, CALL_TITLE, { dessinateur: 1 });

    const applicantCtx = await browser.newContext();
    const applicantPage = await applicantCtx.newPage();
    await signUpVerifyAndLogin(applicantPage, APPLICANT_EMAIL, 'QA Batch Applicant');
    await setCreatorRoles(applicantPage, ['dessinateur']);

    await applicantPage.goto('/appels');
    await expect(applicantPage.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    const card = cardByTitle(applicantPage, CALL_TITLE);
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = applicantPage.getByRole('dialog', { name: 'Candidater' });
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'sample.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });
    await expect(dialog.getByRole('listitem').filter({ has: applicantPage.getByAltText('Échantillon téléversé') })).toBeVisible({
      timeout: 30_000,
    });
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();

    // Fetch the application id via the owner's session (page.request shares the owner's cookie jar).
    const listRes = await page.request.get(`${API}/me/calls/applications`);
    expect(listRes.status()).toBe(200);
    const body = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string; status: string }> }> };
    const group = body.groups.find((g) => g.callId === callId);
    expect(group).toBeTruthy();
    const appId = group!.applications[0].id;
    expect(group!.applications[0].status).toBe('pending');

    // Non-owner (intruder, not even the applicant) cannot remove — 404, no existence leak.
    const intruderCtx = await browser.newContext();
    const intruderPage = await intruderCtx.newPage();
    await signUpVerifyAndLogin(intruderPage, INTRUDER_EMAIL, 'QA Batch Intruder');
    const forbidden = await intruderPage.request.delete(`${API}/applications/${appId}`);
    expect(forbidden.status()).toBe(404);
    await intruderCtx.close();

    // The owner's UI shows "Retirer" on the pending applicant card and removing it works end-to-end.
    await page.goto('/candidatures-recues');
    await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    const row = page.locator('.ep-candidature-row').filter({ hasText: 'QA Batch Applicant' });
    // Pending rows on THIS page show Accepter/Refuser (no separate status text) — StatusBadge only
    // renders once a decision is made.
    await expect(row.getByRole('button', { name: 'Accepter la candidature de QA Batch Applicant' })).toBeVisible();
    await row.getByRole('button', { name: 'Retirer la candidature de QA Batch Applicant' }).click();
    const [deleteResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/applications/${appId}`) && r.request().method() === 'DELETE'),
      row.getByRole('button', { name: 'Confirmer le retrait' }).click(),
    ]);
    expect(deleteResponse.status()).toBe(204);
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    // Really deleted server-side (not just hidden) — gone from the applicant's own list too.
    const afterRes = await applicantPage.request.get(`${API}/me/applications`);
    const afterBody = (await afterRes.json()) as { items: Array<{ callId: string }> };
    expect(afterBody.items.some((a) => a.callId === callId)).toBe(false);
    await applicantCtx.close();
    await cleanupCall(page, callId);
  });

  test('removing an ACCEPTED applicant frees the seat (remainingSeats/status revert)', async ({ page, browser }) => {
    await signUpVerifyAndLogin(page, `qa-batch-owner-b-${ts}@e2e.local`, 'QA Batch Owner B');
    await setCreatorRoles(page, ['scenariste']);
    const title = `${CALL_TITLE} Accepted`;
    const callId = await createCall(page, title, { dessinateur: 1 });

    const applicantCtx = await browser.newContext();
    const applicantPage = await applicantCtx.newPage();
    await signUpVerifyAndLogin(applicantPage, `qa-batch-applicant-b-${ts}@e2e.local`, 'QA Batch Applicant B');
    await setCreatorRoles(applicantPage, ['dessinateur']);

    await applicantPage.goto('/appels');
    await expect(applicantPage.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    const card = cardByTitle(applicantPage, title);
    await card.getByRole('button', { name: 'Candidater' }).click();
    const dialog = applicantPage.getByRole('dialog', { name: 'Candidater' });
    await dialog.locator('input[type="file"]').setInputFiles({ name: 's.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });
    await expect(dialog.getByRole('listitem').filter({ has: applicantPage.getByAltText('Échantillon téléversé') })).toBeVisible({
      timeout: 30_000,
    });
    await dialog.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog.getByText('Fermer', { exact: true }).click();
    await applicantCtx.close();

    const listRes = await page.request.get(`${API}/me/calls/applications`);
    const body = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
    const appId = body.groups.find((g) => g.callId === callId)!.applications[0].id;

    // Owner accepts (API — the decision UI itself is already covered by mc7-candidatures-recues.spec.ts).
    const acceptRes = await page.request.patch(`${API}/applications/${appId}`, { data: { status: 'accepted' } });
    expect(acceptRes.status()).toBe(200);

    let detail = await (await page.request.get(`${API}/calls/${callId}`)).json();
    // remainingSeats is correctly DERIVED (seats − accepted, floored at 0) — this is what "frees the
    // seat" actually means and what this criterion grades. Note (separate, pre-existing, out-of-scope
    // finding — see qa-report.md): `ProjectCall.status` itself is NOT auto-flipped to 'closed' when
    // fully staffed — `CallsService.closeIfFilled` exists and is unit-tested in isolation but is never
    // called from the accept flow (`ReceivedApplicationsService.decide`), so it stays 'open' here.
    expect(detail.remainingSeats).toBe(0);

    await page.goto('/candidatures-recues');
    await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    // Select this second call (the selector defaults to the newest — this one).
    const row = page.locator('.ep-candidature-row').filter({ hasText: 'QA Batch Applicant B' });
    await expect(row.getByText('✓ Acceptée')).toBeVisible();
    await row.getByRole('button', { name: 'Retirer la candidature de QA Batch Applicant B' }).click();
    const [deleteResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/applications/${appId}`) && r.request().method() === 'DELETE'),
      row.getByRole('button', { name: 'Confirmer le retrait' }).click(),
    ]);
    expect(deleteResponse.status()).toBe(204);
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    detail = await (await page.request.get(`${API}/calls/${callId}`)).json();
    expect(detail.remainingSeats).toBe(1);
    expect(detail.status).toBe('open');
    await cleanupCall(page, callId);
  });
});

test.describe('Item 6 (functional) — MC-6 withdraw an ACCEPTED application frees the seat', () => {
  const ts = Date.now();

  test('applicant withdraws an accepted application — row gone, seat freed, board Candidater reappears', async ({
    page,
    browser,
  }) => {
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signUpVerifyAndLogin(ownerPage, `qa-withdraw-owner-${ts}@e2e.local`, 'QA Withdraw Owner');
    await setCreatorRoles(ownerPage, ['scenariste']);
    const title = `QA Batch Withdraw Accepted ${ts}`;
    const callId = await createCall(ownerPage, title, { dessinateur: 1 });

    await signUpVerifyAndLogin(page, `qa-withdraw-applicant-${ts}@e2e.local`, 'QA Withdraw Applicant');
    await setCreatorRoles(page, ['dessinateur']);
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
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

    const listRes = await ownerPage.request.get(`${API}/me/calls/applications`);
    const body = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
    const appId = body.groups.find((g) => g.callId === callId)!.applications[0].id;
    const acceptRes = await ownerPage.request.patch(`${API}/applications/${appId}`, { data: { status: 'accepted' } });
    expect(acceptRes.status()).toBe(200);

    await page.goto('/mes-candidatures');
    await expect(page.getByRole('heading', { name: 'Mes candidatures', level: 1 })).toBeVisible({ timeout: 10_000 });
    const row = page.locator('.ep-candidature-row').filter({ hasText: title });
    await expect(row.getByText('✓ Acceptée')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Retirer' })).toBeVisible();
    await row.getByRole('button', { name: 'Retirer' }).click();
    await row.getByRole('group', { name: 'Confirmer le retrait de la candidature' }).getByRole('button', { name: 'Confirmer le retrait' }).click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });

    // Seat freed + board reflects it.
    const detail = await (await page.request.get(`${API}/calls/${callId}`)).json();
    expect(detail.remainingSeats).toBe(1);
    expect(detail.status).toBe('open');
    await page.goto('/appels');
    await expect(page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(cardByTitle(page, title).getByRole('button', { name: 'Candidater' })).toBeVisible();

    await cleanupCall(ownerPage, callId);
    await ownerCtx.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 — MC-4 "Clôturer l'appel" (close early): blocks new applications, drops from the open board,
// keeps accepted applicants, and delete stays blocked while someone is accepted.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Item 4 — MC-4 close a call early', () => {
  const ts = Date.now();

  test('closing early keeps the accepted applicant, blocks new applications, drops from the open board, and still blocks delete', async ({
    page,
    browser,
  }) => {
    await signUpVerifyAndLogin(page, `qa-close-owner-${ts}@e2e.local`, 'QA Close Owner');
    await setCreatorRoles(page, ['scenariste']);
    const title = `QA Batch Close Early ${ts}`;
    const callId = await createCall(page, title, { dessinateur: 2 }); // 2 seats — accepting 1 doesn't auto-close it

    const applicant1Ctx = await browser.newContext();
    const applicant1Page = await applicant1Ctx.newPage();
    await signUpVerifyAndLogin(applicant1Page, `qa-close-applicant1-${ts}@e2e.local`, 'QA Close Applicant One');
    await setCreatorRoles(applicant1Page, ['dessinateur']);
    await applicant1Page.goto('/appels');
    await expect(applicant1Page.getByRole('heading', { name: 'Appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    const card1 = cardByTitle(applicant1Page, title);
    await card1.getByRole('button', { name: 'Candidater' }).click();
    const dialog1 = applicant1Page.getByRole('dialog', { name: 'Candidater' });
    await dialog1.locator('input[type="file"]').setInputFiles({ name: 's.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_FIXTURE });
    await expect(dialog1.getByRole('listitem').filter({ has: applicant1Page.getByAltText('Échantillon téléversé') })).toBeVisible({
      timeout: 30_000,
    });
    await dialog1.getByRole('button', { name: 'Envoyer ma candidature' }).click();
    await expect(dialog1.getByRole('status').filter({ hasText: 'Candidature envoyée !' })).toBeVisible({ timeout: 10_000 });
    await dialog1.getByText('Fermer', { exact: true }).click();
    await applicant1Ctx.close();

    const listRes = await page.request.get(`${API}/me/calls/applications`);
    const body = (await listRes.json()) as { groups: Array<{ callId: string; applications: Array<{ id: string }> }> };
    const appId = body.groups.find((g) => g.callId === callId)!.applications[0].id;
    const acceptRes = await page.request.patch(`${API}/applications/${appId}`, { data: { status: 'accepted' } });
    expect(acceptRes.status()).toBe(200);

    // Owner closes the call early via the UI (received-applications → Voir l'appel → Clôturer l'appel).
    await page.goto('/candidatures-recues');
    await expect(page.getByRole('heading', { name: 'Mes appels à projets', level: 1 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('combobox', { name: "Choisir l'appel" }).click();
    await page.getByRole('option', { name: `« ${title} »` }).click();
    await page.getByRole('button', { name: `Voir l'appel « ${title} »` }).click();
    const detailModal = page.getByRole('dialog').first();
    await expect(detailModal).toBeVisible();
    await expect(detailModal.getByRole('button', { name: 'Éditer' })).toBeVisible(); // still open pre-close
    await detailModal.getByRole('button', { name: "Clôturer l'appel" }).click();
    await detailModal.getByRole('group', { name: "Confirmer la clôture de l'appel" }).getByRole('button', { name: 'Confirmer la clôture' }).click();
    // "Clôturé" renders in more than one place inside the modal (header + footer badge) — .first() is enough.
    await expect(detailModal.getByText('Clôturé').first()).toBeVisible({ timeout: 10_000 });
    await expect(detailModal.getByRole('button', { name: 'Éditer' })).toHaveCount(0);
    await expect(detailModal.getByRole('button', { name: "Clôturer l'appel" })).toHaveCount(0);

    // Delete is still blocked (an applicant is accepted) — the escape hatch was close-early, not delete.
    await detailModal.getByRole('button', { name: 'Supprimer' }).click();
    await detailModal.getByRole('group', { name: "Confirmer la suppression de l'appel" }).getByRole('button', { name: 'Confirmer la suppression' }).click();
    await expect(detailModal.getByRole('alert')).toContainText('Impossible de supprimer');
    await detailModal.getByRole('button', { name: 'Annuler' }).click();
    await detailModal.getByText('Fermer', { exact: true }).click();

    // Server-side: dropped from the open board (default GET /calls).
    const openBoard = (await (await page.request.get(`${API}/calls`)).json()) as { items: Array<{ id: string }> };
    expect(openBoard.items.some((c) => c.id === callId)).toBe(false);

    // New applications are rejected (409) once closed.
    const applicant2Ctx = await browser.newContext();
    const applicant2Page = await applicant2Ctx.newPage();
    await signUpVerifyAndLogin(applicant2Page, `qa-close-applicant2-${ts}@e2e.local`, 'QA Close Applicant Two');
    await setCreatorRoles(applicant2Page, ['dessinateur']);
    const applyRes = await applicant2Page.request.post(`${API}/calls/${callId}/applications`, {
      data: { samples: [{ mediaId: 'does-not-matter-should-409-first' }] },
    });
    expect(applyRes.status()).toBe(409);
    await applicant2Ctx.close();

    // The accepted applicant is still there — kept, not dropped.
    const receivedRes = await page.request.get(`${API}/me/calls/applications`);
    const receivedBody = (await receivedRes.json()) as { groups: Array<{ callId: string; applications: Array<{ status: string }> }> };
    const keptGroup = receivedBody.groups.find((g) => g.callId === callId);
    expect(keptGroup).toBeTruthy();
    expect(keptGroup!.applications.some((a) => a.status === 'accepted')).toBe(true);

    await cleanupCall(page, callId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 — F-3: a stale/invalid seeking.targetRole no longer blocks a creatorRoles save; the accepted
// application's appliedAs stays untouched. Uses the DEDICATED e2e-seed fixture F3_STALE_ROLE
// (apps/api/prisma/e2e-seed.js) read-only: its Profile already has seekingActive:true +
// seekingTargetRole:'dessinateur' (the legacy invalid value — not in SEEKING_TARGET_ROLES) AND an
// accepted application, out of the box. No runtime SQL, no mutation of any shared fixture — CI-safe
// (a raw `psql` shellout to a hardcoded localhost:5433 can't reach the CI runner's Postgres, which is
// exactly what broke `develop`'s e2e job when this test used to reproduce the precondition that way).
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Item 7 — F-3 profile creatorRoles save survives a stale invalid seeking.targetRole', () => {
  test('dedicated fixture already has the legacy precondition — toggle creatorRoles, save, reload; appliedAs unchanged', async ({
    page,
  }) => {
    const email = ACCOUNTS.F3_STALE_ROLE.email;
    await loginUi(page, email);
    const slug = ((await (await page.request.get(`${API}/auth/me`)).json()) as { slug: string }).slug;

    // Capture the accepted application's appliedAs BEFORE the profile edit.
    const beforeRes = await page.request.get(`${API}/me/applications`);
    const beforeBody = (await beforeRes.json()) as { items: Array<{ status: string; appliedAs: string | null }> };
    const acceptedBefore = beforeBody.items.find((a) => a.status === 'accepted');
    expect(acceptedBefore).toBeTruthy();

    await page.goto(`/${slug}`);
    await expect(page.getByRole('button', { name: /Modifier le profil/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Modifier le profil/i }).click();

    // Toggle "Dessinateur·rice" on (this fixture starts with only Scénariste, per e2e-seed.js).
    const dessinateurToggle = page.getByRole('button', { name: 'Dessinateur·rice', exact: true });
    await expect(dessinateurToggle).toHaveAttribute('aria-pressed', 'false');
    await dessinateurToggle.click();
    await expect(dessinateurToggle).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

    // The bug: the whole PATCH used to 400 (stale invalid targetRole), silently dropping this too —
    // the edit form would stay open forever (catch{} swallowed the error). The fix: it closes (saved).
    await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Modifier le profil/i })).toBeVisible();

    // Persisted server-side (no GET /profiles/me — read back via the public GET /profiles/:slug).
    const meRes = await page.request.get(`${API}/profiles/${slug}`);
    const me = (await meRes.json()) as { creatorRoles: string[] };
    expect(me.creatorRoles.sort()).toEqual(['dessinateur', 'scenariste']);

    // The accepted application's appliedAs is untouched by the profile edit.
    const afterRes = await page.request.get(`${API}/me/applications`);
    const afterBody = (await afterRes.json()) as { items: Array<{ status: string; appliedAs: string | null }> };
    const acceptedAfter = afterBody.items.find((a) => a.status === 'accepted');
    expect(acceptedAfter).toBeTruthy();
    expect(acceptedAfter!.appliedAs).toBe(acceptedBefore!.appliedAs);
  });
});
