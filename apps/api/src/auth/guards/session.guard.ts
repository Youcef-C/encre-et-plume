import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { verifySessionToken } from '../session-token';

// Avoid circular import: SessionStore lives in SecurityModule (which imports AuthModule).
// We use a structural interface to decouple the types.
interface SessionStoreApi {
  touch(accountId: string, jti: string, userAgent: string | null, ip: string | null): Promise<void>;
}

export type AuthRequest = Request & {
  accountId: string;
  jti?: string;
  tokenExp?: number;
  /**
   * B-5: set by OptionalSessionGuard when it could NOT resolve the caller's identity because Redis
   * was unavailable — as opposed to the caller genuinely being a visitor. The two are indistinguishable
   * downstream (`accountId` is undefined either way), and AgeGateService lets visitors through by
   * design, so without this flag a Redis blip silently downgrades a signed-in minor to a visitor.
   */
  identityDegraded?: boolean;
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

    // Shared with the MC-9 WS gateway: HS256 verify + denylist + session-epoch checks.
    // Returns null → 401; a Redis outage propagates (M3 fail-closed) exactly as before.
    const verified = await verifySessionToken(this.jwt, this.redis, token);
    if (!verified) throw new UnauthorizedException();

    req.accountId = verified.accountId;
    req.jti = verified.jti;
    req.tokenExp = verified.tokenExp;

    // F-18: best-effort session index touch — never blocks auth on failure.
    if (sharedSessionStore && verified.jti) {
      const ua = req.headers['user-agent'] ?? null;
      sharedSessionStore.touch(verified.accountId, verified.jti, ua, req.ip ?? null).catch(() => {});
    }

    return true;
  }
}
