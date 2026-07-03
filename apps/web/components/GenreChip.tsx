'use client';

import { XIcon } from './icons';

// F-20 (round 1b) — shared removable chip, always filled accent red, used
// identically by ProfileTags ("Genres & affinités") and ProfilePageClient's
// "Recherche active" genre picker — no toggle/deselect state, just add/remove.
type Props = { label: string; onRemove: () => void };

export default function GenreChip({ label, onRemove }: Props) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--accent)',
        color: '#fff',
        border: '2px solid var(--ink)',
        borderRadius: 5,
        padding: '4px 8px 4px 12px',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {label}
      <button
        type="button"
        aria-label={`Retirer ${label}`}
        onClick={onRemove}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: 2,
        }}
      >
        <XIcon size={14} />
      </button>
    </span>
  );
}
