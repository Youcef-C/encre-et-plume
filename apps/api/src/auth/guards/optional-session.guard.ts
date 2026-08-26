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
      payload = this.jwt.verify<{ sub: string; jti?: string; exp?: number; iat?: number; ims?: number }>(
        token,
        { algorithms: ['HS256'] }, // L: pin verify algorithm (defense-in-depth against alg confusion)
      );
    } catch {
      return true; // invalid/expired token — treat as visitor, never block a public read
    }

    // M3: strict reads — on a Redis outage we cannot confirm the token isn't revoked/pre-reset,
    // so fail closed by treating the request as an anonymous visitor (never throws: this guard
    // must never block a public read, it only decides whether to trust the token as authenticated).
    //
    // B-5: "could not resolve" is NOT the same as "is a visitor". A real visitor is unauthenticated
    // and DR-10 gates them with the client interstitial; a signed-in minor dropped here would be
    // handed that same clickable interstitial instead of the server-side refusal they are owed.
    // Mark the request so AgeGateService can refuse rather than assume, and leave the genuine
    // visitor path (no cookie, bad token) untouched — those really are visitors.
    if (payload.jti) {
      let denied: string | null;
      try {
        denied = await this.redis.getOrThrow(`denylist:${payload.jti}`);
      } catch {
        req.identityDegraded = true;
        return true;
      }
      if (denied) return true; // revoked session — treat as visitor
    }

    let epochStr: string | null;
    try {
      epochStr = await this.redis.getOrThrow(`session-epoch-ms:${payload.sub}`);
    } catch {
      req.identityDegraded = true;
      return true;
    }
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
