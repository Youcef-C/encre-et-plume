// DR-5 FE-9 — "Toutes les illustrations" results grid + loading/empty/error states.
// Replica of prototype GALERIE lines 630-645: auto-fill grid, minmax(210px,1fr), gap 16.
// Ponytail: the prototype's "masonry" is this uniform-height CSS auto-fill grid, no JS masonry lib.
import type { GalleryCategoryKey, GalleryIllustrationCard } from '@encre-et-plume/shared';
import GalleryCard from './GalleryCard';

export type GalleryGridState = 'loading' | 'empty' | 'error' | 'ready';

const GRID_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 } as const;

export default function GalleryGrid({
  state,
  items,
  category,
  onReset,
  onRetry,
  onQuickPreview,
}: {
  state: GalleryGridState;
  items: GalleryIllustrationCard[];
  category: GalleryCategoryKey | undefined;
  onReset: () => void;
  onRetry: () => void;
  onQuickPreview: (id: string) => void;
}) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label="Chargement de la galerie…" className="ep-skeleton-delayed" style={GRID_STYLE}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ height: 230, border: '3px solid var(--tone)', background: 'var(--tone)', borderRadius: 8, opacity: 0.5 }} />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert" style={{ padding: '30px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
          Impossible de charger la galerie. Veuillez réessayer.
        </p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (state === 'empty' || items.length === 0) {
    return (
      <div style={{ padding: '30px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 12 }}>
          {category ? 'Aucune illustration dans cette catégorie.' : 'Aucune illustration pour le moment.'}
        </p>
        <button
          type="button"
          onClick={onReset}
          style={{
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Tout voir
        </button>
      </div>
    );
  }

  return (
    <div style={GRID_STYLE} className="ep-gallery-grid">
      {items.map((item) => (
        <GalleryCard key={item.id} illustration={item} onQuickPreview={onQuickPreview} />
      ))}
    </div>
  );
}
