import { ForbiddenException, Injectable } from '@nestjs/common';
import { deriveIsAdult, AGE_RESTRICTED, type UserRole } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

// AD-4: staff/moderation surfaces are exempt from the gate — only maintainer/admin (F-2 staff
// tiers). Editors are creator-facing, not staff, so they stay subject to the gate.
const STAFF_ROLES: readonly UserRole[] = ['maintainer', 'admin'];

/**
 * DR-10 (BE-5, D3): the only hard, server-side 403 is for a logged-in MINOR (birthdate present
 * and derives to < 18). Visitors and logged-in accounts without a birthdate are never blocked
 * here — the server has no verifiable age for them; the client interstitial (self-declaration /
 * birthdate prompt) is the conservative-default gate for those cases.
 */
@Injectable()
export class AgeGateService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMayView18Plus(accountId: string | undefined): Promise<void> {
    if (!accountId) return; // visitor — D3: UI self-declaration is the gate

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { birthdate: true, role: true },
    });
    if (!account) return; // ponytail: unknown/deleted account — nothing to enforce here

    if (STAFF_ROLES.includes(account.role as UserRole)) return; // AD-4 staff exemption

    const isAdult = deriveIsAdult(account.birthdate);
    if (isAdult === false) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Ce contenu est réservé aux adultes.',
        error: AGE_RESTRICTED,
      });
    }
    // isAdult === true -> allow; isAdult === null (no birthdate) -> allow (D3)
  }
}
