import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccountSummary, UserRole, AccountPreferences, ThemePreference } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
}
