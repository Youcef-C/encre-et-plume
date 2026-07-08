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
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  async connectToRedis(): Promise<void> {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.pubClient = new Redis(url);
    this.subClient = this.pubClient.duplicate();
    // Fail-open on transient Redis errors — surfaced by the F-9 readiness probe, not by crashing here.
    this.pubClient.on('error', () => {});
    this.subClient.on('error', () => {});
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  /** Quit both Redis clients so Jest/e2e teardown stays clean (no dangling connections). */
  async close(): Promise<void> {
    await this.pubClient?.quit().catch(() => {});
    await this.subClient?.quit().catch(() => {});
  }
}
