// DR-1 — "Populaires à chaud · cette semaine" grid. Replica of prototype ACCUEIL lines 424-443.
import Link from 'next/link';
import type { TrendingWork } from '@encre-et-plume/shared';
import { formatLikeCount, growthLabel } from '../lib/home';
import { HeartIcon } from './icons';

function coverGradient(seed: number): React.CSSProperties {
  const angles = [125, 215, 60, 150];
  const dark = seed % 3 === 2;
  return {
    backgroundColor: dark ? 'var(--ink)' : 'var(--accent)',
    backgroundImage: `radial-gradient(rgba(${dark ? '255,255,255,.16' : '22,19,15,.5'}) 1.6px,transparent 1.7px), linear-gradient(${angles[seed % angles.length]}deg, ${dark ? 'var(--accent) 36%,var(--ink) 36%' : 'var(--ink) 42%,var(--accent) 42%'})`,
    backgroundSize: 'var(--dot) var(--dot), cover',
  };
}

export default function TrendingGrid({ items }: { items: TrendingWork[] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 18px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 32, textTransform: 'uppercase', margin: 0 }}>Populaires à chaud</h2>
        <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5 }}>
          cette semaine
        </span>
        <Link href="/classement" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
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
                style={{
                  position: 'relative',
                  height: 290,
                  border: '3px solid var(--ink)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '5px 5px 0 var(--shadow)',
                  ...coverGradient(item.rank - 1),
                }}
              >
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
