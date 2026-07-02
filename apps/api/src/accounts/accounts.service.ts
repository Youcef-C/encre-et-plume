import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountSummary, UserRole, AccountPreferences, ThemePreference, MediaVariants } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import type { Account } from '@prisma/client';

const VALID_THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

// ponytail: duplicated in auth.service.ts — a 3-line coercion is cheaper than a shared util that ties auth↔accounts
function readPreferences(raw: unknown): AccountPreferences {
  const theme = (raw as Record<string, unknown> | null | undefined)?.['theme'];
  return { theme: VALID_THEMES.includes(theme as ThemePreference) ? (theme as ThemePreference) : 'system' };
}

function toSummary(account: Account): AccountSummary {
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    role: account.role as UserRole,
    verified: account.verified,
    slug: account.profileSlug,
    avatar: account.avatar,
    createdAt: account.createdAt.toISOString(),
    preferences: readPreferences(account.preferences),
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async updateRole(id: string, role: UserRole): Promise<AccountSummary> {
    const exists = await this.prisma.account.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();

    const account = await this.prisma.account.update({ where: { id }, data: { role } });
    return toSummary(account);
  }

  async updatePreferences(accountId: string, theme: ThemePreference): Promise<AccountSummary> {
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: { preferences: { theme } },
    });
    return toSummary(account);
  }

  /**
   * B8: Set the account avatar to the ready public `variants.web` URL of a Media record.
   * The media must be owned by the caller, kind=avatar, and status=ready.
   * Stores the CDN URL in Account.avatar (existing URL column — long-term form uses mediaId).
   */
  async setAvatar(accountId: string, mediaId: string): Promise<AccountSummary> {
    const mediaResponse = await this.media.getForOwner(accountId, mediaId);
    // getForOwner already enforces ownership (throws ForbiddenException if not owner)

    if (mediaResponse.kind !== 'avatar') {
      throw new BadRequestException('Media kind must be "avatar"');
    }

    if (mediaResponse.status !== 'ready') {
      throw new ConflictException('Media is not ready yet');
    }

    const variants = mediaResponse.variants as MediaVariants | Record<string, never>;
    const avatarUrl = (variants as MediaVariants).web ?? null;

    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: { avatar: avatarUrl },
    });

    // Cleanup prior avatar media (RGPD: no orphaned bytes); best-effort, don't block the response
    await this.media.deleteOwnerAvatarMedia(accountId, mediaId).catch(() => {});

    return toSummary(account);
  }

  /**
   * DELETE /accounts/me/avatar — clears avatar and deletes all owner avatar Media + S3 objects.
   * Order matters (ACID): null the column FIRST so a mid-crash never leaves Account.avatar
   * pointing at deleted S3 bytes; leftover media is swept by the orphan cleanup, a dangling
   * URL is not.
   */
  async deleteAvatar(accountId: string): Promise<AccountSummary> {
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: { avatar: null },
    });

    // Best-effort cleanup, like setAvatar — don't fail the request once the column is cleared.
    await this.media.deleteOwnerAvatarMedia(accountId).catch(() => {});

    return toSummary(account);
  }
}
