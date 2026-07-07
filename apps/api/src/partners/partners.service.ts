import { Injectable } from '@nestjs/common';
import type { CreatorRole, PartnerCard, PartnerAvailability, PartnersResponse } from '@encre-et-plume/shared';
import {
  PARTNERS_PAGE_SIZE,
  PARTNERS_MAX_PAGE_SIZE,
  catalogGenreLabel,
  resolveGenre,
  expandLocationToken,
  formatLocationFr,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Validated GET /partners input (enums checked by PartnersQueryDto; page/pageSize parsed + clamped). */
export interface PartnersServiceInput {
  role?: CreatorRole;
  genres?: string[]; // F-20 vocabulary ids (validated against GENRES by the DTO); OR within the facet
  locations?: string[]; // continent-name | ISO country code | French région tokens; OR within the facet; absent → no filter
  availability?: PartnerAvailability;
  page: number;
  pageSize: number;
}

// Ordering: trending first, then oldest-first for a stable page boundary. Same for every viewer (no bias).
const ORDER_BY = [{ trendingScore: 'desc' as const }, { createdAt: 'asc' as const }];

const PROFILE_SELECT = {
  accountId: true,
  country: true,
  region: true,
  availability: true,
  creatorRoles: true,
  tags: true,
  account: { select: { profileSlug: true, displayName: true, avatar: true } },
  portfolio: { orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }], take: 2, select: { image: true } },
};

/** Lenient pagination parse: bad/absent → defaults; pageSize clamped to [1, max] (never errors). */
export function parsePartnersPagination(rawPage: unknown, rawPageSize: unknown): { page: number; pageSize: number } {
  const p = typeof rawPage === 'string' ? Number.parseInt(rawPage, 10) : NaN;
  const s = typeof rawPageSize === 'string' ? Number.parseInt(rawPageSize, 10) : NaN;
  const page = Number.isInteger(p) && p >= 1 ? p : 1;
  const pageSize = Number.isInteger(s) && s >= 1 ? Math.min(s, PARTNERS_MAX_PAGE_SIZE) : PARTNERS_PAGE_SIZE;
  return { page, pageSize };
}

/**
 * MC-1 "Trouver un·e partenaire" — paginated creator directory. Read-only; JWT-guarded (any
 * authenticated account reads — "creator" is not an authz role). Excludes the viewer, tombstoned
 * accounts, and non-creator profiles. Ordering is identical for every viewer — no self-role bias
 * (feedback §1: "Je suis" only prefills the FE filter, never biases results).
 *
 * AD-6 (ban/suspension) is unbuilt: when the ban flag lands it joins the `account` clause below
 * (e.g. `account: { deletedAt: null, bannedAt: null }`) — the tombstone exclusion is the current stand-in.
 */
@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async findPartners(input: PartnersServiceInput, viewerAccountId: string): Promise<PartnersResponse> {
    const where = this.buildWhere(input, viewerAccountId);
    const skip = (input.page - 1) * input.pageSize;
    const take = input.pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.profile.findMany({ where, orderBy: ORDER_BY, skip, take, select: PROFILE_SELECT }),
      this.prisma.profile.count({ where }),
    ]);
    return {
      items: (rows as unknown as ProfileRow[]).map((row) => mapCard(row, input.role)),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildWhere(input: PartnersServiceInput, viewerAccountId: string): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      account: { deletedAt: null }, // tombstoned out; AD-6 ban flag joins here later
      accountId: { not: viewerAccountId }, // own card excluded
      NOT: { creatorRoles: { isEmpty: true } }, // creator-role holders only = "public creator profile"
    };
    if (input.role) where['creatorRoles'] = { has: input.role };
    if (input.availability) where['availability'] = input.availability;
    // OR within a facet (any selected genre / location), AND across facets — catalog precedent.
    if (input.genres?.length) where['tags'] = { hasSome: input.genres.map((id) => catalogGenreLabel(id)) };
    if (input.locations?.length) {
      // Expand mixed tokens (continent → its countries, ISO code → itself, région → exact) then
      // OR the collected country/region matches. Country + région are two independent branches.
      const countries = new Set<string>();
      const regions = new Set<string>();
      for (const token of input.locations) {
        const exp = expandLocationToken(token);
        if (!exp) continue; // DTO already validated the tokens; defensive.
        exp.countries?.forEach((c) => countries.add(c));
        if (exp.region) regions.add(exp.region);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const or: Record<string, any>[] = [];
      if (countries.size) or.push({ country: { in: [...countries] } });
      if (regions.size) or.push({ region: { in: [...regions] } });
      if (or.length) where['OR'] = or;
    }
    return where;
  }
}

interface ProfileRow {
  accountId: string;
  country: string | null;
  region: string | null;
  availability: string;
  creatorRoles: string[];
  tags: string[];
  account: { profileSlug: string; displayName: string; avatar: string | null };
  portfolio: { image: string }[];
}

function mapCard(row: ProfileRow, roleFilter?: CreatorRole): PartnerCard {
  const role = (roleFilter && row.creatorRoles.includes(roleFilter) ? roleFilter : row.creatorRoles[0]) as CreatorRole;
  const genreTags: string[] = [];
  const styleTags: string[] = [];
  for (const tag of row.tags) {
    (resolveGenre(tag) ? genreTags : styleTags).push(tag);
  }
  return {
    userId: row.accountId,
    slug: row.account.profileSlug,
    name: row.account.displayName,
    avatarUrl: row.account.avatar,
    role,
    location: formatLocationFr(row.country, row.region),
    styleTags,
    genreTags,
    portfolioThumbs: row.portfolio.slice(0, 2).map((p) => p.image),
    availability: row.availability as PartnerAvailability,
  };
}
