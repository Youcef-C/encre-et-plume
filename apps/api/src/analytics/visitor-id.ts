import { createHash, randomBytes } from 'node:crypto'; // stdlib — no dep
import type { RedisService } from '../redis/redis.service';

/** 24h — the salt expires on its own even if nothing ever reads it again. */
const SALT_TTL_S = 86_400;

/**
 * F-23 B6 — the rotating cookieless visitor identifier.
 *
 * `visitorId = uuid_from(sha256(daily_salt ‖ ip ‖ user-agent))`. The IP is hashed, never stored,
 * and the salt lives ONLY in Redis with a 24h TTL: at midnight a new salt makes yesterday's id
 * unreachable, which is precisely what keeps the measurement inside the CNIL "strictement limitée"
 * exemption (no cookie, no persistent identifier, no cross-day cohort).
 *
 * There is deliberately NO fallback salt. A constant salt would be a stable cross-day identifier —
 * the exact thing the exemption forbids — so a Redis outage yields `null` and the event is recorded
 * anonymously instead.
 */
export function dailySaltKey(now: Date): string {
  return `analytics:salt:${now.toISOString().slice(0, 10)}`; // UTC day
}

/** Get today's salt, creating it if we are the first request of the day. `null` = Redis unavailable. */
async function dailySalt(redis: RedisService, now: Date): Promise<string | null> {
  const key = dailySaltKey(now);
  const existing = await redis.get(key);
  if (existing) return existing;

  const fresh = randomBytes(32).toString('hex');
  if (await redis.setNx(key, fresh, SALT_TTL_S)) return fresh;
  // Another instance won the race (or Redis is down) — read whoever's salt landed.
  return redis.get(key);
}

/** First 16 bytes of the digest, formatted as a RFC 9562 version-8 (custom) UUID. */
function toUuid(digest: Buffer): string {
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x80; // version 8 — "custom", which is exactly what this is
  b[8] = (b[8] & 0x3f) | 0x80; // RFC variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function resolveVisitorId(
  redis: RedisService,
  ip: string | undefined,
  userAgent: string | undefined,
  now: Date = new Date(),
): Promise<string | null> {
  if (!ip) return null;
  const salt = await dailySalt(redis, now);
  if (!salt) return null; // no salt → anonymous. NEVER a fixed-salt fallback.

  // \0 separators so ("a","bc") and ("ab","c") cannot collide.
  const digest = createHash('sha256').update(`${salt}\0${ip}\0${userAgent ?? ''}`).digest();
  return toUuid(digest);
}
