import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Transpile the shared workspace package (exports raw TS source)
  transpilePackages: ['@encre-et-plume/shared'],
};

// ponytail: withSentryConfig wraps the config for source-map upload + Sentry build plugins.
// Upload is a no-op without SENTRY_AUTH_TOKEN (CI/local don't need a Sentry account).
export default withSentryConfig(nextConfig, {
  silent: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Suppress Sentry build output so it doesn't clutter CI logs
  disableLogger: true,
});
