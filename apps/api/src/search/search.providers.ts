import { Injectable } from '@nestjs/common';
import type { SearchResultItem, SearchResultType } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Injection token for the list of registered search providers. */
export const SEARCH_PROVIDERS = 'SEARCH_PROVIDERS';

/** Viewer context carried into every provider call. accountId reserved for draft-visibility filtering in DR-3/DR-5. */
export interface SearchContext {
  accountId: string;
  limit: number;
}

/** Extensible seam: one provider per corpus, registered in search.module.ts — no controller change needed. */
export interface SearchProvider {
  readonly type: SearchResultType;
  search(query: string, ctx: SearchContext): Promise<SearchResultItem[]>;
}

/** Case-insensitive `contains` — the one match shape every provider below uses. */
const like = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/**
 * DR-3 corpus. `SEARCH_RESULT_TYPES` declared `works` from day one but no provider ever backed it,
 * so the global search found people and never a title (seed-coherence pass, 2026-08-02).
 *
 * Matching on the author's name is deliberate and is the same rule as the catalog's `q` facet: it
 * goes through the WorkCreator relation, NOT through a denormalized name string (the `Work.meta`
 * column that used to carry it named the wrong person on 7 of 9 seeded works, and is gone).
 */
@Injectable()
export class WorksSearchProvider implements SearchProvider {
  readonly type: SearchResultType = 'works';

  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, ctx: SearchContext): Promise<SearchResultItem[]> {
    const works = await this.prisma.work.findMany({
      where: {
        publishedAt: { not: null }, // public corpus only — a draft/unpublished project never surfaces
        OR: [{ title: like(q) }, { creators: { some: { account: { displayName: like(q) } } } }],
      },
      orderBy: [{ likeCount: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
    });
    return works.map((w) => ({
      id: w.id,
      type: 'works' as const,
      title: w.title,
      thumbnail: w.coverImage,
      route: `/oeuvre/${w.slug}`,
    }));
  }
}

/** DR-5 corpus. `artistName` is the illustration's own denormalized-at-write display name. */
@Injectable()
export class IllustrationsSearchProvider implements SearchProvider {
  readonly type: SearchResultType = 'illustrations';

  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, ctx: SearchContext): Promise<SearchResultItem[]> {
    const illustrations = await this.prisma.illustration.findMany({
      where: {
        publishedAt: { not: null },
        OR: [{ title: like(q) }, { artistName: like(q) }],
      },
      orderBy: [{ likeCount: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
    });
    return illustrations.map((i) => ({
      id: i.id,
      type: 'illustrations' as const,
      title: i.title,
      thumbnail: i.image,
      route: `/illustration/${i.id}`,
    }));
  }
}

@Injectable()
export class CreatorsSearchProvider implements SearchProvider {
  readonly type: SearchResultType = 'creators';

  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, ctx: SearchContext): Promise<SearchResultItem[]> {
    const accounts = await this.prisma.account.findMany({
      where: {
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { profile: { specialty: { contains: q, mode: 'insensitive' } } },
          { profile: { city: { contains: q, mode: 'insensitive' } } },
          // ponytail: exact tag match only; DR-2 brings the normalized/trigram backbone, swap then
          { profile: { tags: { has: q } } },
        ],
      },
      include: { profile: true },
      orderBy: { displayName: 'asc' },
      take: ctx.limit,
    });
    // ponytail: all profiles public today → no visibility filter; ctx.accountId reserved for DR-3/DR-5 draft filtering
    return accounts.map((a) => ({
      id: a.id,
      type: 'creators' as const,
      title: a.displayName,
      thumbnail: a.avatar,
      route: `/${a.profileSlug}`,
    }));
  }
}
