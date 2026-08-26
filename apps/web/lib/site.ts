// F-24 — the canonical origin. Nothing in the SEO surface (metadataBase, canonical URLs, Open
// Graph images, robots.txt's sitemap line, the sitemap itself) works without one.
//
// The localhost fallback matches `lib/api.ts`'s `NEXT_PUBLIC_API_URL` fallback (D-5): without it
// `metadataBase` is `undefined` in dev and CI and every canonical/OG URL silently degrades to a
// relative path — a failure that only surfaces in production.
//
// Set NEXT_PUBLIC_SITE_URL to the deployed origin, with no trailing slash.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Absolute URL for a site-relative path (`/oeuvre/x` → `https://…/oeuvre/x`). */
export const siteUrl = (path: string): string => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
