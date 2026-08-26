// F-24 FE-3/FE-5 — server metadata + the real-404 fix on the four content routes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IllustrationDetail, ProfileResponse, WorkDetail } from '@encre-et-plume/shared';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => ({
  notFound,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import { seoDescription, buildMetadata, workJsonLd, breadcrumbJsonLd } from '../lib/seo';
import { SITE_URL } from '../lib/site';
import { generateMetadata as workMeta } from '../app/oeuvre/[slug]/page';
import { generateMetadata as profileMeta, default as ProfilePage } from '../app/[slug]/page';
import { generateMetadata as illustrationMeta } from '../app/illustration/[id]/page';
import { generateMetadata as readerMeta } from '../app/lecteur/[slug]/page';

const work = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: 'https://cdn.test/cover.jpg',
  genre: 'Seinen',
  themes: ['Action'],
  format: 'Manga',
  complete: true,
  audienceRating: '16+',
  meta: 'Camille R. × Yuki M. · 12 ch.',
  publishedAt: '2026-03-14T00:00:00.000Z',
  synopsis: 'Deux âmes liées par la brume et le sabre.',
  hashtags: [],
  proseExcerpt: null,
  likeCount: 1,
  readCount: 1,
  favoriteCount: 1,
  ratingAvg: 4.7,
  ratingStoryAvg: 4.7,
  ratingArtAvg: 4.7,
  reviewCount: 3,
  chapterCount: 12,
  team: [{ id: 'a1', name: 'Yuki Moreau', slug: 'yuki-moreau', role: 'dessinateur', city: null, avatar: null }],
  fundingGoals: [],
  reviews: [],
  collectionItems: null,
} as unknown as WorkDetail;

const profile = {
  userId: 'a1',
  slug: 'yuki-moreau',
  displayName: 'Yuki Moreau',
  avatar: 'https://cdn.test/a.jpg',
  coverImage: null,
  roleLine: 'Dessinateur·rice · Lyon',
  specialty: null,
  city: 'Lyon',
  bio: 'Encre dense et trames serrées.',
  tags: [],
} as unknown as ProfileResponse;

const illustration = {
  id: 'ill-1',
  title: 'Onibi',
  description: 'Un feu-follet dans les ruines.',
  category: 'personnages',
  categoryLabel: 'Personnages',
  genres: [],
  hashtags: [],
  image: 'https://cdn.test/i.jpg',
  dimensionsLabel: null,
  tools: null,
  license: null,
  likeCount: 0,
  publishedAt: '2026-03-14T00:00:00.000Z',
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'yuki-moreau', role: 'Dessinateur·rice', city: null, avatar: null },
  is18plus: false,
  collections: [],
} as unknown as IllustrationDetail;

const respond = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => body }));

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

describe('seoDescription', () => {
  it('collapses whitespace and keeps a short synopsis intact', () => {
    expect(seoDescription('  Deux   âmes\nliées. ', 'fallback')).toBe('Deux âmes liées.');
  });

  it('falls back when the source is empty or null', () => {
    expect(seoDescription(null, 'Repli')).toBe('Repli');
    expect(seoDescription('   ', 'Repli')).toBe('Repli');
  });

  it('truncates to 160 characters on a word boundary', () => {
    const long = 'mot '.repeat(80);
    const out = seoDescription(long, 'x');
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});

describe('buildMetadata', () => {
  it('emits an absolute canonical, Open Graph and a Twitter card', () => {
    const m = buildMetadata({ title: 'T', description: 'D', path: '/oeuvre/x', image: 'https://cdn/i.jpg' });

    expect(m.title).toBe('T — Encre & Plume'); // the suffix is appended here, not by a root template
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/oeuvre/x`);
    expect(m.openGraph?.url).toBe(`${SITE_URL}/oeuvre/x`);
    expect(m.openGraph).toMatchObject({ title: 'T', description: 'D', siteName: 'Encre & Plume', locale: 'fr_FR' });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'T', description: 'D' });
    expect(m.robots).toBeUndefined();
  });

  it('adds robots noindex when asked', () => {
    expect(buildMetadata({ title: 'T', description: 'D', path: '/x', noindex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});

describe('JSON-LD builders', () => {
  it('describes a work as a CreativeWork with its author and rating', () => {
    expect(workJsonLd(work)).toMatchObject({
      '@type': 'CreativeWork',
      name: 'Lames de Brume',
      url: `${SITE_URL}/oeuvre/lames-de-brume`,
      author: [{ '@type': 'Person', name: 'Yuki Moreau' }],
      aggregateRating: { ratingValue: 4.7, reviewCount: 3 },
    });
  });

  it('types a Roman as a Book', () => {
    expect(workJsonLd({ ...work, format: 'Roman' })['@type']).toBe('Book');
  });

  it('numbers a breadcrumb trail from 1 with absolute items', () => {
    expect(breadcrumbJsonLd([{ name: 'Catalogue', path: '/decouvrir' }])).toMatchObject({
      itemListElement: [{ position: 1, name: 'Catalogue', item: `${SITE_URL}/decouvrir` }],
    });
  });
});

describe('generateMetadata on the content routes', () => {
  // NB: braces are load-bearing — `mockClear()` returns the mock, and Vitest calls a value returned
  // from `beforeEach` as the test's teardown, which would fire `notFound()` after every test.
  beforeEach(() => {
    notFound.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives a work its real title, description, canonical and card', async () => {
    respond(200, work);

    const m = await workMeta(params({ slug: 'lames-de-brume' }));

    expect(m.title).toBe('Lames de Brume — Encre & Plume');
    expect(m.description).toBe('Deux âmes liées par la brume et le sabre.');
    expect(String(m.description).length).toBeLessThanOrEqual(160);
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/oeuvre/lames-de-brume`);
    expect(m.openGraph?.images).toBeTruthy();
    expect(m.twitter).toBeTruthy();
    expect(m.robots).toBeUndefined();
  });

  it('never forwards a session cookie on the server fetch', async () => {
    respond(200, work);

    await workMeta(params({ slug: 'lames-de-brume' }));

    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init).toEqual({ next: { revalidate: 60 } });
    expect(init.credentials).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('marks an 18+ work noindex (D-2: a crawler gets a 403 on it anyway)', async () => {
    respond(200, { ...work, audienceRating: '18+' });

    expect((await workMeta(params({ slug: 'x' }))).robots).toEqual({ index: false, follow: false });
  });

  it('404s a work whose metadata fetch 404s', async () => {
    respond(404, { message: 'Œuvre introuvable' });

    await expect(workMeta(params({ slug: 'nope' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('does NOT 404 on a 403 — DR-10 age gate still has to render', async () => {
    respond(403, { error: 'AGE_RESTRICTED' });

    const m = await workMeta(params({ slug: 'le-dernier-ronin' }));

    expect(notFound).not.toHaveBeenCalled();
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it('does NOT 404 when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(workMeta(params({ slug: 'x' }))).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('gives a profile its display name and bio', async () => {
    respond(200, profile);

    const m = await profileMeta(params({ slug: 'yuki-moreau' }));

    expect(m.title).toBe('Yuki Moreau — Encre & Plume');
    expect(m.description).toBe('Encre dense et trames serrées.');
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/yuki-moreau`);
  });

  it('404s the ROOT catch-all on an unknown slug — the live bug', async () => {
    respond(404, { message: 'Profil introuvable' });

    await expect(profileMeta(params({ slug: 'une-url-qui-nexiste-pas' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('404s the root catch-all PAGE itself, not only its metadata', async () => {
    respond(404, { message: 'Profil introuvable' });

    await expect(ProfilePage(params({ slug: 'une-url-qui-nexiste-pas' }))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('gives an illustration its title, artist and canonical', async () => {
    respond(200, illustration);

    const m = await illustrationMeta({ params: Promise.resolve({ id: 'ill-1' }) });

    expect(m.title).toBe('Onibi — Encre & Plume');
    expect(m.description).toBe('Un feu-follet dans les ruines.');
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/illustration/ill-1`);
  });

  it('404s an unknown illustration id', async () => {
    respond(404, { message: 'Illustration introuvable' });

    await expect(illustrationMeta({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('titles the reader from the work and canonicalises /lecteur/:slug', async () => {
    respond(200, work);

    const m = await readerMeta(params({ slug: 'lames-de-brume' }));

    expect(String(m.title)).toContain('Lames de Brume');
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/lecteur/lames-de-brume`);
  });

  it('404s the reader on an unknown slug', async () => {
    respond(404, { message: 'Œuvre introuvable' });

    await expect(readerMeta(params({ slug: 'nope' }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
