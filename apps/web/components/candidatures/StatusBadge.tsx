import type { CSSProperties } from 'react';
import type { ApplicationStatus } from '@encre-et-plume/shared';

// Shared status badge for MC-6 "Mes candidatures" and MC-7 "Mes appels à projets".
// Text + glyph, never color-only (prototype 2162/2168/2174).
const MAP: Record<ApplicationStatus, { text: string; style: CSSProperties }> = {
  pending: {
    text: '● En attente',
    style: { background: 'var(--card)', color: 'var(--accent)', border: '2px solid var(--accent)' },
  },
  accepted: {
    text: '✓ Acceptée',
    style: { background: '#1f8a5b', color: '#fff', border: '2px solid var(--ink)' },
  },
  rejected: {
    text: '✕ Refusée',
    style: { background: 'var(--card)', color: 'var(--ink2)', border: '2px solid var(--ink2)' },
  },
};

export default function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { text, style } = MAP[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 5, padding: '3px 10px', whiteSpace: 'nowrap', ...style }}>
      {text}
    </span>
  );
}
