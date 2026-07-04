'use client';

// DR-5 FE-6 — category chip row. Replica of prototype GALERIE lines 599-605: single-select
// toggle buttons, active = accent bg/white, inactive = card bg with accent-soft on hover.
import type { GalleryQuery } from '@encre-et-plume/shared';
import { CATEGORY_CHIPS } from '../../lib/gallery';

export default function CategoryChips({
  filters,
  onChange,
}: {
  filters: GalleryQuery;
  onChange: (next: GalleryQuery) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
      {CATEGORY_CHIPS.map((chip) => {
        const active = filters.category === chip.key;
        return (
          <button
            key={chip.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ ...filters, category: chip.key, page: 1 })}
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
