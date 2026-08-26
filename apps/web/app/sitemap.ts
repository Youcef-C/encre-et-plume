import type { MetadataRoute } from 'next';
import type { SitemapIndexResponse } from '@encre-et-plume/shared';
import { SITE_URL } from '../lib/site';

/**
 * F-24 FE-2 — Next 15 file convention, served at /sitemap.xml.
 *
 * Enumerates `GET /sitemap-index` page by page (BE-1). `GET /catalog` cannot serve this role: it is
 * genre-faceted, 18+-filtered per viewer, returns full cards with includes, and has no profile
 * equivalent at all.
 *
 * It NEVER throws. A 500 sitemap tells Google "this site is broken"; a short one that lists only
 * the static public routes tells it "these pages exist" and is re-fetched an hour later.
 *
 * D-4: one flat sitemap, no `generateSitemaps()` shard split. Next's sharding exists past 50 000
 * URLs; BE-1 is already paginated, so the split is a one-function change the day it is needed.
 */
export const revalidate = 3600;

const API = (process.env.NEXT_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:3001';

/** Public routes with no dynamic source — they are not in any enumeration. */
const STATIC_PATHS = [
  '/',
  '/decouvrir',
  '/galerie',
  '/classement',
  '/cgu',
  '/confidentialite',
  '/mentions-legales',
  '/charte',
];

/** Safety stop: 50 × 5000 rows per model. Guards against a `hasMore` that never flips. */
const MAX_PAGES = 50;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` }));

  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const res = await fetch(`${API}/sitemap-index?page=${page}`, { next: { revalidate } });
      if (!res.ok) break;
      const data = (await res.json()) as SitemapIndexResponse;

      for (const w of data.works) entries.push({ url: `${SITE_URL}/oeuvre/${w.slug}`, lastModified: new Date(w.lastModified) });
      // The profile page is the ROOT catch-all `/[slug]` — no prefix.
      for (const p of data.profiles) entries.push({ url: `${SITE_URL}/${p.slug}`, lastModified: new Date(p.lastModified) });
      for (const i of data.illustrations) entries.push({ url: `${SITE_URL}/illustration/${i.id}`, lastModified: new Date(i.lastModified) });

      if (!data.hasMore) break;
    }
  } catch {
    // API unreachable at (re)generation time — ship the static routes rather than a 500.
  }

  return entries;
}
