/**
 * Worker entrypoint — second bootstrap into the SAME NestJS monolith.
 * Shares all modules/providers (Prisma, Redis, NotificationsService, etc.) — NOT a microservice.
 * Only this file calls WorkerRunner.run(); main.ts (the HTTP server) never starts workers.
 *
 * Run dev:  pnpm --filter @encre-et-plume/api worker
 * Run prod: node dist/worker.js
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ponytail: copy-minimal env bootstrap from main.ts — same find-and-load logic
function findEnv(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
const envPath = findEnv(process.cwd()) ?? findEnv(__dirname);
if (envPath) loadEnv({ path: envPath });
// F-9: init Sentry before NestFactory so job errors are captured
import { initSentry } from './observability/sentry';
initSentry();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WorkerRunner } from './queue/worker-runner';
import { AppLoggerService } from './observability/app-logger.service';

async function bootstrap() {
  // createApplicationContext: no HTTP listener; shares all modules/providers
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLoggerService));
  app.get(WorkerRunner).run();

  // Graceful shutdown: drain in-flight jobs before exit
  const shutdown = async (signal: string) => {
    console.log(`Worker received ${signal}; draining in-flight jobs…`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
