import { Injectable } from '@nestjs/common';
import type { AccountSummary, AccountPreferences, ThemePreference, DmPolicy, LookingForStatus } from '@encre-et-plume/shared';
import { deriveIsAdult, DM_POLICIES, DM_POLICY_DEFAULT } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Account } from '@prisma/client';
import type { OnboardingDto } from './dto/onboarding.dto';

const VALID_THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

// ponytail: duplicated in auth.service.ts / accounts.service.ts — 3-line coercion is cheaper
// than a shared util that ties auth↔accounts↔onboarding modules together.
function readPreferences(raw: unknown): AccountPreferences {
  const obj = raw as Record<string, unknown> | null | undefined;
  const theme = obj?.['theme'];
  const dmPolicy = obj?.['dmPolicy'];
  return {
    theme: VALID_THEMES.includes(theme as ThemePreference) ? (theme as ThemePreference) : 'system',
    dmPolicy: DM_POLICIES.includes(dmPolicy as DmPolicy) ? (dmPolicy as DmPolicy) : DM_POLICY_DEFAULT,
  };
}

// ponytail: duplicated from auth.service.ts / accounts.service.ts — same reasoning.
function toSummary(account: Account): AccountSummary {
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    role: account.role as AccountSummary['role'],
    verified: account.verified,
    slug: account.profileSlug,
    avatar: account.avatar,
    createdAt: account.createdAt.toISOString(),
    preferences: readPreferences(account.preferences),
    emailVerified: account.emailVerifiedAt !== null,
    needsCguReconsent: false, // accounts endpoints default; /auth/me has live flag
    onboarded: account.onboardedAt !== null, // F-17
    isAdult: deriveIsAdult(account.birthdate), // DR-10
  };
}

// ponytail: duplicated from profiles.service.ts — 6-line function is cheaper than a cross-module util.
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

/** lookingFor → Profile.seekingActive / seekingTargetRole mapping (F-17 plan §3). */
function mapLookingFor(status: LookingForStatus): { seekingActive: boolean; seekingTargetRole: string | null } {
  switch (status) {
    case 'cherche_dessinateur': return { seekingActive: true,  seekingTargetRole: 'dessinateur·rice' };
    case 'cherche_scenariste':  return { seekingActive: true,  seekingTargetRole: 'scénariste' };
    case 'ouvert':              return { seekingActive: true,  seekingTargetRole: null };
    case 'regarde':             return { seekingActive: false, seekingTargetRole: null };
  }
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /me/onboarding — write onboarding selections onto the F-3 profile and stamp onboardedAt.
   * Idempotent: replays overwrite the same fields. Skip path (empty dto): only onboardedAt is set.
   */
  async complete(accountId: string, dto: OnboardingDto): Promise<AccountSummary> {
    // Build partial profile-write object from provided fields only.
    const writes: Record<string, unknown> = {};
    if (dto.creatorRoles !== undefined) writes['creatorRoles'] = dto.creatorRoles;
    if (dto.tags !== undefined) writes['tags'] = normalizeTags(dto.tags);
    if (dto.lookingFor !== undefined) {
      Object.assign(writes, mapLookingFor(dto.lookingFor as LookingForStatus));
    }

    // Profile upsert only when there are fields to write (skip path = no-op on profile).
    if (Object.keys(writes).length > 0) {
      await this.prisma.profile.upsert({
        where: { accountId },
        create: { accountId, ...writes },
        update: writes,
      });
    }

    // ponytail: AD-10 action log deferred — ActionLogService not yet built.
    // await actionLogService.record(accountId, 'profile_update');

    // Stamp onboardedAt (idempotent: replaying sets it again, harmless).
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: { onboardedAt: new Date() },
    });

    return toSummary(account);
  }
}
