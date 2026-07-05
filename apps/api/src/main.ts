import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// Local dev: find and load the nearest .env walking up from cwd, then __dirname (cwd varies between
// `pnpm --filter` and `turbo run dev`). No-op in prod/CI where env is injected; never overrides set vars.
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
// F-9: init Sentry before NestFactory so uncaught bootstrap errors are captured
import { initSentry } from './observability/sentry';
initSentry();
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { AppModule } from './app.module';
import { AppLoggerService } from './observability/app-logger.service';
import { WorkerRunner } from './queue/worker-runner';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLoggerService));

  // H3: security headers (X-Frame-Options, nosniff, HSTS, ...). crossOriginResourcePolicy off —
  // media (S3/CDN URLs) and cross-origin fetches from the web app must keep working.
  app.use(helmet({ crossOriginResourcePolicy: false }));

  // M1: trust proxy set to the EXACT number of hops behind the load balancer — never blanket
  // `true`. Blanket `true` trusts X-Forwarded-For from anywhere, letting any client spoof its
  // apparent IP and collapse/bypass per-IP rate limiting; an explicit hop count only trusts the
  // LB's own hop. Default: 1 hop in production (behind the documented LB), 0 (no proxy) elsewhere;
  // override via TRUST_PROXY_HOPS if the deploy topology adds more hops (e.g. CDN + LB).
  app.getHttpAdapter().getInstance().set(
    'trust proxy',
    Number(process.env['TRUST_PROXY_HOPS'] ?? (process.env['NODE_ENV'] === 'production' ? 1 : 0)),
  );

  // Cookie-based session transport (D2/D3)
  app.use(cookieParser());

  // Input validation at trust boundary — never trust client data
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }));

  // CORS: allow the web app origin(s) with credentials so the httpOnly session cookie flows (D3).
  // Must be the WEB origin (e.g. http://localhost:3000), NOT the API URL. Comma-separated WEB_ORIGIN
  // supports multiple origins (e.g. local + preview deploys).
  const webOrigin = (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // exposedHeaders: let the browser read the F-9 correlation id (x-request-id) so the
  // F-21 bug-report form can attach it as reproduction context.
  app.enableCors({ origin: webOrigin, credentials: true, exposedHeaders: ['x-request-id'] });

  // Local-dev convenience: run the BullMQ job workers IN this API process so `pnpm dev` processes
  // jobs (e.g. F-10 image-processing → Media.status `ready`) without a separate worker. In prod leave
  // WORKER_INLINE unset and run a dedicated worker (`node dist/worker.js`); don't run both at once.
  if (process.env['WORKER_INLINE'] === 'true') {
    app.get(WorkerRunner).run();
    console.log('Job workers running inline (WORKER_INLINE=true)');
  }

  const port = Number(process.env['API_PORT'] ?? 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

void bootstrap();
