/**
 * Sentry client-side helper.
 * Exported `initSentryClient()` is a no-op when NEXT_PUBLIC_SENTRY_DSN is absent
 * so CI/local need no Sentry account.
 */
import * as Sentry from '@sentry/nextjs';

// Mirror the backend redact() denylist so PII never reaches Sentry payloads.
const DENYLIST = new Set([
  'password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken',
  'authorization', 'cookie', 'set-cookie', 'secret', 'email', 'card', 'cvc', 'iban',
]);

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = DENYLIST.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}

// ponytail: type as unknown to avoid tight coupling with Sentry internal types across v8 subpackages
export function scrubSentryEvent(event: Record<string, unknown>): Record<string, unknown> | null {
  const req = event.request as Record<string, unknown> | undefined;
  if (req?.headers && typeof req.headers === 'object') {
    req.headers = scrubObject(req.headers as Record<string, unknown>);
  }
  if (req?.cookies) {
    req.cookies = '[REDACTED]';
  }
  if (req?.data && typeof req.data === 'object' && req.data !== null) {
    req.data = scrubObject(req.data as Record<string, unknown>);
  }
  const user = event.user as Record<string, unknown> | undefined;
  if (user?.email) {
    delete user.email; // drop email, keep user.id for Sentry issue grouping
  }
  return event;
}

export function initSentryClient(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // ponytail: no-op without DSN — CI/local require no Sentry account
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    environment: process.env.NODE_ENV,
    // @ts-expect-error — scrubSentryEvent uses Record<string,unknown> which is compatible at runtime
    beforeSend: scrubSentryEvent,
  });
}
