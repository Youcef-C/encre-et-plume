'use client';

// MC-15 R2-B — the anchoring OverflowMenu hardened in CS-8 round 3, extracted so a second popover
// (the « qui a aimé » list) inherits it instead of hand-rolling a fourth one.
//
// A floating layer must escape EVERY ancestor's overflow: a scrolling message log, a bordered card
// and an `overflow:hidden` dock all clip a `position:absolute` panel (CS-8's Discussion log did
// exactly that). Two native mechanisms, no library — the **top layer** via the `popover` attribute
// where it exists, and `position:fixed` coordinates measured from the trigger everywhere else.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type AnchorPlacement = 'below' | 'left' | 'right';

export function useAnchoredPopover(
  open: boolean,
  /** Called on Escape (restoreFocus: true) and on an outside click (false — never steal focus). */
  dismiss: (restoreFocus: boolean) => void,
  { width, placement = 'below' }: { width: number; placement?: AnchorPlacement },
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      const h = panelRef.current?.offsetHeight ?? 0;
      /**
       * ONE clamp, both axes, applied to whatever the branches below propose (R3-0/REG-1): the CS-8
       * round-2 code clamped Y inside the 'left' branch only, so the default 'below' branch painted
       * off-screen for a trigger near the bottom edge. Every placement goes through this last line.
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
              // Not enough room below for the WHOLE panel, but room above? Hang it above the trigger
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
    const panel = panelRef.current;
    // Feature-detected imperatively (never in JSX): the attribute must not differ between the SSR
    // markup and the first client render.
    if (panel && typeof panel.showPopover === 'function') {
      panel.setAttribute('popover', 'manual'); // 'manual', not 'auto': dismissal stays ours (below)
      panel.showPopover();
    }
    // The trigger moves under the panel when anything scrolls (capture: inner scrollers too).
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, width, placement]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) dismiss(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // `dismiss` is re-created per render by both callers; depending on it would tear the listeners
    // down every keystroke. `open` is the only state that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { rootRef, triggerRef, panelRef, pos };
}

/** The shared panel skin: card fill, ink border, hard offset shadow, above every ancestor. */
export function anchoredPanelStyle(
  pos: { top: number; left: number },
  width: number,
): React.CSSProperties {
  return {
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
  };
}
