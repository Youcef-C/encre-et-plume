import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@encre-et-plume/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthRequest } from './session.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true; // no @Roles() = session-only gate, already passed SessionGuard

    const req = context.switchToHttp().getRequest<AuthRequest>();
    // ponytail: load only role+verified; never trust a claim from the JWT
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: req.accountId }, select: { role: true, verified: true } });

    if (!required.includes(account.role as UserRole)) throw new ForbiddenException();
    // BE-AC5: editor surfaces additionally require verified === true
    if (account.role === 'editor' && !account.verified) throw new ForbiddenException();

    return true;
  }
}
