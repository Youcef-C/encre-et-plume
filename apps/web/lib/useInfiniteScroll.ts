'use client';

// DR-12 — auto-load ("infinite scroll") for the "Afficher plus de résultats" load-more controls.
// Observe a sentinel placed just below a paginated list; when it scrolls into view and more pages
// remain (and no load is in flight), fire the same handler the fallback button calls. The button
// stays for no-JS / keyboard users. ponytail: IntersectionObserver, no scroll listeners.
import { useEffect, useRef } from 'react';

/**
 * Returns a ref to attach to a sentinel element rendered just below the list. When it intersects and
 * `hasMore` is true, calls `onLoadMore`; guards against re-firing while a load is in flight.
 */
export function useInfiniteScroll<T extends HTMLElement = HTMLDivElement>(
  onLoadMore: () => void | Promise<void>,
  hasMore: boolean,
) {
  const sentinelRef = useRef<T | null>(null);
  const loadingRef = useRef(false);
  // Keep the latest handler without re-creating the observer each render (loadMore closes over page).
  const cbRef = useRef(onLoadMore);
  cbRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loadingRef.current) return;
      loadingRef.current = true;
      Promise.resolve(cbRef.current()).finally(() => {
        loadingRef.current = false;
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  return sentinelRef;
}
