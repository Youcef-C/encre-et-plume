import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions, Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * MC-9 hard constraint: the socket.io gateway MUST use the Redis adapter so realtime fans out across N
 * stateless API instances. Two ioredis clients (pub + sub) feed @socket.io/redis-adapter. Wired in
 * main.ts via app.useWebSocketAdapter(new RedisIoAdapter(app)) BEFORE app.listen. Never wired in
 * worker.ts (createApplicationContext has no HTTP server — the gateway never binds there).
 */
/** Resolves once the client's socket is usable (ioredis connects asynchronously). */
const whenReady = (client: Redis): Promise<void> =>
  client.status === 'ready' ? Promise.resolve() : new Promise<void>((resolve) => client.once('ready', () => resolve()));

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  async connectToRedis(): Promise<void> {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    // B-4: bound the offline queue so an outage cannot accumulate pub/sub commands in memory.
    // NO `commandTimeout` here, deliberately: `subscribe` is a long-lived blocking command and a
    // command timeout would tear down an idle subscriber socket. Unlike RedisService and the queue
    // client, nothing in a request path awaits these — socket.io emits are fire-and-forget — so the
    // failure mode to guard is unbounded buffering, not a hung request.
    const opts = { enableOfflineQueue: false, maxRetriesPerRequest: null } as const;
    this.pubClient = new Redis(url, opts);
    this.subClient = this.pubClient.duplicate();
    // Fail-open on transient Redis errors — surfaced by the F-9 readiness probe, not by crashing here.
    this.pubClient.on('error', () => {});
    this.subClient.on('error', () => {});
    // The adapter psubscribes as soon as socket.io initialises the namespace, and `enableOfflineQueue:
    // false` makes that throw ("Stream isn't writeable and enableOfflineQueue options is false")
    // unless the socket is already up. ioredis connects asynchronously, so without this wait the API
    // crashes on boot before `listen()`. Capped at 5 s so an unreachable Redis fails the same way it
    // does today instead of hanging the process with no output.
    await Promise.race([
      Promise.all([whenReady(this.pubClient), whenReady(this.subClient)]),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000).unref()),
    ]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  /** Quit both Redis clients so Jest/e2e teardown stays clean (no dangling connections). */
  async close(): Promise<void> {
    await this.pubClient?.quit().catch(() => this.pubClient?.disconnect());
    await this.subClient?.quit().catch(() => this.subClient?.disconnect());
  }
}
