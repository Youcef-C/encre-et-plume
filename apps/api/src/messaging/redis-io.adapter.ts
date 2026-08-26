import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions, Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import { closeRedis, createRedisClient, whenRedisReady } from '../redis/redis-client.factory';

/**
 * MC-9 hard constraint: the socket.io gateway MUST use the Redis adapter so realtime fans out across N
 * stateless API instances. Two ioredis clients (pub + sub) feed @socket.io/redis-adapter. Wired in
 * main.ts via app.useWebSocketAdapter(new RedisIoAdapter(app)) BEFORE app.listen. Never wired in
 * worker.ts (createApplicationContext has no HTTP server — the gateway never binds there).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  async connectToRedis(): Promise<void> {
    // F-26: the `pubsub` profile — offline queue bounded, and deliberately NO `commandTimeout`.
    // The reason it differs from the `command` profile lives in the factory's table.
    this.pubClient = createRedisClient('pubsub');
    this.subClient = this.pubClient.duplicate(); // inherits the profile
    // duplicate() does not inherit listeners: re-attach the swallow so a transient Redis error is
    // fail-open here (surfaced by the F-9 readiness probe) instead of crashing the process.
    this.subClient.on('error', () => {});
    // The adapter psubscribes as soon as socket.io initialises the namespace, and
    // `enableOfflineQueue: false` makes that throw unless the socket is already up — this wait is
    // what keeps the API reaching `listen()` (commit 04c7b67). Capped at 5 s.
    await Promise.all([whenRedisReady(this.pubClient), whenRedisReady(this.subClient)]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  /** Quit both Redis clients so Jest/e2e teardown stays clean (no dangling connections). */
  async close(): Promise<void> {
    await closeRedis(this.pubClient);
    await closeRedis(this.subClient);
  }
}
