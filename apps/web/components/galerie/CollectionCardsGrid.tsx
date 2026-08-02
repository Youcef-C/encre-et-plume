// DR-12 iter2 (FE-8) — Galerie "Collections" view: browse collection œuvres as cards. Each card is a
// single focusable <Link> to the collection Œuvre page. Same auto-fill grid + loading/empty/error
// grammar as GalleryGrid (Inferred screen — reuses the DR-5 gallery card patterns/tokens).
import Link from 'next/link';
import type { CollectionCard } from '@encre-et-plume/shared';
import { collectionMetaLine } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { formatLikeCount } from '../../lib/home';
import { HeartIcon } from '../icons';

export type CollectionCardsGridState = 'loading' | 'empty' | 'error' | 'ready';

const GRID_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 } as const;

export default function CollectionCardsGrid({
  state,
  items,
  onRetry,
}: {
  state: CollectionCardsGridState;
  items: CollectionCard[];
  onRetry: () => void;
}) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label="Chargement des collections…" className="ep-skeleton-delayed" style={GRID_STYLE}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: 240, border: '3px solid var(--tone)', background: 'var(--tone)', borderRadius: 8, opacity: 0.5 }} />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert" style={{ padding: '30px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
          Impossible de charger les collections. Veuillez réessayer.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="ep-btn-primary"
          style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', padding: '8px 16px', cursor: 'pointer' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (state === 'empty' || items.length === 0) {
    return (
      <div style={{ padding: '30px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Aucune collection</p>
      </div>
    );
  }

  return (
    <div style={GRID_STYLE} className="ep-gallery-grid">
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/oeuvre/${c.slug}`}
          className="ep-gallery-card"
          style={{
            display: 'block',
            border: '3px solid var(--ink)',
            borderRadius: 8,
            boxShadow: '5px 5px 0 var(--shadow)',
            background: 'var(--card)',
            color: 'var(--ink)',
            textDecoration: 'none',
            overflow: 'hidden',
          }}
        >
          <span
            aria-hidden="true"
            style={{ display: 'block', width: '100%', aspectRatio: '3 / 4', borderBottom: '3px solid var(--ink)', ...coverStyle(c.id, c.cover) }}
          />
          <span style={{ display: 'block', padding: '10px 12px' }}>
            <b style={{ display: 'block', fontSize: 15, lineHeight: 1.2, marginBottom: 4 }}>{c.title}</b>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--ink2)', fontWeight: 500, marginBottom: 4 }}>{c.artistName}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
              <span>{collectionMetaLine(c.count)}</span> ·{' '}
              <span
                aria-label={`${formatLikeCount(c.likeCount)} j'aime`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}
              >
                <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
                {formatLikeCount(c.likeCount)}
              </span>
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
