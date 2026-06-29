import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccountSummary, UserRole } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateRole(id: string, role: UserRole): Promise<AccountSummary> {
    const exists = await this.prisma.account.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();

    const account = await this.prisma.account.update({
      where: { id },
      data: { role },
    });

    return {
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      role: account.role as UserRole,
      verified: account.verified,
      slug: account.profileSlug,
      avatar: account.avatar,
      createdAt: account.createdAt.toISOString(),
    };
  }
}
