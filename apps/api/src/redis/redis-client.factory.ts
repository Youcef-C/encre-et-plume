import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

/**
 * F-26 — the ONE place this API constructs a Redis connection.
 *
 * Why this file exists: F-23 took three review rounds and two of them were the same bug. ioredis
 * defaults to `enableOfflineQueue: true` and no `commandTimeout`, so during an outage a command is
 * QUEUED awaiting reconnection rather than rejected — every fail-open `.catch()` is then dead code
 * exactly when it is needed, and the caller waits forever. Measured in F-23 round 3 against a closed
 * port: an unconfigured `get()` was still pending after 1 s; the configured one rejected. In
 * production that hung chapter reads and signups and crashed the worker via the idempotency check.
 *
 * There were four construction paths in four files (five, counting the copy-pasted
 * `parseBullmqOpts` in `worker-runner.ts`), three of them subtly different and one the *inverse* of
 * the rest. Nobody holds that in their head while adding a fifth client, so the profiles and the
 * reason each differs live here, together:
 *
 * | Profile  | Used by                          | commandTimeout | maxRetriesPerRequest | Why it differs |
 * |----------|----------------------------------|----------------|----------------------|----------------|
 * | command  | RedisService, QueueService       | 200 ms         | 1                    | Issues no blocking command, and sits on request paths (rate limiter, session denylist, caches). A bounded reject is what makes fail-open real and fail-closed prompt. |
 * | pubsub   | RedisIoAdapter (socket.io)       | **none**       | null                 | `subscribe` is a long-lived blocking command; a command timeout would tear down an idle subscriber socket. Nothing in a request path awaits these (emits are fire-and-forget), so the failure to guard is unbounded buffering, not a hung request. Additionally needs {@link whenRedisReady} before its first subscribe — see below. |
 * | bullmq   | QueueService / WorkerRunner      | n/a            | **null (required)**  | BullMQ refuses any other value on its own connection, and is handed *plain options*, never an ioredis instance — see {@link bullmqConnectionOpts}. |
 *
 * `commandTimeout: 200` is load-bearing (F-23 round 3): a merely slow Redis now converts to 429s on
 * auth, rejected sessions and 503s on 18+ content, where it previously waited. That is the correct
 * direction for fail-closed controls and was decided deliberately. Do not tune this number.
 */
export type RedisProfile = 'command' | 'pubsub';

export const REDIS_PROFILES: Record<RedisProfile, RedisOptions> = {
  command: { commandTimeout: 200, maxRetriesPerRequest: 1, enableOfflineQueue: false },
  pubsub: { enableOfflineQueue: false, maxRetriesPerRequest: null },
};

export function redisUrl(): string {
  return process.env['REDIS_URL'] ?? 'redis://localhost:6379';
}

/**
 * Builds a client for `profile`, with the swallowing `error` listener already attached — without one
 * an outage raises an unhandled `error` event and kills the process. Callers may add their own
 * listener on top (ioredis allows several); `RedisService` does, to log a warning.
 */
export function createRedisClient(profile: RedisProfile, url = redisUrl()): Redis {
  const client = new Redis(url, REDIS_PROFILES[profile]);
  client.on('error', () => {});
  return client;
}

/**
 * BullMQ's own connection, as PLAIN OPTIONS — deliberately not a client. Passing an ioredis instance
 * couples us to BullMQ's bundled ioredis version; BullMQ creates its internal connection from these.
 * `maxRetriesPerRequest: null` is BullMQ's requirement and the inverse of the `command` profile.
 */
export function bullmqConnectionOpts(url = redisUrl()): {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
} {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: Number(u.port) || 6379,
      password: u.password || undefined,
      db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}

/**
 * Resolves once the client's socket is usable, capped at `capMs`.
 *
 * Mandatory before a `pubsub` client's first subscribe. Commit 04c7b67 set
 * `enableOfflineQueue: false` on the socket.io clients — correct for bounding memory, and it made
 * the API fail to boot every time: the adapter psubscribes as soon as socket.io initialises the
 * namespace, ioredis connects asynchronously, and with the offline queue disabled it throws
 * `Stream isn't writeable and enableOfflineQueue options is false` instead of buffering. The process
 * died before `listen()`. The cap keeps an unreachable Redis failing loudly instead of hanging the
 * process with no output.
 */
export function whenRedisReady(client: Redis, capMs = 5_000): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, capMs);
    timer.unref?.();
    client.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Shutdown. With the offline queue disabled, `QUIT` itself rejects while Redis is down, and without
 * the `disconnect()` fallback the socket and its reconnect timer outlive shutdown and hold the
 * process open. This was copy-pasted at three sites before F-26.
 */
export async function closeRedis(client?: Redis): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client.disconnect());
}
