import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Transpile the shared workspace package (exports raw TS source)
  transpilePackages: ['@encre-et-plume/shared'],
  // Bound the webpack filesystem cache. Left at webpack's defaults it grew to 2.1 GB here, still
  // holding 800 MB of pack files 24 days old: `maxAge` defaults to 60 days and Next does not
  // override it, so on a machine that builds often the cache only ever grows. That is a disk-full
  // risk, and a full disk is how a dev machine actually falls over (macOS also swaps to it).
  // gzip typically cuts the cache several-fold; the cost is a little CPU per build.
  // ponytail: two properties, no plugin. If builds ever get slow, raise maxAge before adding tooling.
  webpack(config) {
    if (config.cache && typeof config.cache === 'object' && config.cache.type === 'filesystem') {
      config.cache.compression = 'gzip';
      config.cache.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days, not webpack's 60
    }
    return config;
  },
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
  // Strip Sentry's debug logging from the bundle so it doesn't clutter CI logs. Was `disableLogger`,
  // which v10 deprecated in favour of this nested option (it still "worked" but printed a deprecation
  // warning on every build, and would silently stop working on the next major).
  webpack: { treeshake: { removeDebugLogging: true } },
});
