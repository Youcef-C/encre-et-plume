import { Controller, Get, Query } from '@nestjs/common';
import type { SitemapIndexResponse } from '@encre-et-plume/shared';
import { AUDIENCE_RATING_18PLUS, PLUS18_GENRE_LABELS, SITEMAP_PAGE_SIZE } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * F-24 BE-1 — the sitemap's enumeration source. Public, no guard: a crawler has no session, and
 * every row it returns is already public.
 *
 * 18+ works and 18+ illustrations are excluded on purpose (D-2): `works.controller.ts` and
 * `gallery.controller.ts` run `assertMayView18Plus()` on an anonymous caller, so a crawler gets a
 * 403 and never HTML. Advertising those URLs burns crawl budget and emits a soft-error signal.
 *
 * ponytail: the query lives in the controller — three `findMany`s with a `select` and no mapping
 * logic beyond `toISOString()`. A service class here would be one method that forwards.
 */
@Controller()
export class SitemapController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('sitemap-index')
  async index(@Query('page') page?: string): Promise<SitemapIndexResponse> {
    const n = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const skip = (n - 1) * SITEMAP_PAGE_SIZE;
    // One probe row past the page tells us `hasMore` without a second COUNT per model.
    const take = SITEMAP_PAGE_SIZE + 1;
    const paging = { orderBy: { id: 'asc' } as const, skip, take };

    const [works, profiles, illustrations] = await Promise.all([
      this.prisma.work.findMany({
        where: { publishedAt: { not: null }, audienceRating: { not: AUDIENCE_RATING_18PLUS } },
        select: { slug: true, publishedAt: true },
        ...paging,
      }),
      this.prisma.account.findMany({
        // `profileSlug` is NOT NULL in the schema, so "has a slug" needs no filter.
        where: { deletedAt: null },
        select: { profileSlug: true, createdAt: true },
        ...paging,
      }),
      this.prisma.illustration.findMany({
        where: { publishedAt: { not: null }, NOT: { genres: { hasSome: PLUS18_GENRE_LABELS } } },
        select: { id: true, publishedAt: true },
        ...paging,
      }),
    ]);

    return {
      page: n,
      hasMore:
        works.length > SITEMAP_PAGE_SIZE ||
        profiles.length > SITEMAP_PAGE_SIZE ||
        illustrations.length > SITEMAP_PAGE_SIZE,
      works: works.slice(0, SITEMAP_PAGE_SIZE).map((w) => ({
        slug: w.slug,
        lastModified: (w.publishedAt as Date).toISOString(),
      })),
      profiles: profiles.slice(0, SITEMAP_PAGE_SIZE).map((a) => ({
        slug: a.profileSlug,
        lastModified: a.createdAt.toISOString(),
      })),
      illustrations: illustrations.slice(0, SITEMAP_PAGE_SIZE).map((i) => ({
        id: i.id,
        lastModified: (i.publishedAt as Date).toISOString(),
      })),
    };
  }
}
