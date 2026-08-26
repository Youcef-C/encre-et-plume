/**
 * F-23 — Mesure d'audience sans cookie.
 *
 * The headline check is a NEGATIVE one: the measurement must create no cookie and no storage entry,
 * because that absence is the whole legal basis (art. 82 never triggers, so no banner gates it).
 * Requests are observed with `page.on('request')`; the DB side is covered by the Jest suites.
 */
import { test, expect, type Page, type Request } from '@playwright/test';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type Beacon = { path?: string; ref?: string; kind?: string };

/** Collect every `POST /events` body the page fires. */
function collectBeacons(page: Page): Beacon[] {
  const seen: Beacon[] = [];
  page.on('request', (req: Request) => {
    if (req.method() === 'POST' && req.url() === `${API}/events`) {
      seen.push(JSON.parse(req.postData() ?? '{}') as Beacon);
    }
  });
  return seen;
}

const storageSnapshot = (page: Page) =>
  page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookies: document.cookie,
  }));

test.describe('F-23 · cookieless audience measurement', () => {
  test('a page load emits one visit beacon for its pathname', async ({ page }) => {
    const beacons = collectBeacons(page);

    await page.goto('/catalogue');
    await expect.poll(() => beacons.length).toBeGreaterThan(0);

    expect(beacons[0].kind).toBe('visit');
    expect(beacons[0].path).toBe('/catalogue');
  });

  test('the query string never leaves the browser', async ({ page }) => {
    const beacons = collectBeacons(page);

    await page.goto('/catalogue?genre=Sh%C5%8Dnen');
    await expect.poll(() => beacons.length).toBeGreaterThan(0);

    expect(beacons[0].path).toBe('/catalogue');
    expect(JSON.stringify(beacons[0])).not.toContain('genre');
  });

  test('F2 · no cookie and no storage entry is created by the measurement', async ({ page }) => {
    const beacons = collectBeacons(page);

    await page.goto('/catalogue');
    const before = await storageSnapshot(page);
    await page.goto('/classement');
    await expect.poll(() => beacons.length).toBeGreaterThan(1);
    const after = await storageSnapshot(page);

    // Nothing the measurement touches. (F-13's `ep_cookie_consent` only appears once a human
    // answers the banner, which this test never does — so both snapshots must be identical.)
    expect(after.local).toEqual(before.local);
    expect(after.session).toEqual(before.session);
    expect(after.cookies).toBe(before.cookies);

    // And nothing analytics-shaped anywhere, whatever else the app stored.
    const all = JSON.stringify(after);
    for (const needle of ['visitor', 'analytics', '_ga', 'sid', 'audience']) {
      expect(all).not.toContain(needle);
    }
  });

  test('client-side navigation emits one beacon per pathname, not per render', async ({ page }) => {
    const beacons = collectBeacons(page);

    await page.goto('/catalogue');
    await expect.poll(() => beacons.length).toBe(1);

    await page.goto('/classement');
    await expect.poll(() => beacons.length).toBe(2);
    expect(beacons.map((b) => b.path)).toEqual(['/catalogue', '/classement']);
  });

  test('the API answers 204 with no body and sets no cookie', async ({ request }) => {
    const res = await request.post(`${API}/events`, {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh)' },
      data: { kind: 'visit', path: '/e2e-check' },
    });

    expect(res.status()).toBe(204);
    expect(res.headers()['set-cookie']).toBeUndefined();
  });

  test('a bot user-agent is accepted but measured as nothing', async ({ request }) => {
    const res = await request.post(`${API}/events`, {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Googlebot/2.1' },
      data: { kind: 'visit', path: '/e2e-bot' },
    });

    expect(res.status()).toBe(204);
  });

  test('a forged server-side kind is refused', async ({ request }) => {
    const res = await request.post(`${API}/events`, {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh)' },
      data: { kind: 'signup' },
    });

    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('Type d’évènement non pris en charge');
  });

  test('the page still renders when the beacon fails', async ({ page }) => {
    await page.route(`${API}/events`, (route) => route.abort('failed'));

    await page.goto('/catalogue');

    await expect(page.locator('main')).toBeVisible();
  });
});
