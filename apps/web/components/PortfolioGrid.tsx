'use client';

import type { PortfolioItemResponse } from '@encre-et-plume/shared';
import { getProfilePortfolio } from '../lib/api';
import { useFetchState } from '../lib/useFetchState';

type Props = { slug: string };

// F-5 — 3-column portfolio image grid with loading / empty / error states.
export default function PortfolioGrid({ slug }: Props) {
  const feed = useFetchState(() => getProfilePortfolio(slug), [slug]);
  const items = feed.data;
  const loading = feed.state === 'loading';
  const error = feed.state === 'error';

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Chargement du portfolio…"
        className="ep-skeleton-delayed"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              height: 130,
              borderRadius: 6,
              border: '3px solid var(--tone)',
              background: 'var(--tone)',
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  // F16: this block used to offer no way to retry, unlike every sibling error block.
  if (error) {
    return (
      <div role="alert" style={{ textAlign: 'center', padding: '16px 0' }}>
        <p style={{ color: 'var(--accent)', fontSize: 14, marginBottom: 12 }}>
          Impossible de charger le portfolio. Veuillez réessayer.
        </p>
        <button
          type="button"
          onClick={feed.retry}
          className="ep-btn-primary"
          style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <p style={{ color: 'var(--ink2)', fontSize: 14, padding: '16px 0', textAlign: 'center' }}>
        Aucune œuvre pour l&apos;instant.
      </p>
    );
  }

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}
      aria-label="Portfolio"
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            height: 130,
            border: '3px solid var(--ink)',
            borderRadius: 6,
            boxShadow: '3px 3px 0 var(--shadow)',
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--tone)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image}
            alt={item.caption ?? 'Illustration du portfolio'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {item.caption && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(22,19,15,0.72)',
                color: '#fff',
                padding: '4px 8px',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {item.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
