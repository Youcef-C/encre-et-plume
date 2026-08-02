'use client';

// MC-10 — shared "⋯" overflow menu (profile actions, DM thread header, review rows). Popover styled
// like the ContactsClient row menu: ink border, card bg, hard offset shadow; closes on outside click
// or Esc. `label` names the target user for a11y (aria-label on both the trigger and the menu).
//
// MC-15 R2-B: the anchoring + dismissal live in `useAnchoredPopover` so the « qui a aimé » list can
// reuse it verbatim instead of hand-rolling a fourth popover. This component keeps the MENU idiom.
import { useState } from 'react';
import { anchoredPanelStyle, useAnchoredPopover } from './useAnchoredPopover';

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
  /**
   * 'below' hangs under the trigger (default); 'left' / 'right' are side flyouts glued to that edge
   * of the trigger. Chat bubbles pick the side that points toward the middle of the thread (R3-1).
   */
  placement = 'below',
  children,
}: {
  label: string;
  triggerStyle?: React.CSSProperties;
  width?: number;
  placement?: 'below' | 'left' | 'right';
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /** Escape and picking an item put focus back where it came from; an outside click never steals it. */
  const { rootRef, triggerRef, panelRef, pos } = useAnchoredPopover(
    open,
    (restoreFocus) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    { width, placement },
  );
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
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
        <div ref={panelRef} role="menu" aria-label={label} style={anchoredPanelStyle(pos, width)}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
