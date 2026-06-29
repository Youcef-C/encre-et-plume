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
