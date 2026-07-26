import type { CSSProperties, ReactNode } from 'react';
import type { ApplicationStatus } from '@encre-et-plume/shared';
import { CheckIcon, XIcon } from '../icons';

// Shared status badge for MC-6 "Mes candidatures" and MC-7 "Mes appels à projets".
// Mark + text, never color-only (prototype 2162/2168/2174). U-4 rule: the check/cross
// marks are pictograms (icons.tsx), never the "✓"/"✕" characters; the dot stays typography.
const MAP: Record<ApplicationStatus, { mark: ReactNode; label: string; style: CSSProperties }> = {
  pending: {
    mark: null,
    label: '● En attente',
    style: { background: 'var(--card)', color: 'var(--accent)', border: '2px solid var(--accent)' },
  },
  accepted: {
    mark: <CheckIcon size={12} />,
    label: 'Acceptée',
    style: { background: '#1f8a5b', color: '#fff', border: '2px solid var(--ink)' },
  },
  rejected: {
    mark: <XIcon size={12} />,
    label: 'Refusée',
    style: { background: 'var(--card)', color: 'var(--ink2)', border: '2px solid var(--ink2)' },
  },
};

export default function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { mark, label, style } = MAP[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 5,
        padding: '3px 10px',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {mark}
      {label}
    </span>
  );
}
