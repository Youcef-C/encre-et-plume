import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProfileResponse, PortfolioItemResponse, SeekingTargetRole } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
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
} | null;

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string): Promise<ProfileResponse> {
    const account = await this.prisma.account.findUnique({
      where: { profileSlug: slug },
      include: { profile: true },
    });
    if (!account) throw new NotFoundException();
    return this.compose(account, account.profile);
  }

  async updateMine(accountId: string, dto: UpdateProfileDto): Promise<ProfileResponse> {
    const data: Record<string, unknown> = {};
    if (dto.bio !== undefined) data['bio'] = dto.bio;
    if (dto.city !== undefined) data['city'] = dto.city;
    if (dto.specialty !== undefined) data['specialty'] = dto.specialty;
    if (dto.tags !== undefined) data['tags'] = normalizeTags(dto.tags);
    if (dto.seeking !== undefined) {
      const s = dto.seeking;
      if (s.active !== undefined) data['seekingActive'] = s.active;
      if (s.targetRole !== undefined) data['seekingTargetRole'] = s.targetRole;
      if (s.genres !== undefined) data['seekingGenres'] = s.genres;
      if (s.projectLength !== undefined) data['seekingProjectLength'] = s.projectLength;
    }

    const profile = await this.prisma.profile.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    return this.compose(account!, profile);
  }

  async getPortfolio(slug: string): Promise<PortfolioItemResponse[]> {
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
      // ponytail: counters always 0 until PUB-4(followers)/DR-9(likes)/DR-3(works)/MR-1(supporters) land
      counters: { followers: 0, likes: 0, works: 0, supporters: 0 },
    };
  }
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const trimmed = t.trim();
    if (!trimmed) return false;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((t) => t.trim());
}
