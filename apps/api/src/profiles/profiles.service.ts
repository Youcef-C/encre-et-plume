import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProfileResponse, PortfolioItemResponse, SeekingTargetRole, PartnerRegion, PartnerAvailability, CreatorRole } from '@encre-et-plume/shared';
import { normalizeGenres } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { BlocksService } from '../blocks/blocks.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

type AccountRow = {
  id: string;
  displayName: string;
  profileSlug: string;
  avatar: string | null;
};

type ProfileRow = {
  coverImage: string | null;
  specialty: string | null;
  city: string | null;
  bio: string | null;
  seekingActive: boolean;
  seekingTargetRole: string | null;
  seekingGenres: string[];
  seekingProjectLength: string | null;
  tags: string[];
  creatorRoles: string[];
  country: string | null;
  region: string | null;
  availability: string;
} | null;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
  ) {}

  async getBySlug(slug: string, viewerId?: string): Promise<ProfileResponse> {
    const account = await this.prisma.account.findUnique({
      where: { profileSlug: slug },
      include: { profile: true },
    });
    if (!account) throw new NotFoundException();
    const base = this.compose(account, account.profile);
    // MC-10 round 2 (D8): directional block flags — only for a signed-in viewer who isn't the owner.
    if (viewerId && viewerId !== account.id) {
      return { ...base, ...(await this.blocks.pairFlags(viewerId, account.id)) };
    }
    return base;
  }

  async updateMine(accountId: string, dto: UpdateProfileDto): Promise<ProfileResponse> {
    const data: Record<string, unknown> = {};
    if (dto.bio !== undefined) data['bio'] = dto.bio;
    if (dto.city !== undefined) data['city'] = dto.city;
    if (dto.specialty !== undefined) data['specialty'] = dto.specialty;
    if (dto.tags !== undefined) data['tags'] = normalizeGenres(dto.tags);
    if (dto.creatorRoles !== undefined) data['creatorRoles'] = dto.creatorRoles;
    if (dto.country !== undefined) data['country'] = dto.country;
    if (dto.region !== undefined) data['region'] = dto.region;
    if (dto.availability !== undefined) data['availability'] = dto.availability;
    if (dto.seeking !== undefined) {
      const s = dto.seeking;
      if (s.active !== undefined) data['seekingActive'] = s.active;
      if (s.targetRole !== undefined) data['seekingTargetRole'] = s.targetRole;
      if (s.genres !== undefined) data['seekingGenres'] = normalizeGenres(s.genres);
      if (s.projectLength !== undefined) data['seekingProjectLength'] = s.projectLength;
    }

    // MC-1 §5 trust boundary: a French région only persists when the EFFECTIVE country is FR — never
    // trust the client to have nulled it. Effective value = the patched value if present, else the
    // stored row's (so patching country OR region alone still resolves against reality).
    if ('country' in data || 'region' in data) {
      let country = 'country' in data ? (data['country'] as string | null) : undefined;
      let region = 'region' in data ? (data['region'] as string | null) : undefined;
      if (country === undefined || region === undefined) {
        const stored = await this.prisma.profile.findUnique({ where: { accountId }, select: { country: true, region: true } });
        if (country === undefined) country = stored?.country ?? null;
        if (region === undefined) region = stored?.region ?? null;
      }
      if (country !== 'FR' && region != null) data['region'] = null;
    }

    const profile = await this.prisma.profile.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    return this.compose(account!, profile);
  }

  async getPortfolio(slug: string, viewerId?: string): Promise<PortfolioItemResponse[]> {
    const account = await this.prisma.account.findUnique({
      where: { profileSlug: slug },
      include: {
        profile: {
          include: {
            portfolio: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
          },
        },
      },
    });
    if (!account) throw new NotFoundException();
    // MC-10 round 2 (D8c): content is hidden both ways for a blocked pair — return [].
    if (viewerId && viewerId !== account.id && (await this.blocks.isBlockedPair(viewerId, account.id))) {
      return [];
    }
    return (account.profile?.portfolio ?? []).map((item) => ({
      id: item.id,
      image: item.image,
      caption: item.caption,
      order: item.order,
    }));
  }

  private compose(account: AccountRow, profile: ProfileRow): ProfileResponse {
    const specialty = profile?.specialty ?? null;
    const city = profile?.city ?? null;
    const parts = [specialty, city].filter(Boolean);
    const roleLine = parts.length ? parts.join(' · ') : null;

    const seekingActive = profile?.seekingActive ?? false;
    const seekingTargetRole = (profile?.seekingTargetRole ?? null) as SeekingTargetRole | null;
    const seekingGenres = profile?.seekingGenres ?? [];
    const seekingProjectLength = profile?.seekingProjectLength ?? null;

    let text: string | null = null;
    if (seekingActive && seekingTargetRole) {
      const genrePart = seekingGenres.length ? ` — ${seekingGenres.join(' / ')}` : '';
      const lengthPart = seekingProjectLength ? `, ${seekingProjectLength}` : '';
      text = `Cherche actuellement un·e ${seekingTargetRole}${genrePart}${lengthPart}`;
    }

    return {
      userId: account.id,
      slug: account.profileSlug,
      displayName: account.displayName,
      avatar: account.avatar,
      coverImage: profile?.coverImage ?? null,
      roleLine,
      specialty,
      city,
      bio: profile?.bio ?? null,
      seeking: { active: seekingActive, targetRole: seekingTargetRole, genres: seekingGenres, projectLength: seekingProjectLength, text },
      tags: profile?.tags ?? [],
      // MC-1 §9: creator sub-roles the user self-declares (F-2 vocabulary), shown + editable on the profile.
      creatorRoles: (profile?.creatorRoles ?? []) as CreatorRole[],
      // MC-1: location = country (ISO alpha-2, null if unset) + FR-only région sub-level (null off France).
      country: profile?.country ?? null,
      region: (profile?.region ?? null) as PartnerRegion | null,
      availability: (profile?.availability ?? 'ouvert') as PartnerAvailability,
      // ponytail: counters always 0 until PUB-4(followers)/DR-9(likes)/DR-3(works)/MR-1(supporters) land
      counters: { followers: 0, likes: 0, works: 0, supporters: 0 },
      // MC-10 round 2 (D8): default both false; getBySlug overlays pairFlags for a signed-in non-owner viewer.
      viewerHasBlocked: false,
      blockedByTarget: false,
    };
  }
}
