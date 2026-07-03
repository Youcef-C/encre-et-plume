'use client';

// DR-2 FE-5 — "FILTRES ACTIFS" row. Replica of prototype DÉCOUVRIR lines 557-567.
import type { CatalogQuery } from '@encre-et-plume/shared';
import { EMPTY_FILTERS, activeFilterChips } from '../../lib/catalog';
import { XIcon } from '../icons';

export default function ActiveFilters({
  filters,
  onChange,
}: {
  filters: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
}) {
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginBottom: 20 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>FILTRES ACTIFS :</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-label={chip.ariaLabel}
          onClick={() => onChange({ ...chip.remove(filters), page: 1 })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 700,
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: 'none',
            borderRadius: 5,
            padding: '3px 9px',
            cursor: 'pointer',
          }}
        >
          {chip.label}
          <XIcon size={11} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        Tout effacer
      </button>
    </div>
  );
}
