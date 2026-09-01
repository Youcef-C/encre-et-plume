'use client';

// User feedback 2026-09-01 — the « → next » cycling stepper was ambiguous. This is the explicit
// replacement, shared by the revision list and the editor comment cards: every status visible as a
// chip, the current one checked (filled with its status colour), one click to any other.
import { CORRECTION_STATUSES, CORRECTION_STATUS_LABELS, type CorrectionStatus } from '@encre-et-plume/shared';
import { CheckIcon } from '../icons';
import { statusColor } from './shared';

export default function CorrectionStatusControl({
  status,
  busy,
  onChange,
  label,
}: {
  status: CorrectionStatus;
  busy: boolean;
  onChange: (status: CorrectionStatus) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {CORRECTION_STATUSES.map((s) => {
        const selected = s === status;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={busy || selected}
            onClick={() => onChange(s)}
            className="ep-status-chip"
            // Status colours are display semantics (same source as the pill/stripe), not button
            // intents; unselected paint lives on the class so its hover works.
            style={selected ? { background: statusColor(s), borderColor: statusColor(s), color: '#fff' } : undefined}
          >
            {/* U-4 — the "corrigé" check is a pictogram, never the "✓" character. */}
            {s === 'corrige' && <CheckIcon size={10} />}
            {CORRECTION_STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
