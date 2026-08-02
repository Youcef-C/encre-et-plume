'use client';

// MC-10 — shared "⋯" overflow menu (profile actions, DM thread header, review rows). Popover styled
// like the ContactsClient row menu: ink border, card bg, hard offset shadow; closes on outside click
// or Esc. `label` names the target user for a11y (aria-label on both the trigger and the menu).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  /**
   * The popover must escape EVERY ancestor's overflow (a scrolling list, a bordered card, a
   * `overflow:hidden` panel all clip an `position:absolute` menu — CS-8's Discussion log did exactly
   * that). Two native mechanisms, no library: the **top layer** via the `popover` attribute where it
   * exists, and `position:fixed` coordinates measured from the trigger everywhere. Fixed alone still
   * beats absolute; the top layer also beats a transformed ancestor and any z-index war.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      const h = menuRef.current?.offsetHeight ?? 0;
      /**
       * ONE clamp, both axes, applied to whatever the branches below propose (R3-0/REG-1): the round-2
       * code clamped Y inside the 'left' branch only, so the default 'below' branch painted off-screen
       * for a trigger near the bottom edge. Every placement now goes through the same last line.
       */
      const clamp = (v: number, size: number, viewport: number) =>
        Math.min(Math.max(8, v), Math.max(8, viewport - size - 8));

      // Side flyout: glued to that edge of the trigger and vertically level with it. With no room on
      // that side (a narrow phone) it falls back to hanging below, never overflowing.
      const fits =
        placement === 'left' ? t.left - width - 6 >= 8 : t.right + width + 6 <= window.innerWidth - 8;
      const raw =
        placement !== 'below' && fits
          ? { top: t.top, left: placement === 'left' ? t.left - width - 6 : t.right + 6 }
          : {
              // Not enough room below for the WHOLE menu, but room above? Hang it above the trigger
              // rather than clamp it over its own row (R3-2).
              top:
                t.bottom + 6 + h > window.innerHeight - 8 && t.top - h - 6 >= 8
                  ? t.top - h - 6
                  : t.bottom + 6,
              left: t.right - width,
            };
      setPos({
        top: clamp(raw.top, h, window.innerHeight),
        left: clamp(raw.left, width, window.innerWidth),
      });
    };
    place();
    const menu = menuRef.current;
    // Feature-detected imperatively (never in JSX): the attribute must not differ between the SSR
    // markup and the first client render.
    if (menu && typeof menu.showPopover === 'function') {
      menu.setAttribute('popover', 'manual'); // 'manual', not 'auto': dismissal stays ours (below)
      menu.showPopover();
    }
    // The trigger moves under the menu when anything scrolls (capture: inner scrollers too).
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, width, placement]);

  /** Escape and picking an item put focus back where it came from; an outside click never steals it. */
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
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
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            right: 'auto',
            bottom: 'auto',
            margin: 0, // the UA's `[popover] { inset:0; margin:auto }` would centre it otherwise
            padding: 0,
            zIndex: 30,
            width,
            background: 'var(--card)',
            border: '3px solid var(--ink)',
            borderRadius: 8,
            boxShadow: '5px 5px 0 var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
