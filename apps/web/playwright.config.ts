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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the real stack for e2e: the NestJS API (3001) and the Next.js web app (3000).
  // Locally a dev server already on those ports is reused; in CI both start fresh.
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
  ],
});
