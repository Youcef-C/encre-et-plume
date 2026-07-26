/**
 * Next.js 15 browser instrumentation entry point.
 * Loaded by the framework in the client runtime only.
 * Sentry init is a no-op when NEXT_PUBLIC_SENTRY_DSN is absent.
 */
import * as Sentry from '@sentry/nextjs';
import { initSentryClient } from './lib/sentry';

initSentryClient();

// Required by @sentry/nextjs v10 to instrument client-side navigations — without it the SDK prints
// "ACTION REQUIRED" on every build and App Router route changes produce no transactions. Safe when
// Sentry never initialised (no DSN): with no active client the hook is a no-op.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
