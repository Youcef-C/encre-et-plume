/**
 * Next.js 15 browser instrumentation entry point.
 * Loaded by the framework in the client runtime only.
 * Sentry init is a no-op when NEXT_PUBLIC_SENTRY_DSN is absent.
 */
import { initSentryClient } from './lib/sentry';

initSentryClient();
