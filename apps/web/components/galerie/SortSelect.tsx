'use client';

// DR-5 FE-7 — sort control. Replica of prototype GALERIE line 607 "Trié par : Tendance ▾".
// On-brand form control rule: OnBrandSelect (never a bare native <select>), auto-applies on
// change (no "Appliquer" button), same convention as FilterSidebar's "Trier" select.
import type { GalleryQuery, GalleryTri } from '@encre-et-plume/shared';
import { GALLERY_TRIS } from '@encre-et-plume/shared';
import { TRI_LABELS } from '../../lib/gallery';
import OnBrandSelect from '../form/OnBrandSelect';

export default function SortSelect({
  filters,
  onChange,
}: {
  filters: GalleryQuery;
  onChange: (next: GalleryQuery) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)', fontWeight: 500 }}>
      <label htmlFor="ep-gallery-tri" style={{ whiteSpace: 'nowrap' }}>
        Trié par :
      </label>
      <OnBrandSelect
        id="ep-gallery-tri"
        value={filters.tri}
        onChange={(e) => onChange({ ...filters, tri: e.target.value as GalleryTri, page: 1 })}
        style={{ width: 'auto' }}
      >
        {GALLERY_TRIS.map((tri) => (
          <option key={tri} value={tri}>
            {TRI_LABELS[tri]}
          </option>
        ))}
      </OnBrandSelect>
    </div>
  );
}
