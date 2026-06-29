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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // ponytail: resolve shared pkg to its TS source directly (no build step)
      '@encre-et-plume/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
