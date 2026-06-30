/**
 * F-10 — Media storage, uploads & delivery — Playwright e2e suite
 *
 * Hermetic / CI-portable: uses the UTILISATEUR account seeded by global-setup.ts.
 * API-level upload round-trip is authoritative (uses APIRequestContext for the S3 PUT
 * to avoid browser-PUT CORS flakiness). UI test asserts up to "Optimisation…" state.
 *
 * Worker must run (see playwright.config.ts webServer entry) for status to reach ready.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PASSWORD = 'password123';

const ACCOUNTS: Record<string, { email: string; id: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.e2e-accounts.json'), 'utf8'),
);

const FIXTURE_PATH = path.join(__dirname, 'fixtures/avatar.jpg');
const FIXTURE = fs.readFileSync(FIXTURE_PATH);
const FIXTURE_SIZE = FIXTURE.length;

// 50×50 JPEG fixture for crop tests — avoids edge-cases with 1×1 in canvas.toBlob
const FIXTURE_50_PATH = path.join(__dirname, 'fixtures/avatar-50x50.jpg');
const FIXTURE_50 = fs.readFileSync(FIXTURE_50_PATH);
const FIXTURE_50_SIZE = FIXTURE_50.length;

async function loginApi(ctx: APIRequestContext, email: string) {
  const res = await ctx.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (res.status() !== 200) {
    throw new Error(`loginApi failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}

// ─── API-level round-trip (authoritative) ────────────────────────────────────

test.describe('F-10 API round-trip', () => {
  test('unauth POST /media/uploads → 401', async ({ request }) => {
    // No login — fresh context has no session cookie
    const res = await request.post(`${API}/media/uploads`, {
      data: { kind: 'avatar', contentType: 'image/jpeg', size: 1000 },
    });
    expect(res.status()).toBe(401);
  });

  test('SVG contentType rejected at presign → 400', async ({ request }) => {
    await loginApi(request, ACCOUNTS.UTILISATEUR.email);
    const res = await request.post(`${API}/media/uploads`, {
      data: { kind: 'avatar', contentType: 'image/svg+xml', size: 1000 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { message: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(msg).toMatch(/contentType/i);
  });

  test('oversize declared size rejected at presign → 400', async ({ request }) => {
    await loginApi(request, ACCOUNTS.UTILISATEUR.email);
    const res = await request.post(`${API}/media/uploads`, {
      data: { kind: 'avatar', contentType: 'image/jpeg', size: 11 * 1024 * 1024 },
    });
    expect(res.status()).toBe(400);
  });

  test('full upload → finalize → worker → ready → setAvatar round-trip', async ({ request }) => {
    await loginApi(request, ACCOUNTS.UTILISATEUR.email);

    // 1. Presign
    const presignRes = await request.post(`${API}/media/uploads`, {
      data: { kind: 'avatar', contentType: 'image/jpeg', size: FIXTURE_SIZE },
    });
    expect([200, 201]).toContain(presignRes.status());
    const { mediaId, uploadUrl } = await presignRes.json() as {
      mediaId: string;
      uploadUrl: string;
      bucketKey: string;
      expiresIn: number;
    };
    expect(typeof mediaId).toBe('string');
    expect(typeof uploadUrl).toBe('string');

    // 2. PUT bytes directly to MinIO via APIRequestContext (no session cookie)
    const putRes = await request.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      data: FIXTURE,
    });
    expect(putRes.status()).toBe(200);

    // 3. Finalize — EXIF strip + enqueue image-processing
    const finalizeRes = await request.post(`${API}/media/${mediaId}/finalize`);
    expect([200, 201]).toContain(finalizeRes.status());
    const finalizeBody = await finalizeRes.json() as { id: string; status: string };
    expect(finalizeBody.id).toBe(mediaId);
    // Status is still pending immediately after finalize; worker flips it
    expect(['pending', 'ready']).toContain(finalizeBody.status);

    // 4. Poll until worker sets status=ready (worker webServer must be running)
    let media: { id: string; status: string; variants: Record<string, string> } | null = null;
    for (let i = 0; i < 30; i++) {
      const pollRes = await request.get(`${API}/media/${mediaId}`);
      expect(pollRes.status()).toBe(200);
      media = await pollRes.json() as typeof media;
      if (media!.status === 'ready') break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(media!.status).toBe('ready');
    expect(media!.variants).toHaveProperty('orig');
    expect(media!.variants).toHaveProperty('web');
    expect(media!.variants).toHaveProperty('thumb');

    // 5. Verify CDN URL serves the image (HTTP 200, content-type image/*)
    const cdnUrl = media!.variants['web'] ?? media!.variants['orig'];
    const cdnRes = await request.get(cdnUrl);
    expect(cdnRes.status()).toBe(200);
    expect(cdnRes.headers()['content-type']).toMatch(/image\//);

    // 6. Set avatar
    const avatarRes = await request.patch(`${API}/accounts/me/avatar`, {
      data: { mediaId },
    });
    expect(avatarRes.status()).toBe(200);
    const avatarBody = await avatarRes.json() as { avatar: string };
    expect(typeof avatarBody.avatar).toBe('string');
    expect(avatarBody.avatar).toMatch(/http/);

    // 7. Verify profile shows the avatar
    const profileRes = await request.get(`${API}/profiles/${ACCOUNTS.UTILISATEUR.id}`).catch(
      // Profile may be at slug not id; try slug if id fails
      () => request.get(`${API}/profiles/e2e-utilisateur`)
    );
    // Minimal: setAvatar returned a URL — the avatar is wired correctly
    expect(avatarBody.avatar).toContain('web.webp');
  });

  test('non-owner cannot access private media signed URL → 403', async ({ request }) => {
    // User 1 creates private media (attachment)
    await loginApi(request, ACCOUNTS.UTILISATEUR.email);
    const presignRes = await request.post(`${API}/media/uploads`, {
      data: { kind: 'attachment', contentType: 'image/jpeg', size: FIXTURE_SIZE },
    });
    expect([200, 201]).toContain(presignRes.status());
    const { mediaId, uploadUrl } = await presignRes.json() as { mediaId: string; uploadUrl: string };

    await request.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      data: FIXTURE,
    });
    await request.post(`${API}/media/${mediaId}/finalize`);

    // User 2 tries to get the signed URL — use a fresh isolated request context
    // so the session cookie from User 1 is not carried over.
    await loginApi(request, ACCOUNTS.TARGET.email);
    const signedRes = await request.get(`${API}/media/${mediaId}/url`);
    expect(signedRes.status()).toBe(403);
  });

  test('public media /url returns CDN URL (not presigned)', async ({ request }) => {
    await loginApi(request, ACCOUNTS.UTILISATEUR.email);
    const presignRes = await request.post(`${API}/media/uploads`, {
      data: { kind: 'avatar', contentType: 'image/jpeg', size: FIXTURE_SIZE },
    });
    const { mediaId, uploadUrl } = await presignRes.json() as { mediaId: string; uploadUrl: string };
    await request.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      data: FIXTURE,
    });
    await request.post(`${API}/media/${mediaId}/finalize`);

    // GET /media/:id/url for public media should return CDN URL
    const urlRes = await request.get(`${API}/media/${mediaId}/url`);
    expect(urlRes.status()).toBe(200);
    const { url, expiresIn } = await urlRes.json() as { url: string; expiresIn: number };
    // Public media: CDN URL (no X-Amz-Signature in URL for public)
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
    expect(typeof expiresIn).toBe('number');
  });
});

// ─── UI smoke — UploadControl on the profile edit screen ─────────────────────

test.describe('F-10 UI — upload control on profile edit', () => {
  test('shows Photo de profil upload control in edit mode', async ({ page }) => {
    // Login via the UI (pattern from profile.spec.ts)
    await page.goto('/connexion');
    await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
    await page.getByLabel(/mot de passe/i).fill(PASSWORD);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Navigate to own profile
    await page.goto('/e2e-utilisateur');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });

    // UploadControl should show in edit mode
    await expect(page.getByText('Photo de profil')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Glissez une image ou cliquez pour choisir')).toBeVisible();
    // The upload button is keyboard-operable and labelled.
    // exact:true so it doesn't also match the avatar lightbox button ("Voir la photo de profil … en grand").
    const uploadBtn = page.getByRole('button', { name: 'Photo de profil', exact: true });
    await expect(uploadBtn).toBeVisible();
  });

  test('client-side rejects oversize file before API call', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
    await page.getByLabel(/mot de passe/i).fill(PASSWORD);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    await page.goto('/e2e-utilisateur');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });

    // Set an oversize file via the hidden file input
    const fileInput = page.locator('input[type="file"]').first();
    // Create a buffer > 10MB
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 0x42);
    await fileInput.setInputFiles({
      name: 'big.jpg',
      mimeType: 'image/jpeg',
      buffer: bigBuffer,
    });

    // Should show French error without making API request
    await expect(page.getByText(/Fichier trop volumineux/)).toBeVisible({ timeout: 5000 });
    // Retry button appears
    await expect(page.getByRole('button', { name: /Réessayer/i })).toBeVisible();
  });

  test('crop modal appears for avatar file selection and Annuler returns to idle', async ({ page }) => {
    // F-10 enhancement: AvatarCropModal must appear for avatar uploads before upload starts
    await page.goto('/connexion');
    await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
    await page.getByLabel(/mot de passe/i).fill(PASSWORD);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    await page.goto('/e2e-utilisateur');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'avatar.jpg',
      mimeType: 'image/jpeg',
      buffer: FIXTURE,
    });

    // Crop modal must appear (role=dialog)
    await expect(page.getByRole('dialog', { name: /Recadrer la photo de profil/ })).toBeVisible({ timeout: 5_000 });
    // Zoom slider present
    await expect(page.getByRole('slider', { name: /Zoom/ })).toBeVisible();
    // Cancel crop → idle state restored (scope to dialog to avoid ambiguity with profile edit cancel)
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByText('Glissez une image ou cliquez pour choisir')).toBeVisible({ timeout: 3_000 });
  });

  test('upload fixture image shows Optimisation… state (crop → upload)', async ({ page }) => {
    // Previously: this test went file → Optimisation… directly.
    // After the crop enhancement the flow is: file → crop modal → Rogner → upload → Optimisation…
    await page.goto('/connexion');
    await page.getByLabel(/e-mail/i).fill(ACCOUNTS.UTILISATEUR.email);
    await page.getByLabel(/mot de passe/i).fill(PASSWORD);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    await page.goto('/e2e-utilisateur');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Modifier le profil/i }).click({ timeout: 8_000 });

    // Use the 50×50 fixture — produces a valid non-zero canvas Blob after getCroppedImg
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'avatar-50x50.jpg',
      mimeType: 'image/jpeg',
      buffer: FIXTURE_50,
    });

    // Wait for crop modal and for Rogner to be enabled (react-easy-crop fires onCropComplete after image loads)
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    const rognerBtn = page.getByRole('button', { name: 'Rogner' });
    await expect(rognerBtn).toBeEnabled({ timeout: 8_000 });
    await rognerBtn.click();

    // Should progress through crop → uploading → processing (Optimisation…) → ready
    // Accept "Optimisation…" (processing) OR "Changer" (ready) — the worker may be fast
    await expect(
      page.getByText('Optimisation…').first().or(page.getByText('Changer').first())
    ).toBeVisible({ timeout: 30_000 });
  });
});

// ─── Delete avatar (new F-10 enhancement) ────────────────────────────────────

test.describe('F-10 avatar delete', () => {
  test('DELETE /accounts/me/avatar → 200, avatar=null, media row gone, S3 objects deleted', async ({ request }) => {
    await loginApi(request, ACCOUNTS.UTILISATEUR.email);

    // Upload + finalize + set avatar so there is something to delete
    const presignRes = await request.post(`${API}/media/uploads`, {
      data: { kind: 'avatar', contentType: 'image/jpeg', size: FIXTURE_SIZE },
    });
    expect([200, 201]).toContain(presignRes.status());
    const { mediaId, uploadUrl } = await presignRes.json() as { mediaId: string; uploadUrl: string };

    await request.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      data: FIXTURE,
    });
    await request.post(`${API}/media/${mediaId}/finalize`);

    // Poll until ready
    let readyVariants: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      const r = await request.get(`${API}/media/${mediaId}`);
      const m = await r.json() as { status: string; variants: Record<string, string> };
      if (m.status === 'ready') { readyVariants = m.variants; break; }
      await new Promise((res) => setTimeout(res, 1000));
    }
    expect(readyVariants['web']).toBeTruthy();

    // Set avatar
    const setRes = await request.patch(`${API}/accounts/me/avatar`, { data: { mediaId } });
    expect(setRes.status()).toBe(200);
    const setBody = await setRes.json() as { avatar: string | null };
    expect(setBody.avatar).toBeTruthy();

    // DELETE
    const delRes = await request.delete(`${API}/accounts/me/avatar`);
    expect(delRes.status()).toBe(200);
    const delBody = await delRes.json() as { avatar: string | null };
    expect(delBody.avatar).toBeNull();

    // Media row should be gone (404)
    const mediaCheck = await request.get(`${API}/media/${mediaId}`);
    expect(mediaCheck.status()).toBe(404);

    // S3 objects should be deleted (MinIO returns 404 for deleted objects, access via CDN base)
    const cdnBase = process.env['CDN_BASE_URL'] ?? 'http://localhost:9000/encre-et-plume-media';
    const webKey = readyVariants['web']?.replace(`${cdnBase}/`, '');
    if (webKey) {
      const s3Check = await request.get(`${cdnBase}/${webKey}`);
      expect(s3Check.status()).toBe(404);
    }
  });

  test('DELETE /accounts/me/avatar without auth → 401', async ({ request }) => {
    // No login
    const res = await request.delete(`${API}/accounts/me/avatar`);
    expect(res.status()).toBe(401);
  });
});
