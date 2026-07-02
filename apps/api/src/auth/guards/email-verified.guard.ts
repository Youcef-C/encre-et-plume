import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { EMAIL_NOT_VERIFIED } from '@encre-et-plume/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthRequest } from './session.guard';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    // ponytail: select only emailVerifiedAt; never trust JWT claim
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: req.accountId },
      select: { emailVerifiedAt: true },
    });

    if (account.emailVerifiedAt === null) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Confirmez votre e-mail pour continuer.',
        error: EMAIL_NOT_VERIFIED,
      });
    }

    return true;
  }
}
