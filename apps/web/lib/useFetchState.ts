'use client';

// DR-14 — the one shared load state machine. Every surface used to hand-roll
// `useState<'loading'|'ready'|'empty'|'error'>` + a `useEffect` with a `cancelled` flag and a
// `retryKey`; the red « Impossible de charger… » block existed ~12 times because that code existed
// ~12 times.
//
// The behaviour change lives HERE and nowhere else: on a TRANSIENT failure `state` stays 'loading',
// so the caller keeps rendering the skeleton it already renders, and the loop retries on its own.
// `state` only becomes 'error' on a TERMINAL failure (404 → « introuvable », 401 → connexion,
// 403 → barrière) where retrying would change nothing.
//
// ponytail: the retries are UNLIMITED and the toast is UNIQUE — no attempt cap, no stack, no
// per-surface queue. The ceiling is deliberate: a permanently-down API shows a skeleton plus a toast
// forever rather than a red screen. If distinct simultaneous failures ever have to be told apart,
// `lib/toastBus.ts` is where the queue goes; nothing here changes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { beginTransientFailure } from './toastBus';

export type FetchState = 'loading' | 'ready' | 'error';

/**
 * A local edit layered over a fetched value, for the screens that used to own their data in a
 * `useState` and mutate it (an avatar swap, an optimistic remove, a saved form). The override is
 * dropped the moment the base changes, so a refetch always wins over a stale edit.
 */
export function useOverride<T>(base: T): [T, (update: React.SetStateAction<T>) => void] {
  const [override, setOverride] = useState<{ base: T; value: T } | null>(null);
  const value = override && override.base === base ? override.value : base;
  // The setter resolves the update inside `setOverride` — against the LATEST committed value, not
  // the one captured at render. An optimistic edit and the rollback in its rejected promise are
  // issued from the same closure; resolving against the render-time value loses the first one.
  const baseRef = useRef(base);
  baseRef.current = base;
  const set = useCallback((update: React.SetStateAction<T>) => {
    setOverride((prev) => {
      const current = prev && prev.base === baseRef.current ? prev.value : baseRef.current;
      return {
        base: baseRef.current,
        value: typeof update === 'function' ? (update as (p: T) => T)(current) : update,
      };
    });
  }, []);
  return [value, set];
}

export interface FetchResult<T> {
  /** 'loading' for the whole transient retry loop; 'error' only on a terminal failure. */
  state: FetchState;
  data: T | null;
  /** Set only on a terminal failure — shape untouched, callers still read `.statusCode`. */
  error: unknown | null;
  /** Manual re-arm, for the terminal red block's « Réessayer ». */
  retry: () => void;
}

/** ~0,5 s · 1 s · 2 s · 4 s · 8 s · 16 s then 30 s in a loop (the last value repeats). */
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 16_000, 30_000];

/**
 * Transient = worth retrying. Reuses `lib/apiError.ts`'s discriminant (`typeof statusCode ===
 * 'number'`) rather than writing a second one: a transport failure rejects with a `TypeError` that
 * carries no `statusCode` at all.
 */
function isTransient(e: unknown): boolean {
  const status = (e as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status !== 'number') return true;
  return status === 408 || status === 429 || status >= 500;
}

/** The platform's own signals: never burn a request while hidden or offline. */
function canAttempt(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

export function useFetchState<T>(fetcher: () => Promise<T>, deps: unknown[]): FetchResult<T> {
  const [result, setResult] = useState<Omit<FetchResult<T>, 'retry'>>({
    state: 'loading',
    data: null,
    error: null,
  });
  const [arm, setArm] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const retry = useCallback(() => setArm((a) => a + 1), []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let settled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let clearFromBus: (() => void) | null = null;

    const dropBusEntry = () => {
      clearFromBus?.();
      clearFromBus = null;
    };

    setResult((prev) =>
      prev.state === 'loading' && prev.data === null && prev.error === null
        ? prev
        : { state: 'loading', data: null, error: null },
    );

    const run = async () => {
      if (cancelled || settled || inFlight || !canAttempt()) return;
      inFlight = true;
      try {
        const data = await fetcherRef.current();
        if (cancelled) return;
        settled = true;
        dropBusEntry();
        setResult({ state: 'ready', data, error: null });
      } catch (e) {
        if (cancelled) return;
        if (!isTransient(e)) {
          settled = true;
          dropBusEntry();
          setResult({ state: 'error', data: null, error: e });
          return;
        }
        failures += 1;
        // The toast only appears once the first RE-try has also failed — a single hiccup stays
        // invisible (F9).
        if (failures >= 2 && !clearFromBus) clearFromBus = beginTransientFailure(wake);
        timer = setTimeout(
          run,
          BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)] * (0.8 + Math.random() * 0.4),
        );
      } finally {
        inFlight = false;
      }
    };

    // `online` / `visibilitychange` mean "try right now" — don't sit on a 30 s timer that was
    // scheduled while the tab was hidden.
    function wake() {
      if (cancelled || settled || inFlight || !canAttempt()) return;
      clearTimeout(timer);
      void run();
    }

    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    void run();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      dropBusEntry();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, arm]);

  return { ...result, retry };
}
