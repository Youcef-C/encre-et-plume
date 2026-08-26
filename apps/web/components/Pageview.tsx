'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { TrackEventRequest } from '@encre-et-plume/shared';

const API =
  (process.env.NEXT_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:3001';

/** The referrer is an acquisition source, so it only means anything on the document's FIRST view. */
function externalReferrer(): string | undefined {
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    // Our own pages are not an acquisition source, and a `dim` for our own host is noise.
    return new URL(ref).host === window.location.host ? undefined : ref;
  } catch {
    return undefined;
  }
}

/**
 * F-23 — the whole browser side of the audience measurement: one fire-and-forget POST per pathname
 * change, and **nothing else**. It reads and writes no cookie, no localStorage, no sessionStorage —
 * which is exactly why art. 82 never applies and why no consent banner gates it. It deliberately
 * does NOT consult `consent.audience` (`lib/cookie-consent.tsx`): the CNIL exemption depends on
 * there being no consent gate, and that flag stays the seam for a future persistent identifier.
 *
 * `fetch(keepalive)` rather than `navigator.sendBeacon`: the API is a separate origin and
 * `sendBeacon` cannot carry credentials cross-origin, so a signed-in visit would lose its account.
 */
export default function Pageview() {
  const pathname = usePathname();
  const firstView = useRef(true);

  useEffect(() => {
    if (!pathname) return;

    const ref = firstView.current ? externalReferrer() : undefined;
    firstView.current = false;

    const body: TrackEventRequest = { kind: 'visit', path: pathname, ...(ref ? { ref } : {}) };
    void fetch(`${API}/events`, {
      method: 'POST',
      keepalive: true, // survives the navigation that triggered it
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // A measurement is never worth an error in the console of a reader's browser.
    });
  }, [pathname]);

  return null;
}
