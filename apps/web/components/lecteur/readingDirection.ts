// DR-4 delta — per-work reading direction ("Sens de lecture") + browser-local persistence.
// FE-only: derived from Work.format, overridable by the reader, remembered per work on the device.
export type ReadingDirection = 'ltr' | 'rtl';

const storageKey = (slug: string) => `ep:reading-direction:${slug}`;

/** Manga-style formats read right-to-left by default; prose (Roman) and everything else read LTR. */
export function defaultDirectionForFormat(format: string | undefined): ReadingDirection {
  return format === 'Manga' || format === 'One-shot' ? 'rtl' : 'ltr';
}

export function readStoredDirection(slug: string): ReadingDirection | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(storageKey(slug));
  return v === 'ltr' || v === 'rtl' ? v : null;
}

export function writeStoredDirection(slug: string, direction: ReadingDirection): void {
  if (typeof window === 'undefined') return;
  // ponytail: per-device localStorage, no cross-device roaming. Upgrade path: mirror into
  // accounts/me/preferences if roaming is ever requested (anonymous readers still need this key).
  try {
    window.localStorage.setItem(storageKey(slug), direction);
  } catch {
    // Private mode / storage disabled — the choice just isn't remembered; not fatal.
  }
}
