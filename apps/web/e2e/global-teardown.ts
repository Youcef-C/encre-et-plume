import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ACCOUNTS_FILE = path.join(__dirname, '.e2e-accounts.json');
const TEARDOWN_SCRIPT = path.join(__dirname, '../../api/prisma/e2e-teardown.js');

export default async function globalTeardown() {
  try {
    execFileSync('node', [TEARDOWN_SCRIPT], {
      env: { ...process.env },
      stdio: 'inherit',
    });
  } catch (err) {
    // Non-fatal: rows may already be gone (re-run scenario). Log and continue.
    console.warn('[globalTeardown] e2e-teardown.js error (non-fatal):', err);
  }
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      fs.unlinkSync(ACCOUNTS_FILE);
    }
  } catch (err) {
    console.warn('[globalTeardown] Could not remove accounts file:', err);
  }
}
