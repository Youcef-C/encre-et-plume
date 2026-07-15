import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
    maxWorkers: '25%', // ponytail: cap fork pool so parallel/agent runs don't flood the machine
    // CI retries absorb rare parallel-thread flakes in async-render tests (RTL waitFor on an
    // awareness→state→re-render chain that can miss its default window under CI CPU contention).
    // These pass reliably in isolation; matches the Playwright retries policy. Locally 0.
    retry: process.env.CI ? 2 : 0,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // ponytail: resolve shared pkg to its TS source directly (no build step)
      '@encre-et-plume/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
