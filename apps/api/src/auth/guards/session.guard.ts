import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';

export type AuthRequest = Request & {
  accountId: string;
  jti?: string;
  tokenExp?: number;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.['ep_session'] as string | undefined;
    if (!token) throw new UnauthorizedException();

    let payload: { sub: string; jti?: string; exp?: number; iat?: number };
    try {
      payload = this.jwt.verify<{ sub: string; jti?: string; exp?: number; iat?: number }>(token);
    } catch {
      throw new UnauthorizedException();
    }

    // Check JWT denylist (token revoked via logout)
    if (payload.jti) {
      const denied = await this.redis.get(`denylist:${payload.jti}`);
      if (denied) throw new UnauthorizedException();
    }

    // F-12: per-account session epoch — reject JWTs issued before the last password reset.
    // ponytail: session epoch; PasswordResetService.confirm() writes `session-epoch:<accountId>`.
    const epochStr = await this.redis.get(`session-epoch:${payload.sub}`);
    if (payload.iat !== undefined && epochStr !== null && payload.iat < parseInt(epochStr, 10)) {
      throw new UnauthorizedException();
    }

    req.accountId = payload.sub;
    req.jti = payload.jti;
    req.tokenExp = payload.exp;
    return true;
  }
}
