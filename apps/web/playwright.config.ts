import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // F-13: pre-seed cookie consent in localStorage so the banner doesn't appear in existing
    // tests. QA's F-13 spec clears this key before testing the banner explicitly.
    storageState: './e2e/storage-state.json',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the real stack for e2e: the NestJS API (3001), the Next.js web app (3000),
  // and the image-processing worker (no HTTP port — Playwright polls until the process
  // starts; we use port 3002 as a dummy sentinel that never binds, so reuseExistingServer
  // must be true locally or we skip the worker check via the command itself).
  // The API reads DATABASE_URL + REDIS_URL from its env (.env locally / the CI job env).
  webServer: [
    {
      command: 'pnpm --filter @encre-et-plume/api start',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      // Disable signup/login rate-limit for e2e so auth.spec.ts doesn't exhaust
      // the 10/15-min Redis counter across repeated runs.
      env: { DISABLE_RATE_LIMIT: 'true' },
    },
    {
      command: 'pnpm --filter @encre-et-plume/web start',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    // F-10: image-processing worker — must run for Media.status to reach 'ready'.
    // The worker has no HTTP port; we mark reuseExistingServer=true so a locally-running
    // worker is reused, and in CI a fresh process is always started (CI=1).
    {
      command: 'pnpm --filter @encre-et-plume/api start:worker',
      // The worker doesn't bind an HTTP port.  Playwright will wait for the process
      // to start and then proceed without a port health-check when `port` is omitted.
      // We set reuseExistingServer=true so local dev doesn't double-start the worker.
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { DISABLE_RATE_LIMIT: 'true' },
    },
  ],
});
