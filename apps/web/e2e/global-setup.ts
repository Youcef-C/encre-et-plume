import { execFileSync } from 'child_process';
import * as path from 'path';

export const ACCOUNTS_FILE = path.join(__dirname, '.e2e-accounts.json');
const SEED_SCRIPT = path.join(__dirname, '../../api/prisma/e2e-seed.js');
const FLUSH_CACHE_SCRIPT = path.join(__dirname, '../../api/prisma/e2e-flush-list-cache.js');

export default async function globalSetup() {
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
