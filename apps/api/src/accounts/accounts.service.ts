import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountSearchResponse, AccountSummary, UserRole, AccountPreferences, ReachableUser, ThemePreference, DmPolicy, UpdatePreferencesRequest, MediaVariants, BirthdateResponse } from '@encre-et-plume/shared';
import { ACCOUNT_SEARCH_MAX, deriveIsAdult, DM_POLICIES, DM_POLICY_DEFAULT } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { ConnectionsService } from '../connections/connections.service';
import { BlocksService } from '../blocks/blocks.service';
import type { Account } from '@prisma/client';

const SEARCH_QUERY_MAX = 100; // bound the input at the trust boundary
const SEARCH_CANDIDATE_WINDOW = 60; // DB window before the in-memory reachability filter caps at ACCOUNT_SEARCH_MAX

const VALID_THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

// ponytail: duplicated in auth.service.ts / onboarding.service.ts — a small coercion is cheaper than a shared util that ties auth↔accounts↔onboarding
function readPreferences(raw: unknown): AccountPreferences {
  const obj = raw as Record<string, unknown> | null | undefined;
  const theme = obj?.['theme'];
  const dmPolicy = obj?.['dmPolicy'];
  return {
    theme: VALID_THEMES.includes(theme as ThemePreference) ? (theme as ThemePreference) : 'system',
    dmPolicy: DM_POLICIES.includes(dmPolicy as DmPolicy) ? (dmPolicy as DmPolicy) : DM_POLICY_DEFAULT,
  };
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
    emailVerified: account.emailVerifiedAt !== null, // F-11
    needsCguReconsent: false, // F-13: accounts endpoints don't compute the live flag; /auth/me does
    onboarded: false, // F-17: ponytail: hardcoded like needsCguReconsent; accounts endpoints don't need live onboarding state
    isAdult: deriveIsAdult(account.birthdate), // DR-10
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly connections: ConnectionsService,
    private readonly blocks: BlocksService,
  ) {}

  /**
   * MC-13 reachable-user search (backs both group pickers). Accounts whose displayName matches `q`
   * (case-insensitive contains), RESTRICTED to users the caller may reach: their contacts (MC-8) OR
   * users whose dmPolicy ∈ {anyone, requests} (F-19) — contacts-only non-contacts are dropped. Excludes
   * the caller and any blocked pair (MC-10). Capped at ACCOUNT_SEARCH_MAX. Deliberately NOT /partners
   * (creator-only, excludes readers).
   * ponytail: in-memory policy filter over a 60-row window; move dmPolicy to a queryable column if
   * search volume demands.
   */
  async search(callerId: string, rawQ: string): Promise<AccountSearchResponse> {
    const q = (rawQ ?? '').trim().slice(0, SEARCH_QUERY_MAX);
    if (q.length === 0) return { items: [] };

    const [candidates, contacts, blocked] = await Promise.all([
      this.prisma.account.findMany({
        where: { deletedAt: null, id: { not: callerId }, displayName: { contains: q, mode: 'insensitive' } },
        select: { id: true, displayName: true, avatar: true, profileSlug: true, preferences: true },
        orderBy: { displayName: 'asc' },
        take: SEARCH_CANDIDATE_WINDOW,
      }) as Promise<{ id: string; displayName: string; avatar: string | null; profileSlug: string; preferences: unknown }[]>,
      this.connections.connectedIds(callerId),
      this.blocks.blockedPairIds(callerId),
    ]);

    const items: ReachableUser[] = [];
    for (const c of candidates) {
      if (blocked.has(c.id)) continue;
      const reachable = contacts.has(c.id) || readPreferences(c.preferences).dmPolicy !== 'contacts';
      if (!reachable) continue;
      items.push({ id: c.id, name: c.displayName, avatarUrl: c.avatar, slug: c.profileSlug });
      if (items.length >= ACCOUNT_SEARCH_MAX) break;
    }
    return { items };
  }

  async updateRole(id: string, role: UserRole): Promise<AccountSummary> {
    const exists = await this.prisma.account.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();

    const account = await this.prisma.account.update({ where: { id }, data: { role } });
    return toSummary(account);
  }

  /**
   * F-6 + F-19: merge the patch into the stored preferences JSON (never overwrite the whole column —
   * a theme-only body must not drop dmPolicy and vice-versa). At least one field is required.
   */
  async updatePreferences(accountId: string, patch: UpdatePreferencesRequest): Promise<AccountSummary> {
    if (patch.theme === undefined && patch.dmPolicy === undefined) {
      throw new BadRequestException('Requête invalide.');
    }
    const current = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { preferences: true },
    });
    if (!current) throw new NotFoundException();
    const merged = { ...((current.preferences as Record<string, unknown> | null) ?? {}), ...patch };
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: { preferences: merged },
    });
    return toSummary(account);
  }

  /** DR-10 BE-9: existing-account birthdate prompt — persists and returns the recomputed isAdult. */
  async setBirthdate(accountId: string, birthdate: string): Promise<AccountSummary> {
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: { birthdate: new Date(birthdate) },
    });
    return toSummary(account);
  }

  /**
   * Owner-only read of the caller's OWN raw birthdate, so the 18+ settings panel can prefill its
   * input — not a PII leak (DR-10's concern is birthdate in PUBLIC/other-user responses like
   * AccountSummary, which stays derived-only via isAdult). Never logged: the raw value only ever
   * flows into this response body, and `redaction.ts` already scrubs any `birthdate` key from logs.
   */
  async getBirthdate(accountId: string): Promise<BirthdateResponse> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { birthdate: true } });
    if (!account) throw new NotFoundException();
    return { birthdate: account.birthdate ? account.birthdate.toISOString().slice(0, 10) : null };
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
