import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Replaces the `package.json#prisma` block, which is deprecated in 6.x and removed in Prisma 7 — so
 * this is also a prerequisite for that upgrade.
 *
 * The `dotenv` call is load-bearing, not boilerplate: once a config file exists, Prisma STOPS
 * auto-loading `.env`. Without it every CLI command fails with "Environment variable not found:
 * DATABASE_URL", which is confusing precisely because the variable is sitting right there in the file
 * Prisma used to read. The monorepo keeps a single `.env` at the root, two levels up from here.
 *
 * `override: false` (the default) means a real environment variable still wins, so CI — which injects
 * DATABASE_URL into the job env and ships no `.env` — is unaffected.
 */
loadEnv({ path: path.join(__dirname, '..', '..', '.env') });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    // Was `package.json#prisma.seed`. Run by `prisma migrate reset` / `prisma db seed`.
    seed: 'node prisma/seed.js',
  },
});
