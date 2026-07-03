// DR-3 FE-5 — Illustrations & planches grid. Replica of ŒUVRE lines 901-909.
// Hidden entirely when the planches array is empty (AC-F7/F14).
import Link from 'next/link';
import type { PlancheDto } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';

export default function PlancheGrid({ planches }: { planches: PlancheDto[] }) {
  if (planches.length === 0) return null;

  return (
    <div>
      <h2 style={{ fontSize: 24, textTransform: 'uppercase', margin: '0 0 12px' }}>Illustrations &amp; planches</h2>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 26 }}
        className="ep-planche-grid"
      >
        {planches.map((planche) => (
          <Link
            key={planche.id}
            href={`/illustration/${planche.id}`}
            aria-label={planche.caption ?? 'Planche'}
            style={{
              display: 'block',
              height: 150,
              border: '3px solid var(--ink)',
              borderRadius: 6,
              boxShadow: '3px 3px 0 var(--shadow)',
              overflow: 'hidden',
              ...coverStyle(planche.id, planche.image),
            }}
          />
        ))}
      </div>
    </div>
  );
}
