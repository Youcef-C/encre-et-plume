import { execFileSync } from 'child_process';
import * as path from 'path';

export const ACCOUNTS_FILE = path.join(__dirname, '.e2e-accounts.json');
const SEED_SCRIPT = path.join(__dirname, '../../api/prisma/e2e-seed.js');

export default async function globalSetup() {
  // Pass ACCOUNTS_FILE as argv[2] so the seed script writes JSON there directly.
  // Avoids stdout capture (which is fragile in piped/CI environments).
  execFileSync('node', [SEED_SCRIPT, ACCOUNTS_FILE], {
    env: { ...process.env },
    stdio: 'inherit', // seed errors go to console; no stdout capture needed
  });
}
