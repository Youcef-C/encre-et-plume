import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
// Local dev: load the monorepo-root .env (cwd is apps/api when run via pnpm), then an optional
// apps/api/.env. No-op when absent (prod/CI inject env directly); never overrides already-set vars.
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  app.enableCors({ origin: webOrigin, credentials: true });

  const port = Number(process.env['API_PORT'] ?? 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

void bootstrap();
