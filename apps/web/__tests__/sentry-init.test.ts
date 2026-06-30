import { describe, it, expect, vi, afterEach } from 'vitest';

// vi.hoisted ensures the fn exists before the hoisted vi.mock factory runs
const { mockInit } = vi.hoisted(() => ({ mockInit: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
  init: mockInit,
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  withSentryConfig: (cfg: unknown) => cfg,
}));

import { initSentryClient } from '../lib/sentry';

describe('Sentry client init — env-gated', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    if (ORIGINAL !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = ORIGINAL;
    } else {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    }
    vi.clearAllMocks();
  });

  it('is a no-op when NEXT_PUBLIC_SENTRY_DSN is absent', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    initSentryClient();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the DSN when NEXT_PUBLIC_SENTRY_DSN is set', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://key@sentry.io/1';
    initSentryClient();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@sentry.io/1' })
    );
  });

  it('beforeSend in init scrubs email from user and keeps user.id', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://key@sentry.io/1';
    initSentryClient();
    const { beforeSend } = mockInit.mock.calls[0][0] as {
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown> | null;
    };
    const scrubbed = beforeSend({ user: { id: 'u1', email: 'test@example.com' } });
    expect((scrubbed as { user: Record<string, unknown> }).user.email).toBeUndefined();
    expect((scrubbed as { user: Record<string, unknown> }).user.id).toBe('u1');
  });
});
