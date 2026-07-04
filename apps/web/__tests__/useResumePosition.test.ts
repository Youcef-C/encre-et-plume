import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { AccountSummary, ReadingHistoryEntry } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getReadingHistoryForWork: vi.fn() };
});

import * as api from '../lib/api';
import { useResumePosition } from '../lib/useResumePosition';

const account: AccountSummary = { id: 'a1', slug: 'camille', displayName: 'Camille', role: 'utilisateur', verified: true } as AccountSummary;

const entry: ReadingHistoryEntry = {
  workSlug: 'lames-de-brume',
  workTitle: 'Lames de Brume',
  chapterNumber: 4,
  chapterTitle: null,
  page: 12,
  totalPages: 28,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('useResumePosition (DR-11 F-a)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null and does not fetch when anonymous', () => {
    const { result } = renderHook(() => useResumePosition('lames-de-brume', null));
    expect(result.current).toBeNull();
    expect(api.getReadingHistoryForWork).not.toHaveBeenCalled();
  });

  it('returns the entry when signed in and history exists', async () => {
    vi.mocked(api.getReadingHistoryForWork).mockResolvedValue(entry);
    const { result } = renderHook(() => useResumePosition('lames-de-brume', account));
    await waitFor(() => expect(result.current).toEqual(entry));
    expect(api.getReadingHistoryForWork).toHaveBeenCalledWith('lames-de-brume');
  });

  it('returns null when signed in and the endpoint 404s (no history)', async () => {
    vi.mocked(api.getReadingHistoryForWork).mockRejectedValue({ statusCode: 404, message: 'Aucune progression' });
    const { result } = renderHook(() => useResumePosition('lames-de-brume', account));
    await waitFor(() => expect(api.getReadingHistoryForWork).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('returns null silently on any other error', async () => {
    vi.mocked(api.getReadingHistoryForWork).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useResumePosition('lames-de-brume', account));
    await waitFor(() => expect(api.getReadingHistoryForWork).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
