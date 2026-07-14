'use client';

// Shared, ref-counted background scroll lock for modals/overlays. Stacked/nested overlays each add
// one to a module-level open-count; the body is locked on the FIRST and only restored on the LAST,
// so closing an inner overlay never unlocks while an outer one is still open. No scrollbar-width
// compensation here: `html { scrollbar-gutter: stable }` (globals.css) permanently reserves the
// gutter, so toggling body overflow shifts nothing — adding paddingRight would itself cause a shift.
import { useEffect } from 'react';

let openCount = 0;
let savedOverflow = '';

function lock() {
  if (typeof document === 'undefined') return;
  if (openCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openCount += 1;
}

function unlock() {
  if (typeof document === 'undefined') return;
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) {
    document.body.style.overflow = savedOverflow;
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
