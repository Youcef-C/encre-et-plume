import { execFileSync } from 'child_process';
import * as path from 'path';

export const ACCOUNTS_FILE = path.join(__dirname, '.e2e-accounts.json');
const SEED_SCRIPT = path.join(__dirname, '../../api/prisma/e2e-seed.js');
const DEV_SEED_SCRIPT = path.join(__dirname, '../../api/prisma/seed.js');
const FLUSH_CACHE_SCRIPT = path.join(__dirname, '../../api/prisma/e2e-flush-list-cache.js');

export default async function globalSetup() {
  // The dev seed owns the persistent `@seed.encre-et-plume.local` fixtures (MC-8 connections, MC-5/6
  // applications, the appels board …) and resets their relations idempotently. The e2e teardown only
  // sweeps `qa_e2e_*` / `deleted+*` accounts, so it never restores them.
  //
  // CI runs this seed as its own workflow step before Playwright, on a fresh Postgres container. Local
  // runs had no equivalent, so the FIRST full suite passed and every later one failed: tests that
  // accept/decline/remove a connection or withdraw an application mutated the fixtures permanently
  // (30 failures traced to exactly that). Running it here makes a local run match CI and be repeatable.
  //
  // Requires `@encre-et-plume/shared/dist` — build before running e2e. That holds by construction:
  // the webServer entries start the built API, which needs the same dist.
  execFileSync('node', [DEV_SEED_SCRIPT], { env: { ...process.env }, stdio: 'inherit' });
  // MC-10 QA finding: gallery/catalog/home/ranking list caches are keyed by query shape only (not DB
  // generation) — a stale hit across repeated local re-runs can carry a previous run's id past a
  // same-run per-viewer filter check. Flush before seeding (fail-open, non-fatal on error).
  execFileSync('node', [FLUSH_CACHE_SCRIPT], { env: { ...process.env }, stdio: 'inherit' });
  // Pass ACCOUNTS_FILE as argv[2] so the seed script writes JSON there directly.
  // Avoids stdout capture (which is fragile in piped/CI environments).
  execFileSync('node', [SEED_SCRIPT, ACCOUNTS_FILE], {
    env: { ...process.env },
    stdio: 'inherit', // seed errors go to console; no stdout capture needed
  });
}
