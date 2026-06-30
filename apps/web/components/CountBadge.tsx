'use client';

// Shared count badge used by Header for Messages, Demandes, Signalements, and Notifications.
// Hidden when count === 0; uses role="img" so aria-label is announced by screen readers.
interface Props {
  count: number;
  label: string;
}

export default function CountBadge({ count, label }: Props) {
  if (count === 0) return null;
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        background: 'var(--accent)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 4px',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {count}
    </span>
  );
}
