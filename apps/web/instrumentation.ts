/**
 * Next.js 15 server/edge instrumentation entry point.
 * `register()` is called once per server process start by the framework.
 * Sentry init is a no-op when neither NEXT_PUBLIC_SENTRY_DSN nor SENTRY_DSN is set.
 */
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './lib/sentry';

export async function register(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return; // ponytail: no-op without DSN

  Sentry.init({
    dsn,
    release: process.env.SENTRY_RELEASE ?? process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // @ts-expect-error — scrubSentryEvent uses Record<string,unknown> which is compatible at runtime
    beforeSend: scrubSentryEvent,
  });
}

// onRequestError is a no-op if Sentry has no active client (no init without DSN)
export const onRequestError = Sentry.captureRequestError;
