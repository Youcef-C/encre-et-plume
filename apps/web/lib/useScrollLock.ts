'use client';

// Shared, ref-counted background scroll lock for modals/overlays. Stacked/nested overlays each add
// one to a module-level open-count; the body is locked on the FIRST and only restored on the LAST,
// so closing an inner overlay never unlocks while an outer one is still open. The scrollbar width is
// compensated with body paddingRight to avoid a layout shift when the scrollbar disappears.
import { useEffect } from 'react';

let openCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

function lock() {
  if (typeof document === 'undefined') return;
  if (openCount === 0) {
    const { body } = document;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }
  openCount += 1;
}

function unlock() {
  if (typeof document === 'undefined') return;
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

/** Locks background scroll while mounted. Pass `enabled=false` to opt out (e.g. an overlay that is
 *  always mounted but only visible when open — gate it on the open flag). */
export function useScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    lock();
    return unlock;
  }, [enabled]);
}
