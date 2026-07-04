'use client';

// DR-5 FE-8 — "Tendances cette semaine" feature pair. Replica of prototype GALERIE lines 610-628:
// heading with FlameIcon + a 1.4fr/1fr pair of 360px feature cards (rank 1 accent badge + "Voir →",
// rank 2 gold badge). Both cards carry the eye quick-preview button (Round 2 fix — rank #1 was
// missing it). Stacks to one column <=768px (ep-gallery-trending).
import Link from 'next/link';
import type { GalleryFeatureCard } from '@encre-et-plume/shared';
import { formatLikeCount } from '../../lib/home';
import { coverStyle } from '../../lib/cover';
import { FlameIcon, EyeIcon } from '../icons';

function FeatureCard({ item, onQuickPreview }: { item: GalleryFeatureCard; onQuickPreview: (id: string) => void }) {
  const badgeBg = item.rank === 1 ? 'var(--accent)' : '#e8b21c';
  const badgeColor = item.rank === 1 ? '#fff' : 'var(--ink)';

  return (
    <div style={{ position: 'relative' }}>
      {/* The rank-2 eye button is a sibling of the Link (not nested inside it) — a <button>
          nested inside an <a> is invalid HTML and breaks keyboard/AT behavior. */}
      <Link
        href={`/illustration/${item.id}`}
        style={{
          position: 'relative',
          height: 360,
          border: '3px solid var(--ink)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '6px 6px 0 var(--shadow)',
          display: 'block',
          color: 'inherit',
          textDecoration: 'none',
          ...coverStyle(item.id, item.thumbnail),
        }}
        role="img"
        aria-label={item.title}
      >
        <span
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 2,
            fontSize: 11,
            fontWeight: 700,
            background: badgeBg,
            color: badgeColor,
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '3px 11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <FlameIcon size={11} /> TENDANCE #{item.rank}
        </span>

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2,
            padding: '18px 18px 16px',
            background: 'linear-gradient(to top, rgba(22,19,15,.9), rgba(22,19,15,0))',
            color: 'var(--paper)',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, textTransform: 'uppercase', lineHeight: 1 }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 7, fontSize: 13 }}>
            <span>
              par <b>{item.artistName}</b>
            </span>
            <span style={{ color: '#e8b21c' }} aria-label={`${formatLikeCount(item.likeCount)} j'aime`}>
              ♥ {formatLikeCount(item.likeCount)}
            </span>
            <span style={{ opacity: 0.8 }}>· {item.categoryLabel}</span>
            {item.rank === 1 && <span style={{ marginLeft: 'auto', fontWeight: 700 }}>Voir →</span>}
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onQuickPreview(item.id)}
        title="Aperçu rapide"
        aria-label={`Aperçu rapide de ${item.title}`}
        className="ep-gallery-eye"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 3,
          width: 30,
          height: 30,
          borderRadius: 6,
          border: '2px solid var(--ink)',
          background: 'var(--card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '2px 2px 0 var(--shadow)',
        }}
      >
        <EyeIcon size={15} />
      </button>
    </div>
  );
}

export default function TrendingFeature({
  items,
  onQuickPreview,
}: {
  items: GalleryFeatureCard[];
  onQuickPreview: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <FlameIcon size={20} /> Tendances cette semaine
        </span>
      </div>
      <div className="ep-gallery-trending" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        {items.map((item) => (
          <FeatureCard key={item.id} item={item} onQuickPreview={onQuickPreview} />
        ))}
      </div>
    </div>
  );
}
