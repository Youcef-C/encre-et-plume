'use client';

/**
 * Route-segment error boundary (wraps individual route segments, not the root layout).
 * Calls Sentry.captureException (no-op without a DSN).
 */
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40dvh',
        padding: '2rem 1rem',
        textAlign: 'center',
      }}
      aria-live="assertive"
      role="alert"
    >
      <div
        className="ep-card"
        style={{
          padding: '2rem 1.5rem',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-display, Anton, sans-serif)',
            fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
            letterSpacing: '0.02em',
            lineHeight: 1.1,
            marginBottom: '0.75rem',
          }}
        >
          Une erreur est survenue
        </p>
        <p
          style={{
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            color: 'var(--ink2)',
            marginBottom: '1.5rem',
          }}
        >
          Une erreur inattendue s&apos;est produite. Veuillez r&eacute;essayer.
        </p>
        <button
          onClick={reset}
          className="ep-btn-primary"
          style={{
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            minHeight: '44px',
          }}
        >
          R&eacute;essayer
        </button>
      </div>
    </section>
  );
}
