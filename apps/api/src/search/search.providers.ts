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

/** Extensible seam: DR-3 adds WorksSearchProvider, DR-5 adds IllustrationsSearchProvider — no controller change needed. */
export interface SearchProvider {
  readonly type: SearchResultType;
  search(query: string, ctx: SearchContext): Promise<SearchResultItem[]>;
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
