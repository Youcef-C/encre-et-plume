# F-24 — SEO : indexabilité et Search Console

**As a** platform operator, **I want** the public catalogue to be findable in search engines and its performance measurable, **so that** readers discover œuvres without already knowing the site exists.

> Screen(s): cross-cutting — `/oeuvre/[slug]`, `/[slug]`, `/lecteur/[slug]`, `/illustration/[id]` · Priority: **Should** · Fidelity: **Inferred**

## Why this story exists

Audited 2026-08-05: **the SEO surface is empty, and no content page is readable by a crawler.**

- **No sitemap, no `robots.txt`, no `public/` directory** — zero mentions of "sitemap" in the repo.
- **No `metadataBase`, no canonical, no Open Graph, no JSON-LD.** The root layout carries the only
  site-wide metadata; 25 pages export hardcoded static titles; **there is not a single `generateMetadata`
  in the whole app**. `/oeuvre/[slug]`, `/[slug]` and `/lecteur/[slug]` set **no metadata at all**, so every
  work and every profile shares the title « Encre & Plume », and every illustration shares
  « Illustration — Encre & Plume ».
- **Every public content page is a client-fetch shell.** `app/oeuvre/[slug]/page.tsx` is 10 lines
  delegating to a `'use client'` component that `useEffect`-fetches a **separate origin**
  (`NEXT_PUBLIC_API_URL`, `credentials: 'include'`). Same for profile, reader, illustration and home. Only
  the four legal pages render server-side. A crawler sees an empty shell.
- **Soft 404s at scale.** "introuvable" states render inside HTTP **200** — `notFound()` is never called —
  and the root catch-all `app/[slug]` means **any** unknown top-level URL returns 200 with a client-rendered
  "Profil introuvable". Unbounded indexable garbage.
- No site URL is configured anywhere, which blocks canonical URLs, sitemaps and OG images alike.

**Consequence for measurement:** Search Console reports nothing for pages that are not indexed. This story
is the prerequisite for SEO analytics, not an optimisation of it.

## Frontend
- **Prerequisite:** `NEXT_PUBLIC_SITE_URL` + `metadataBase` in the root layout. Nothing below works without
  a canonical origin.
- `app/robots.ts` and `app/sitemap.ts` — Next 15 file conventions, **no dependency and no `public/` needed**.
  Note: the API has **no endpoint that enumerates all works or profiles** today; the sitemap needs one (or
  a paginated crawl of `GET /catalog`).
- `generateMetadata` on the four content routes: title, description, canonical, Open Graph, Twitter card,
  fetched server-side from the same public endpoints.
- **Real 404s** — call `notFound()` when the metadata fetch 404s, add `app/not-found.tsx`, and make the root
  catch-all 404 on unknown slugs. This is a live bug, not an SEO nicety.
- `noindex` on `/parametres`, `/compte`, `/admin`, `/espace-*`, `/projet/*`, `/messages`, auth pages.
- **Second tier — the real work:** server-render the content pages. Lazy approach: move the anonymous
  initial fetch into the existing server component wrapper
  (`fetch(API, { next: { revalidate: 60 } })`) and pass it as an `initialData` prop to the **untouched**
  client component, which keeps every interaction and refetches for the signed-in view. One prop, no
  rewrite. Plus inline JSON-LD (`Book`/`CreativeWork`, `Person`, `BreadcrumbList`) — about ten lines per
  page, no library.

## Backend
- A slug-enumeration endpoint for the sitemap (paginated, published content only), or confirm `GET /catalog`
  can serve that role.
- Optional, later: the nightly job ([[DR-13]]'s cron) pulls the **Search Console API** into `DailyStat`
  (`metric='gsc_clicks'`, `dim=page|query`) so search performance sits beside the audience series.

## Dependencies
- [[F-23]] — shares `DailyStat` if Search Console data is ever ingested.
- [[DR-3]] [[DR-5]] — the work and illustration pages being made indexable.

## Notes
- **We do not build an "SEO tracker".** Impressions, clicks, CTR, average position and the actual queries
  come from **Google Search Console**, free, and only Google has them. A browser-side tracker would
  reinvent GSC with worse data.
- Excluded: hreflang (single language), AMP, prerendering services, keyword-rank tracking, an SEO dashboard.
- Sequenced **after** [[F-23]] by explicit decision (2026-08-05): analytics first, SEO second.
- Verification: `curl` a work page and grep the HTML for its title and synopsis (today: absent); an unknown
  URL returns **404**, not 200; the sitemap lists published works; Search Console accepts the property and
  starts reporting impressions.
