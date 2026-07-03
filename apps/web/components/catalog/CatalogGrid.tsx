// DR-2 FE-6 — 3-col catalog results grid + loading/empty/error states.
import type { CatalogWorkCard } from '@encre-et-plume/shared';
import CatalogCard from './CatalogCard';

export type CatalogGridState = 'loading' | 'empty' | 'error' | 'ready';

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      style={{
        marginTop: 12,
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
      Réinitialiser
    </button>
  );
}

export default function CatalogGrid({
  state,
  items,
  onReset,
  onRetry,
}: {
  state: CatalogGridState;
  items: CatalogWorkCard[];
  onReset: () => void;
  onRetry: () => void;
}) {
  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-label="Chargement du catalogue…"
        className="ep-skeleton-delayed ep-catalog-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 212, border: '3px solid var(--tone)', background: 'var(--tone)', borderRadius: 8, opacity: 0.5 }} />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert" style={{ padding: '30px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
          Impossible de charger le catalogue. Veuillez réessayer.
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
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 12 }}>Aucun résultat pour ces filtres.</p>
        <ResetButton onReset={onReset} />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }} className="ep-catalog-grid">
      {items.map((work) => (
        <CatalogCard key={work.id} work={work} />
      ))}
    </div>
  );
}
