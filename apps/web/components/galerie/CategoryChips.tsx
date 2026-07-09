'use client';

// DR-5 FE-6 — category chip row. Replica of prototype GALERIE lines 599-605: single-select
// toggle buttons, active = accent bg/white, inactive = card bg with accent-soft on hover.
// DR-12 iter2 (FE-8): the trailing "Collections" chip toggles the FE view mode (collectionsMode)
// rather than a GalleryCategoryKey — selecting any other chip clears it (single-active preserved).
import { CATEGORY_CHIPS, COLLECTIONS_CHIP_KEY, type GalerieFilters } from '../../lib/gallery';

export default function CategoryChips({
  filters,
  onChange,
}: {
  filters: GalerieFilters;
  onChange: (next: GalerieFilters) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
      {CATEGORY_CHIPS.map((chip) => {
        const isCollections = chip.key === COLLECTIONS_CHIP_KEY;
        const active = isCollections
          ? !!filters.collectionsMode
          : !filters.collectionsMode && filters.category === chip.key;
        const next: GalerieFilters = isCollections
          ? { ...filters, collectionsMode: true, category: undefined, page: 1 }
          : { ...filters, category: chip.key as GalerieFilters['category'], collectionsMode: false, page: 1 };
        return (
          <button
            key={chip.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(next)}
            className="ep-chip-toggle ep-gallery-chip"
            style={{
              background: active ? 'var(--accent)' : 'var(--card)',
              color: active ? '#fff' : 'inherit',
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
