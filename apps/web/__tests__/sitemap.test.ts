// F-24 FE-2 — app/sitemap.ts pages the enumeration endpoint and never throws.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sitemap from '../app/sitemap';
import { SITE_URL } from '../lib/site';

const page = (over: Partial<Record<string, unknown>> = {}) => ({
  page: 1,
  hasMore: false,
  works: [],
  profiles: [],
  illustrations: [],
  ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const urls = (entries: Awaited<ReturnType<typeof sitemap>>) => entries.map((e) => e.url);

describe('sitemap.xml (F-24)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes the static public routes', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(ok(page()));

    expect(urls(await sitemap())).toEqual(
      expect.arrayContaining([
        `${SITE_URL}/`,
        `${SITE_URL}/decouvrir`,
        `${SITE_URL}/galerie`,
        `${SITE_URL}/classement`,
        `${SITE_URL}/cgu`,
        `${SITE_URL}/confidentialite`,
        `${SITE_URL}/mentions-legales`,
        `${SITE_URL}/charte`,
      ]),
    );
  });

  it('maps the three URL shapes onto SITE_URL with their lastModified', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok(
        page({
          works: [{ slug: 'neon-sutra', lastModified: '2026-01-02T00:00:00.000Z' }],
          profiles: [{ slug: 'yuki-moreau', lastModified: '2026-01-03T00:00:00.000Z' }],
          illustrations: [{ id: 'ill-1', lastModified: '2026-01-04T00:00:00.000Z' }],
        }),
      ),
    );

    const entries = await sitemap();

    expect(urls(entries)).toEqual(
      expect.arrayContaining([
        `${SITE_URL}/oeuvre/neon-sutra`,
        `${SITE_URL}/yuki-moreau`,
        `${SITE_URL}/illustration/ill-1`,
      ]),
    );
    expect(entries.find((e) => e.url.endsWith('/oeuvre/neon-sutra'))?.lastModified).toEqual(
      new Date('2026-01-02T00:00:00.000Z'),
    );
  });

  it('keeps paging while hasMore is true and stops when it flips', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(ok(page({ hasMore: true, works: [{ slug: 'a', lastModified: '2026-01-01T00:00:00.000Z' }] })));
    f.mockResolvedValueOnce(ok(page({ page: 2, hasMore: false, works: [{ slug: 'b', lastModified: '2026-01-01T00:00:00.000Z' }] })));

    const list = urls(await sitemap());

    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0]).toContain('page=2');
    expect(list).toEqual(expect.arrayContaining([`${SITE_URL}/oeuvre/a`, `${SITE_URL}/oeuvre/b`]));
  });

  it('returns the static routes instead of throwing when the API rejects', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));

    const list = urls(await sitemap());

    expect(list).toContain(`${SITE_URL}/decouvrir`);
    expect(list.some((u) => u.includes('/oeuvre/'))).toBe(false);
  });

  it('returns the static routes when the API answers with an error status', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    expect(urls(await sitemap())).toContain(`${SITE_URL}/galerie`);
  });
});
