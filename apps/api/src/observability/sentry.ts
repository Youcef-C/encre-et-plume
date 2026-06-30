import * as Sentry from '@sentry/node';
import { redact } from './redaction';

let sentryEnabled = false;

/** Reset for testing — call initSentry() with no DSN env to reset. */
function reset(): void { sentryEnabled = false; }

export function initSentry(): void {
  reset(); // reset first so calling with no DSN always disables
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: process.env['SENTRY_RELEASE'] ?? process.env['npm_package_version'],
    environment: process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: Number(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? 0),
    // Cast: ErrorEvent is a subset of Event; redact operates on the shared shape
    beforeSend: (event) => redactSentryEvent(event as Sentry.Event) as Sentry.ErrorEvent | null,
  });
  sentryEnabled = true;
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

export function redactSentryEvent(event: Sentry.Event | null): Sentry.Event | null {
  if (!event) return null;
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = redact(event.request.headers) as Record<string, string>;
    }
    if (event.request.data) {
      event.request.data = redact(event.request.data) as string;
    }
    if (event.request.cookies) {
      event.request.cookies = redact(event.request.cookies) as Record<string, string>;
    }
  }
  if (event.extra) {
    event.extra = redact(event.extra) as Record<string, unknown>;
  }
  if (event.user) {
    // Drop email; keep id and other safe fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { email: _dropped, ...rest } = event.user as Sentry.User & { email?: string };
    event.user = redact(rest) as Sentry.User;
  }
  return event;
}
