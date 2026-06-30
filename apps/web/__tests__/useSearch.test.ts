import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const EMPTY = { works: [], creators: [], illustrations: [] };

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return { ...actual, fetchSearch: vi.fn() };
});

import { fetchSearch } from '../lib/search';
import { useSearch } from '../lib/useSearch';

describe('useSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('is idle when query is empty', () => {
    const { result } = renderHook(() => useSearch(''));
    expect(result.current.status).toBe('idle');
    expect(fetchSearch).not.toHaveBeenCalled();
  });

  it('is idle when query is below min length (1 char)', () => {
    const { result } = renderHook(() => useSearch('a'));
    expect(result.current.status).toBe('idle');
    expect(fetchSearch).not.toHaveBeenCalled();
  });

  it('stays idle before debounce fires (200ms < 250ms)', () => {
    vi.mocked(fetchSearch).mockResolvedValue(EMPTY);
    const { result } = renderHook(() => useSearch('yu'));

    act(() => { vi.advanceTimersByTime(200); });

    expect(result.current.status).toBe('idle');
    expect(fetchSearch).not.toHaveBeenCalled();
  });

  it('fires fetch and reaches ready state after debounce (250ms)', async () => {
    vi.mocked(fetchSearch).mockResolvedValue(EMPTY);
    const { result } = renderHook(() => useSearch('yu'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe('ready');
    expect(fetchSearch).toHaveBeenCalledWith('yu', undefined);
  });

  it('sets status error when fetch throws', async () => {
    vi.mocked(fetchSearch).mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useSearch('yu'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe('error');
  });

  it('passes scope to fetchSearch when provided', async () => {
    vi.mocked(fetchSearch).mockResolvedValue(EMPTY);
    const { result } = renderHook(() => useSearch('yu', 'creators'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe('ready');
    expect(fetchSearch).toHaveBeenCalledWith('yu', 'creators');
  });

  it('returns the results from the fetch response', async () => {
    const response = {
      works: [],
      creators: [{ id: '1', type: 'creators' as const, title: 'Yuki', thumbnail: null, route: '/yuki' }],
      illustrations: [],
    };
    vi.mocked(fetchSearch).mockResolvedValue(response);
    const { result } = renderHook(() => useSearch('yu'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.results).toEqual(response);
  });
});
