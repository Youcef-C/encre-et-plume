'use client';

// Feedback round 2 (2026-09-01) — the status control is a DROPDOWN (OnBrandSelect), not a row of
// titled chips. Shared by the revision correction rows and the editor comment cards: the trigger
// shows the current status, the popover lists all three, one pick to any other.
import { CORRECTION_STATUSES, CORRECTION_STATUS_LABELS, type CorrectionStatus } from '@encre-et-plume/shared';
import OnBrandSelect from '../form/OnBrandSelect';

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
    <OnBrandSelect
      aria-label={label}
      value={status}
      disabled={busy}
      onChange={(e) => {
        const next = e.target.value as CorrectionStatus;
        if (next !== status) onChange(next);
      }}
      style={{ minWidth: 130 }}
    >
      {CORRECTION_STATUSES.map((s) => (
        <option key={s} value={s}>
          {CORRECTION_STATUS_LABELS[s]}
        </option>
      ))}
    </OnBrandSelect>
  );
}
