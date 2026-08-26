import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useFetchState, useOverride } from '../lib/useFetchState';
import { getFailingCount } from '../lib/toastBus';

const http = (statusCode: number) => ({ statusCode, message: 'Boom', error: 'ERR' });
const transport = () => new TypeError('Failed to fetch');

/** Advance fake timers AND flush the promise microtasks the retry loop chains on. */
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

let visibility = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, 'onLine', { configurable: true, writable: true, value: true });
  // ±20 % jitter with Math.random() === 0.5 is exactly ×1.0, so the delays are the nominal ones (F4).
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useFetchState (DR-14 FE-1)', () => {
  it('never exposes state "error" for a 500 followed by a success (F1/F11)', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(http(500))
      .mockResolvedValueOnce({ ok: true });
    const seen: string[] = [];

    const { result } = renderHook(() => {
      const r = useFetchState(fetcher, []);
      seen.push(r.state);
      return r;
    });

    await tick(0);
    expect(result.current.state).toBe('loading'); // the skeleton stays

    await tick(500);
    expect(result.current.state).toBe('ready');
    expect(result.current.data).toEqual({ ok: true });
    expect(seen).not.toContain('error');
  });

  it('treats a transport TypeError (no statusCode) as transient (F1/F3)', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(transport()).mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    expect(result.current.state).toBe('loading');
    await tick(500);
    expect(result.current.state).toBe('ready');
  });

  it.each([408, 429, 500, 503])('retries a %i (F1)', async (status) => {
    const fetcher = vi.fn().mockRejectedValue(http(status));
    renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    await tick(500);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('goes to "error" on a 404 at the first attempt, with zero retries (F2)', async () => {
    const fetcher = vi.fn().mockRejectedValue(http(404));
    const { result } = renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    expect(result.current.state).toBe('error');
    expect((result.current.error as { statusCode: number }).statusCode).toBe(404);

    await tick(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 422])('treats a %i as terminal (F2)', async (status) => {
    const fetcher = vi.fn().mockRejectedValue(http(status));
    const { result } = renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    expect(result.current.state).toBe('error');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('follows the backoff sequence 500·1000·2000·4000·8000·16000·30000·30000 (F4)', async () => {
    const fetcher = vi.fn().mockRejectedValue(http(500));
    renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    for (const [i, delay] of [500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000].entries()) {
      await tick(delay - 1);
      expect(fetcher).toHaveBeenCalledTimes(i + 1); // not yet — the delay has not elapsed
      await tick(1);
      expect(fetcher).toHaveBeenCalledTimes(i + 2);
    }
  });

  it('makes no attempt at all while offline, then attempts immediately on "online" (F5)', async () => {
    (navigator as unknown as { onLine: boolean }).onLine = false;
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => useFetchState(fetcher, []));

    await tick(60_000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.state).toBe('loading');

    (navigator as unknown as { onLine: boolean }).onLine = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('ready');
  });

  it('makes no attempt while the document is hidden, then attempts on visibilitychange (F5)', async () => {
    visibility = 'hidden';
    const fetcher = vi.fn().mockResolvedValue('ok');
    renderHook(() => useFetchState(fetcher, []));

    await tick(60_000);
    expect(fetcher).not.toHaveBeenCalled();

    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('stops the retry loop on unmount (F6)', async () => {
    const fetcher = vi.fn().mockRejectedValue(http(500));
    const { unmount } = renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
    await tick(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('registers on the toast bus only from the second failure on, and clears on success (F9)', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(http(500))
      .mockRejectedValueOnce(http(500))
      .mockResolvedValueOnce('ok');
    const { unmount } = renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    expect(getFailingCount()).toBe(0); // a single hiccup stays invisible

    await tick(500);
    expect(getFailingCount()).toBe(1);

    await tick(1000);
    expect(getFailingCount()).toBe(0);
    unmount();
  });

  it('clears its bus entry on unmount (F6/F8)', async () => {
    const fetcher = vi.fn().mockRejectedValue(http(500));
    const { unmount } = renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    await tick(500);
    expect(getFailingCount()).toBe(1);
    unmount();
    expect(getFailingCount()).toBe(0);
  });

  it('re-arms from "error" when retry() is called (F11)', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(http(404)).mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useFetchState(fetcher, []));

    await tick(0);
    expect(result.current.state).toBe('error');

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });
    expect(result.current.state).toBe('ready');
    expect(result.current.data).toBe('ok');
  });

  it('restarts the loop and drops the pending retry when deps change', async () => {
    const fetcher = vi.fn().mockRejectedValue(http(500));
    const { rerender } = renderHook(({ q }: { q: string }) => useFetchState(() => fetcher(q), [q]), {
      initialProps: { q: 'a' },
    });

    await tick(0);
    expect(fetcher).toHaveBeenLastCalledWith('a');

    rerender({ q: 'b' });
    await tick(0);
    expect(fetcher).toHaveBeenLastCalledWith('b');

    await tick(500);
    expect(fetcher).toHaveBeenCalledTimes(3); // a, b, then only b's retry — a's loop is gone
    expect(fetcher).toHaveBeenLastCalledWith('b');
  });
});

describe('useOverride (DR-14 · local edits layered over a fetched value)', () => {
  it('returns the base until it is overridden, then the override', () => {
    const { result } = renderHook(() => useOverride('server'));
    expect(result.current[0]).toBe('server');
    act(() => result.current[1]('edited'));
    expect(result.current[0]).toBe('edited');
  });

  it('drops the override as soon as the base changes (a refetch wins over a stale edit)', () => {
    const { result, rerender } = renderHook(({ base }: { base: string }) => useOverride(base), {
      initialProps: { base: 'v1' },
    });
    act(() => result.current[1]('edited'));
    expect(result.current[0]).toBe('edited');

    rerender({ base: 'v2' });
    expect(result.current[0]).toBe('v2');
  });

  // Regression: two functional updates fired from the SAME render closure (an optimistic edit and
  // its rollback in a rejected promise) must compose. Resolving them against the render-time value
  // made the second one overwrite the first and duplicated the rolled-back row.
  it('composes two functional updates issued from the same closure', () => {
    const EMPTY: string[] = []; // stable identity — the base must not change between renders
    const { result } = renderHook(() => useOverride<string[]>(EMPTY));
    const push = result.current[1];
    act(() => {
      push((rows) => [...rows, 'a']);
      push((rows) => [...rows, 'b']);
    });
    expect(result.current[0]).toEqual(['a', 'b']);
  });

  it('supports a functional update against the current value', () => {
    const { result } = renderHook(() => useOverride(1));
    act(() => result.current[1]((n) => n + 1));
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(3);
  });
});
