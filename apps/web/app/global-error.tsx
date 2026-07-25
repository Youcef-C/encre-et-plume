'use client';

/**
 * Global error boundary — replaces the entire document on an unhandled error.
 * Must include <html><body> because it supersedes layout.tsx.
 * Calls Sentry.captureException (no-op without a DSN).
 */
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
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
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Erreur — Encre &amp; Plume</title>
        <style>{`
          :root { --ink: #16130f; --paper: #f1ece1; --card: #fffefb; --accent: #e8261c; --shadow: #16130f; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Zen Kaku Gothic New', system-ui, sans-serif;
            background-color: #fbfaf6;
            background-image:
              radial-gradient(rgba(22, 19, 15, 0.04) 1.2px, transparent 1.3px),
              radial-gradient(rgba(22, 19, 15, 0.028) 1.2px, transparent 1.3px);
            background-size: 12px 12px, 12px 12px;
            background-position: 0 0, 6px 6px;
            color: var(--ink);
            min-height: 100dvh;
            display: grid;
            place-items: center;
            padding: 1.5rem;
          }
          .error-card {
            background: var(--card);
            border: 3px solid var(--ink);
            border-radius: 8px;
            box-shadow: 5px 5px 0 var(--shadow);
            padding: 2.5rem 2rem;
            max-width: 420px;
            width: 100%;
            text-align: center;
          }
          .error-badge {
            display: inline-block;
            background: var(--accent);
            color: #fff;
            font-family: 'Anton', sans-serif;
            font-size: 0.75rem;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            padding: 0.2rem 0.6rem;
            border-radius: 2px;
            margin-bottom: 1.25rem;
          }
          h1 {
            font-family: 'Anton', sans-serif;
            font-size: clamp(1.5rem, 5vw, 2rem);
            letter-spacing: 0.02em;
            line-height: 1.1;
            margin-bottom: 0.875rem;
          }
          p {
            font-size: 0.9375rem;
            line-height: 1.6;
            color: #4a4239;
            margin-bottom: 1.75rem;
          }
          .retry-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            background: var(--accent);
            color: #fff;
            border: 3px solid var(--ink);
            border-radius: 6px;
            box-shadow: 3px 3px 0 var(--shadow);
            padding: 0.625rem 1.5rem;
            font-family: 'Anton', sans-serif;
            font-size: 0.875rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            cursor: pointer;
            transition: box-shadow 0.08s, transform 0.08s;
            min-height: 44px;
          }
          .retry-btn:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--shadow); }
          .retry-btn:active { transform: translate(1px, 1px); box-shadow: 2px 2px 0 var(--shadow); }
          .retry-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
        `}</style>
      </head>
      <body>
        <div className="error-card" role="main">
          <span className="error-badge" aria-hidden="true">Erreur</span>
          <h1>Une erreur est survenue</h1>
          <p>Une erreur inattendue s&apos;est produite. Veuillez r&eacute;essayer.</p>
          <button className="retry-btn" onClick={reset}>
            R&eacute;essayer
          </button>
        </div>
      </body>
    </html>
  );
}
