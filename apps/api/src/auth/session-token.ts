import type { JwtService } from '@nestjs/jwt';
import type { RedisService } from '../redis/redis.service';

export interface VerifiedToken {
  accountId: string;
  jti?: string;
  tokenExp?: number;
}

interface Payload {
  sub: string;
  jti?: string;
  exp?: number;
  iat?: number;
  ims?: number;
}

/**
 * F-1/F-12/F-18 session-cookie verification, shared by SessionGuard and the MC-9 WS gateway so a
 * socket can't outlive a logout/reset. HS256 verify → `denylist:<jti>` (logout) → `session-epoch-ms:<sub>`
 * (password reset) checks. Returns the verified identity, or null when the token is missing-fields /
 * invalid / revoked / pre-reset.
 *
 * M3 strict: the Redis checks use getOrThrow, so a Redis OUTAGE rethrows here rather than resolving to
 * an authenticated identity. Callers that must fail closed (SessionGuard → 401, the gateway → disconnect)
 * let it propagate — never swallow it into a live session.
 */
export async function verifySessionToken(
  jwt: Pick<JwtService, 'verify'>,
  redis: Pick<RedisService, 'getOrThrow'>,
  token: string,
): Promise<VerifiedToken | null> {
  let payload: Payload;
  try {
    payload = jwt.verify<Payload>(token, { algorithms: ['HS256'] }); // L: pin verify algorithm (alg-confusion defense)
  } catch {
    return null;
  }

  // Revoked via logout
  if (payload.jti) {
    const denied = await redis.getOrThrow(`denylist:${payload.jti}`);
    if (denied) return null;
  }

  // F-12: reject JWTs issued before the last password reset. ms precision via `ims`; legacy tokens
  // fall back to iat*1000 (<= boundary counts as pre-reset — keeps the same-second hole closed).
  const epochStr = await redis.getOrThrow(`session-epoch-ms:${payload.sub}`);
  if (epochStr !== null) {
    const issuedMs = payload.ims ?? (payload.iat !== undefined ? payload.iat * 1000 : undefined);
    if (issuedMs !== undefined && issuedMs <= parseInt(epochStr, 10)) return null;
  }

  return { accountId: payload.sub, jti: payload.jti, tokenExp: payload.exp };
}
