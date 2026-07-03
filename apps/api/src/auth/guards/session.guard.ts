import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';

// Avoid circular import: SessionStore lives in SecurityModule (which imports AuthModule).
// We use a structural interface to decouple the types.
interface SessionStoreApi {
  touch(accountId: string, jti: string, userAgent: string | null, ip: string | null): Promise<void>;
}

export type AuthRequest = Request & {
  accountId: string;
  jti?: string;
  tokenExp?: number;
};

// Module-scoped, NOT an instance field: several feature modules re-provide SessionGuard
// locally, so multiple instances enforce requests. SecurityModule.onModuleInit() wires the
// store on ONE instance — module scope makes the wiring visible to all of them.
let sharedSessionStore: SessionStoreApi | undefined;

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  /** F-18: called by SecurityModule.onModuleInit() to wire the session index. @Optional via setter. */
  setSessionStore(store: SessionStoreApi): void {
    sharedSessionStore = store;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.['ep_session'] as string | undefined;
    if (!token) throw new UnauthorizedException();

    let payload: { sub: string; jti?: string; exp?: number; iat?: number; ims?: number };
    try {
      payload = this.jwt.verify<{ sub: string; jti?: string; exp?: number; iat?: number; ims?: number }>(token);
    } catch {
      throw new UnauthorizedException();
    }

    // Check JWT denylist (token revoked via logout)
    if (payload.jti) {
      const denied = await this.redis.get(`denylist:${payload.jti}`);
      if (denied) throw new UnauthorizedException();
    }

    // F-12: per-account session epoch — reject JWTs issued before the last password reset.
    // ms precision via the custom `ims` claim: second-granularity iat left a 1s window where
    // a token issued the same second as the reset survived it. Legacy tokens (no ims) fall
    // back to iat*1000 — the boundary (<=) counts as pre-reset, so the old same-second hole
    // stays closed for them too. PasswordResetService.confirm() writes `session-epoch-ms:<id>`.
    const epochStr = await this.redis.get(`session-epoch-ms:${payload.sub}`);
    if (epochStr !== null) {
      const issuedMs = payload.ims ?? (payload.iat !== undefined ? payload.iat * 1000 : undefined);
      if (issuedMs !== undefined && issuedMs <= parseInt(epochStr, 10)) {
        throw new UnauthorizedException();
      }
    }

    req.accountId = payload.sub;
    req.jti = payload.jti;
    req.tokenExp = payload.exp;

    // F-18: best-effort session index touch — never blocks auth on failure.
    if (sharedSessionStore && payload.jti) {
      const ua = req.headers['user-agent'] ?? null;
      sharedSessionStore.touch(payload.sub, payload.jti, ua, req.ip ?? null).catch(() => {});
    }

    return true;
  }
}
