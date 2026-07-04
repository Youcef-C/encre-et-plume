import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Transpile the shared workspace package (exports raw TS source)
  transpilePackages: ['@encre-et-plume/shared'],
  // H3: security headers on every route. No CSP here — the app relies on pervasive inline
  // styles (the prototype-replica design system); a strict CSP would break rendering. Follow-up:
  // introduce a CSP once inline styles are migrated to a nonce/hash-friendly approach.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

// ponytail: withSentryConfig wraps the config for source-map upload + Sentry build plugins.
// Upload is a no-op without SENTRY_AUTH_TOKEN (CI/local don't need a Sentry account).
export default withSentryConfig(nextConfig, {
  silent: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Suppress Sentry build output so it doesn't clutter CI logs
  disableLogger: true,
});
