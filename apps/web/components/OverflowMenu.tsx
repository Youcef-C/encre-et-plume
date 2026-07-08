'use client';

// MC-10 — shared "⋯" overflow menu (profile actions, DM thread header, review rows). Popover styled
// like the ContactsClient row menu: ink border, card bg, hard offset shadow; closes on outside click
// or Esc. `label` names the target user for a11y (aria-label on both the trigger and the menu).
import { useEffect, useRef, useState } from 'react';

export function MenuItem({
  children,
  onClick,
  accent,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  /** Overrides the visible-text accessible name to include the target user (MC-10 F9/F10). */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="ep-menu-item"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 13px',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
        color: accent ? 'var(--accent)' : 'var(--ink)',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

export default function OverflowMenu({
  label,
  triggerStyle,
  width = 220,
  children,
}: {
  label: string;
  triggerStyle?: React.CSSProperties;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 16,
          lineHeight: 1,
          minWidth: 44,
          minHeight: 44,
          border: '2px solid var(--ink)',
          borderRadius: 6,
          background: 'var(--card)',
          color: 'var(--ink)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          ...triggerStyle,
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 30,
            width,
            background: 'var(--card)',
            border: '3px solid var(--ink)',
            borderRadius: 8,
            boxShadow: '5px 5px 0 var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
