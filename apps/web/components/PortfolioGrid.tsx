'use client';

import { useState, useEffect } from 'react';
import type { PortfolioItemResponse } from '@encre-et-plume/shared';
import { getProfilePortfolio } from '../lib/api';

type Props = { slug: string };

// F-5 — 3-column portfolio image grid with loading / empty / error states.
export default function PortfolioGrid({ slug }: Props) {
  const [items, setItems] = useState<PortfolioItemResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    getProfilePortfolio(slug)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

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
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" style={{ color: 'var(--accent)', fontSize: 14, padding: '16px 0' }}>
        Impossible de charger le portfolio. Veuillez réessayer.
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
