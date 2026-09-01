// DR-1 — "Populaires à chaud · cette semaine" grid. Replica of prototype ACCUEIL lines 424-443.
'use client';

import Link from 'next/link';
import type { TrendingWork } from '@encre-et-plume/shared';
import { formatLikeCount, growthLabel } from '../lib/home';
import { coverStyle } from '../lib/cover';
import { useSession } from '../lib/session';
import { useAgeCleared } from '../lib/ageGate';
import { HeartIcon } from './icons';
import Cover18Overlay from './age/Cover18Overlay';

export default function TrendingGrid({ items }: { items: TrendingWork[] }) {
  const { account } = useSession();
  const cleared = useAgeCleared(account);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 18px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 32, textTransform: 'uppercase', margin: 0 }}>Populaires à chaud</h2>
        <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5 }}>
          cette semaine
        </span>
        {/* "Populaires à chaud" → catalogue (default sort is 'populaires'), not the all-time ranking. */}
        <Link href="/decouvrir" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
          Tout voir →
        </Link>
      </div>

      {items.length === 0 ? (
        <p style={{ color: 'var(--ink2)', fontSize: 14, padding: '16px 0' }}>Aucune tendance cette semaine.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4,1fr)',
            gap: 20,
          }}
          className="ep-trending-grid"
        >
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/oeuvre/${item.slug}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <div
                data-testid="trending-cover"
                style={{
                  position: 'relative',
                  height: 290,
                  border: '3px solid var(--ink)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '5px 5px 0 var(--shadow)',
                  // Feedback 2026-09-01 — the REAL cover when the work has one; the shared
                  // halftone placeholder (lib/cover) only as the no-cover fallback.
                  ...coverStyle(item.id, item.cover),
                }}
              >
                <Cover18Overlay is18plus={item.is18plus} cleared={cleared} label="Œuvre 18+" />
                <span
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--card)',
                    border: '3px solid var(--ink)',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: 20,
                  }}
                >
                  {item.rank}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                {item.genre} ·{' '}
                <span
                  aria-label={`${formatLikeCount(item.likeCount)} j'aime`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}
                >
                  <HeartIcon size={12} style={{ color: 'var(--accent)' }} />
                  {formatLikeCount(item.likeCount)}
                </span>
                {' '}· {growthLabel(item.growthPct)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
