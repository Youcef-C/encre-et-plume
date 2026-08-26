// F-24 — sitemap enumeration contract.
//
// `GET /sitemap-index?page=<n>` is the ONE endpoint that lists every public URL the crawler may
// fetch. `GET /catalog` cannot serve this role: it is genre-faceted, returns full cards with
// includes, hides 18+ works behind a viewer check, and has no profile equivalent at all.
//
// `lastModified` (not `updatedAt`): none of `Work` / `Illustration` / `Account` carries an
// `@updatedAt` column, so the value is the publication date (`publishedAt`, or `createdAt` for an
// account). It feeds Next's `MetadataRoute.Sitemap.lastModified` and nothing else.

export interface SitemapEntry {
  slug: string;
  lastModified: string; // ISO 8601
}

export interface SitemapIllustrationEntry {
  id: string;
  lastModified: string; // ISO 8601
}

export interface SitemapIndexResponse {
  page: number;
  /** true when at least one of the three lists filled its page — fetch `page + 1`. */
  hasMore: boolean;
  /** Published works, 18+ excluded: `works.controller.ts` 403s an anonymous crawler on those. */
  works: SitemapEntry[];
  /** Live accounts (`deletedAt === null`). `Account.profileSlug` is NOT NULL, so every row has one. */
  profiles: SitemapEntry[];
  /** Published illustrations, 18+ genres excluded for the same reason as works. */
  illustrations: SitemapIllustrationEntry[];
}

/** Rows per model per page. One page covers the whole platform today (D-4: no shard split). */
export const SITEMAP_PAGE_SIZE = 5000;
