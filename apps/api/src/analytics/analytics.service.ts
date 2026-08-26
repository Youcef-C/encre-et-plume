import { Injectable } from '@nestjs/common';
import type { EventKind } from '@encre-et-plume/shared';
import { RedisService } from '../redis/redis.service';
import { resolveVisitorId } from './visitor-id';

export const BUFFER_KEY = 'analytics:buffer';

/**
 * ponytail: hard ceiling on the buffer. `POST /events` is unauthenticated, so an unbounded list is
 * a way to OOM the Redis that also holds sessions and rate-limit counters. Past the cap the OLDEST
 * entries are dropped — audience data is the one thing in this Redis that is allowed to be lossy.
 * Ceiling: if this trims in normal operation, raise the flush rate before raising the cap.
 */
export const BUFFER_MAX = 100_000;

/** One buffered event, exactly as it is JSON-encoded into the Redis list. */
export interface BufferedEvent {
  kind: EventKind;
  /** ISO string, stamped by the SERVER at ingest — a client may never supply it (D-5). */
  at: string;
  visitorId: string | null;
  accountId: string | null;
  targetType: string | null;
  targetId: string | null;
  path: string | null;
  ref: string | null;
}

/**
 * F-23 — the write-side seam for audience events. Every emitter (the `POST /events` browser beacon,
 * the reader, signup) calls `track()`, which does ONE Redis push and no database work: the request
 * path must never wait on Postgres for a metric, and a Redis outage must never surface as a 500.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly redis: RedisService) {}

  /** Resolve today's rotating visitor id, or `null` (anonymous) when no salt is available. */
  visitorId(ip: string | undefined, userAgent: string | undefined): Promise<string | null> {
    return resolveVisitorId(this.redis, ip, userAgent);
  }

  /** Buffer an event. Fail-open by construction: `rpush` swallows Redis errors and returns 0. */
  async track(event: Partial<BufferedEvent> & { kind: EventKind }): Promise<void> {
    const row: BufferedEvent = {
      kind: event.kind,
      at: new Date().toISOString(), // server-stamped at ingest, not at flush and never by a client
      visitorId: event.visitorId ?? null,
      accountId: event.accountId ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      path: event.path ?? null,
      ref: event.ref ?? null,
    };
    const length = await this.redis.rpush(BUFFER_KEY, JSON.stringify(row));
    if (length > BUFFER_MAX) await this.redis.ltrim(BUFFER_KEY, -BUFFER_MAX, -1);
  }
}
