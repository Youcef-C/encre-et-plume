import { Injectable } from '@nestjs/common';
import type { PresenceInfo } from '@encre-et-plume/shared';
import { PRESENCE_ONLINE_WINDOW_MS } from '@encre-et-plume/shared';
import { RedisService } from '../redis/redis.service';

/**
 * MC-8 presence — read-only consumer of the F-18 Redis session index (`sessions:<accountId>`,
 * written by SessionGuard.touch). `online` = newest session lastSeen within PRESENCE_ONLINE_WINDOW_MS;
 * `lastSeen` = that newest timestamp or null. Fail-open: a Redis outage reads as "no sessions" (offline)
 * because RedisService.hgetall already swallows errors to {}. MC-9's realtime channel supersedes this.
 */
@Injectable()
export class PresenceService {
  constructor(private readonly redis: RedisService) {}

  async get(userIds: string[]): Promise<Record<string, PresenceInfo>> {
    const now = Date.now();
    const out: Record<string, PresenceInfo> = {};
    // ponytail: N hgetall calls (userIds capped at 100 by the controller) — pipeline if it ever matters.
    await Promise.all(
      userIds.map(async (id) => {
        const raw = await this.redis.hgetall(`sessions:${id}`);
        let newest = 0;
        for (const json of Object.values(raw)) {
          try {
            const t = new Date((JSON.parse(json) as { lastSeenAt: string }).lastSeenAt).getTime();
            if (Number.isFinite(t) && t > newest) newest = t;
          } catch {
            // ignore malformed entry
          }
        }
        out[id] =
          newest === 0
            ? { online: false, lastSeen: null }
            : { online: newest >= now - PRESENCE_ONLINE_WINDOW_MS, lastSeen: new Date(newest).toISOString() };
      }),
    );
    return out;
  }
}
