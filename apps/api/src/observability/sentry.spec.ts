// Mock @sentry/node BEFORE importing sentry.ts
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn(),
}));

import * as Sentry from '@sentry/node';
import { initSentry, isSentryEnabled, redactSentryEvent } from './sentry';

const mockInit = Sentry.init as jest.Mock;

afterEach(() => {
  mockInit.mockClear();
  // reset module-level flag by calling initSentry with no DSN
  delete process.env['SENTRY_DSN'];
  initSentry();
});

describe('initSentry()', () => {
  it('is a NO-OP when SENTRY_DSN is absent', () => {
    delete process.env['SENTRY_DSN'];
    initSentry();
    expect(mockInit).not.toHaveBeenCalled();
    expect(isSentryEnabled()).toBe(false);
  });

  it('inits Sentry when SENTRY_DSN is set', () => {
    process.env['SENTRY_DSN'] = 'https://key@sentry.io/123';
    initSentry();
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://key@sentry.io/123' }));
    expect(isSentryEnabled()).toBe(true);
  });

  it('passes a beforeSend scrub function', () => {
    process.env['SENTRY_DSN'] = 'https://key@sentry.io/123';
    initSentry();
    const callArgs = mockInit.mock.calls[0][0] as { beforeSend?: (e: object) => object | null };
    expect(typeof callArgs.beforeSend).toBe('function');
  });
});

describe('redactSentryEvent()', () => {
  it('strips PII from request headers', () => {
    const event = {
      request: {
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        data: undefined,
        cookies: {},
        query_string: '',
      },
    };
    const result = redactSentryEvent(event as Parameters<typeof redactSentryEvent>[0]);
    expect(result?.request?.headers?.['authorization']).toBe('[REDACTED]');
    expect(result?.request?.headers?.['content-type']).toBe('application/json');
  });

  it('drops user.email but keeps user.id', () => {
    const event = { user: { id: 'user-123', email: 'alice@example.com' } };
    const result = redactSentryEvent(event as Parameters<typeof redactSentryEvent>[0]);
    expect(result?.user?.id).toBe('user-123');
    expect((result?.user as Record<string, unknown>)?.['email']).toBeUndefined();
  });

  it('returns null for null input (pass-through to Sentry)', () => {
    // If the event is already null, redactSentryEvent should return it as-is
    expect(redactSentryEvent(null as unknown as Parameters<typeof redactSentryEvent>[0])).toBeNull();
  });
});
