import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
  // 2 everywhere. Locally this was 0 ("so a real failure surfaces immediately"), which stopped being
  // tenable once the default went parallel: at 3 workers two WS-heavy specs still lose their
  // propagation window occasionally and recover on retry. A genuinely broken test fails all 3
  // attempts — CS4-RT did exactly that at 5 workers — so this absorbs contention without hiding
  // breakage. Watch the "flaky" count: a spec that starts recovering-on-retry is a real signal.
  retries: 2,
  // Serial in CI (1 worker). The suite's two-context realtime tests (CS-4 editor CRDT/presence, MC-11
  // salon, MC-8 contacts) each open 2 WS clients; at 2 workers up to 4 heavy WS clients + editor CRDT
  // traffic saturate the single API instance, so cross-client propagation intermittently misses its
  // window. The job has no timeout-minutes (6h default), so the wall-clock is fine and CI stays exact.
  //
  // Locally 3 (2026-07-26), measured over repeated full runs:
  //   1 worker  → 15.2 min, reliably green
  //   3 workers → ~4.4 min, 0–1 failures per run, a DIFFERENT spec each time   ← chosen
  //   5 workers → ~4.2 min, worse (CS4-RT fails all 3 attempts)
  //
  // 5 buys nothing: the extra contention triggers retries that eat the parallelism, landing at the same
  // wall-clock while being red. 3 is a deliberate speed/noise trade, NOT a green configuration — every
  // failure seen so far passes under `PW_WORKERS=1`, so treat a parallel failure as unconfirmed until
  // you re-run that spec serially.
  //
  // The underlying cause is not the worker count: specs share the seeded fixtures and mutate them
  // (MC-8 contacts request/accept/remove, MC-13 roster, profile F20, the two-context realtime specs),
  // so parallel workers interleave those mutations. The real fix is per-spec fixture isolation
  // (dedicated accounts, as cs10 does) — until then, parallelism is inherently noisy here.
  // CI stays at 1: the contention is real and CI has no time pressure.
  workers: process.env.CI ? 1 : Number(process.env.PW_WORKERS ?? 3),
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
      // the 10/15-min Redis counter across repeated runs. H1: dev-latest token-disclosure
      // endpoints are opt-in only — e2e needs them to read tokens without SMTP.
      env: { DISABLE_RATE_LIMIT: 'true', ENABLE_DEV_AUTH_SEAMS: 'true' },
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
