import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthRequest } from './session.guard';
import { RedisService } from '../../redis/redis.service';

/**
 * DR-10 (D5): same token-verify + denylist + session-epoch logic as SessionGuard, but NEVER
 * throws — it populates `req.accountId` when a valid `ep_session` cookie is present and
 * otherwise proceeds anonymously (`req.accountId` stays undefined). The only way a public
 * read endpoint (work/chapter/illustration) can tell a logged-in minor apart from a visitor
 * without requiring auth.
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest & { accountId?: string }>();
    const token = req.cookies?.['ep_session'] as string | undefined;
    if (!token) return true; // visitor — proceed anonymously

    let payload: { sub: string; jti?: string; exp?: number; iat?: number; ims?: number };
    try {
      payload = this.jwt.verify<{ sub: string; jti?: string; exp?: number; iat?: number; ims?: number }>(token);
    } catch {
      return true; // invalid/expired token — treat as visitor, never block a public read
    }

    if (payload.jti) {
      const denied = await this.redis.get(`denylist:${payload.jti}`);
      if (denied) return true; // revoked session — treat as visitor
    }

    const epochStr = await this.redis.get(`session-epoch-ms:${payload.sub}`);
    if (epochStr !== null) {
      const issuedMs = payload.ims ?? (payload.iat !== undefined ? payload.iat * 1000 : undefined);
      if (issuedMs !== undefined && issuedMs <= parseInt(epochStr, 10)) {
        return true; // pre-reset token — treat as visitor
      }
    }

    req.accountId = payload.sub;
    req.jti = payload.jti;
    req.tokenExp = payload.exp;
    return true;
  }
}
