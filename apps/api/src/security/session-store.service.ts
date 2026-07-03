/**
 * BE-2: Redis-backed best-effort session presence index.
 * Key: `sessions:<accountId>` (hash). Field = jti. Value = JSON meta.
 * Honest limits: sessions minted before F-18 ships have no index entry until their next request.
 * No GeoIP dependency (ponytail — YAGNI): ip is stored as-is; FE renders it as approx location.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { SessionSummary } from '@encre-et-plume/shared';
import { SESSION_NOT_FOUND } from '@encre-et-plume/shared';

const SESSION_INDEX_TTL_S = 7 * 24 * 3600; // 7d — max JWT lifetime
const SESSION_INDEX_TTL_MS = SESSION_INDEX_TTL_S * 1000;

interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string; // ISO
  createdAt: string;  // ISO
}

@Injectable()
export class SessionStore {
  constructor(private readonly redis: RedisService) {}

  /**
   * Best-effort: record or refresh a session in the account's session index.
   * Called by SessionGuard after a successful auth check — never blocks auth.
   */
  async touch(accountId: string, jti: string, userAgent: string | null, ip: string | null): Promise<void> {
    const key = `sessions:${accountId}`;
    const now = new Date(Date.now()).toISOString();

    // Preserve createdAt from the existing entry if present
    const existing: Record<string, string> = await this.redis.hgetall(key).catch(() => ({}));
    const existingMeta: Partial<SessionMeta> = existing[jti] ? JSON.parse(existing[jti]) : {};

    const meta: SessionMeta = {
      userAgent,
      ip,
      lastSeenAt: now,
      createdAt: existingMeta.createdAt ?? now,
    };

    await this.redis.hset(key, jti, JSON.stringify(meta));
    await this.redis.expire(key, SESSION_INDEX_TTL_S);
  }

  /** List all active sessions for an account, marking the caller's jti as current. */
  async list(accountId: string, currentJti: string): Promise<SessionSummary[]> {
    const key = `sessions:${accountId}`;
    const raw = await this.redis.hgetall(key);
    const now = Date.now();
    const staleBefore = now - SESSION_INDEX_TTL_MS;
    const staleJtis: string[] = [];

    const sessions: SessionSummary[] = Object.entries(raw)
      .flatMap(([jti, jsonStr]) => {
        try {
          const meta: SessionMeta = JSON.parse(jsonStr);
          if (new Date(meta.lastSeenAt).getTime() < staleBefore) {
            staleJtis.push(jti);
            return [];
          }
          return [{
            id: jti,
            userAgent: meta.userAgent,
            ip: meta.ip,
            lastSeenAt: meta.lastSeenAt,
            createdAt: meta.createdAt,
            current: jti === currentJti,
          }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

    // Lazy cleanup of stale entries (best-effort, fail-open)
    if (staleJtis.length > 0) {
      this.redis.hdel(key, ...staleJtis).catch(() => {});
    }

    return sessions;
  }

  /**
   * Revoke a specific session: denylist the JWT + remove from the index.
   * Throws SESSION_NOT_FOUND if the jti is not in this account's index.
   * `tokenTtlSecs`: remaining TTL of the JWT (for denylist expiry); pass 0 to use default.
   */
  async revoke(accountId: string, jti: string, tokenTtlSecs: number): Promise<void> {
    const key = `sessions:${accountId}`;
    const existing = await this.redis.hgetall(key);
    if (!existing[jti]) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Session introuvable.',
        error: SESSION_NOT_FOUND,
      });
    }

    // Denylist the token
    const ttl = tokenTtlSecs > 0 ? tokenTtlSecs : SESSION_INDEX_TTL_S;
    await this.redis.set(`denylist:${jti}`, '1', 'EX', ttl);
    await this.redis.hdel(key, jti);
    // ponytail: AD-10 ActionLog emit('session_revoked') with ip/userAgent when that service lands
  }

  /**
   * Remove all sessions from the index and add only the new (rotated) jti.
   * Used after "revoke all others" — the current session gets a new jti via rotateOtherSessions.
   */
  async reset(accountId: string, newJti: string, meta: { userAgent: string | null; ip: string | null }): Promise<void> {
    const key = `sessions:${accountId}`;
    // Fetch existing fields to denylist them (best-effort — fail-open)
    const existing = await this.redis.hgetall(key).catch(() => ({}));
    const oldJtis = Object.keys(existing);

    // Denylist old jtis (best-effort, do not block). Never denylist the surviving jti —
    // if the caller passes its own current jti, denylisting it would kill the caller.
    for (const oldJti of oldJtis) {
      if (oldJti === newJti) continue;
      this.redis.set(`denylist:${oldJti}`, '1', 'EX', SESSION_INDEX_TTL_S).catch(() => {});
    }

    // Remove all fields then write only the new jti
    if (oldJtis.length > 0) {
      await this.redis.hdel(key, ...oldJtis);
    }

    const now = new Date(Date.now()).toISOString();
    const newMeta: SessionMeta = {
      userAgent: meta.userAgent,
      ip: meta.ip,
      lastSeenAt: now,
      createdAt: now,
    };
    await this.redis.hset(key, newJti, JSON.stringify(newMeta));
    await this.redis.expire(key, SESSION_INDEX_TTL_S);
  }
}
