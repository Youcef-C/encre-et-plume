import 'reflect-metadata';
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

  // CORS: web origin only, cookies included (D3)
  const webOrigin = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
  app.enableCors({ origin: webOrigin, credentials: true });

  const port = Number(process.env['API_PORT'] ?? 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

void bootstrap();
