/**
 * F-24 — SEO : indexabilité.
 *
 * The headline check is that a CRAWLER — not a hydrated browser — reads the content. Every
 * assertion below therefore uses `request.get()` and inspects the raw response body; asserting on
 * `page.content()` after hydration would pass even with the bug fully present.
 */
import { test, expect } from '@playwright/test';

// A published, "Tous publics" seed work with a synopsis (prisma/seed.js).
const WORK_SLUG = 'neon-sutra';
const WORK_TITLE = 'Néon Sutra';
const WORK_SYNOPSIS_FRAGMENT = 'un moine renégat et une hackeuse de temple';
// The seed's 18+ work — DR-10 gates it, D-2 keeps it out of the sitemap.
const WORK_18PLUS_SLUG = 'le-dernier-ronin';

test.describe('F-24 · indexabilité', () => {
  test('a work page serves its real title and synopsis in the HTML body', async ({ request }) => {
    const res = await request.get(`/oeuvre/${WORK_SLUG}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain(`<title>${WORK_TITLE} — Encre &amp; Plume</title>`);
    expect(html).toContain(WORK_SYNOPSIS_FRAGMENT);
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('application/ld+json');
  });

  test('an unknown top-level URL returns HTTP 404, not a soft 200', async ({ request, page }) => {
    const res = await request.get('/une-url-qui-nexiste-pas');
    expect(res.status()).toBe(404);

    const response = await page.goto('/une-url-qui-nexiste-pas');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    await expect(page.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();
  });

  test('an unknown œuvre / illustration URL returns HTTP 404 too', async ({ request }) => {
    expect((await request.get('/oeuvre/oeuvre-qui-nexiste-pas')).status()).toBe(404);
    expect((await request.get('/illustration/00000000-0000-0000-0000-000000000000')).status()).toBe(404);
  });

  test('sitemap.xml lists a published work, a profile and no 18+ work', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();

    expect(xml).toContain(`/oeuvre/${WORK_SLUG}</loc>`);
    expect(xml).toContain('/decouvrir</loc>');
    expect(xml).not.toContain(`/oeuvre/${WORK_18PLUS_SLUG}</loc>`);
  });

  test('robots.txt disallows the private surface and points at the sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const txt = await res.text();

    expect(txt).toContain('Disallow: /parametres');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
    expect(txt).not.toContain('Disallow: /decouvrir');
  });

  // D-2 non-regression: excluding 18+ from the sitemap must not turn its page into a 404.
  test('an 18+ œuvre still renders DR-10 gate for an anonymous visitor, not a 404', async ({ request }) => {
    const res = await request.get(`/oeuvre/${WORK_18PLUS_SLUG}`);

    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('noindex');
  });

  test('the profile page serves its display name in the HTML body', async ({ request }) => {
    const res = await request.get('/dr1-yuki-moreau');
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain('Yuki Moreau');
    expect(html).toContain('"@type":"Person"');
  });
});
