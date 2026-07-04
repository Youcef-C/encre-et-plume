// DR-9 FE1 — the DRY optimistic-toggle hook every ♥/★ surface reuses.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { AccountSummary } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    likeReaction: vi.fn(),
    unlikeReaction: vi.fn(),
    saveReaction: vi.fn(),
    unsaveReaction: vi.fn(),
  };
});

import * as api from '../lib/api';
import { useReaction } from '../lib/useReaction';

const account: AccountSummary = { id: 'a1', slug: 'camille', displayName: 'Camille', role: 'utilisateur', verified: true } as AccountSummary;

function setup(overrides: Partial<Parameters<typeof useReaction>[0]> = {}) {
  return renderHook((props) => useReaction({ ...props }), {
    initialProps: {
      targetType: 'work' as const,
      targetId: 'lames-de-brume',
      kind: 'like' as const,
      account,
      initialActive: false,
      initialCount: 10,
      ...overrides,
    },
  });
}

describe('useReaction (DR-9 FE1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('anonymous toggle redirects to /connexion and never calls the API', () => {
    const { result } = setup({ account: null });
    act(() => result.current.toggle());
    expect(push).toHaveBeenCalledWith('/connexion');
    expect(api.likeReaction).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(10);
  });

  it('flips active and count optimistically on toggle, then reconciles with the server response', async () => {
    vi.mocked(api.likeReaction).mockResolvedValue({ active: true, count: 12 });
    const { result } = setup();

    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(11);
    expect(result.current.pending).toBe(true);

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(12);
  });

  it('reverts to the pre-click state and sets error on a rejected API call', async () => {
    vi.mocked(api.likeReaction).mockRejectedValue(new Error('boom'));
    const { result } = setup();

    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(10);
  });

  it('ignores a second tap while a request is in flight', async () => {
    let resolve!: (v: { active: boolean; count: number }) => void;
    vi.mocked(api.likeReaction).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = setup();

    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(api.likeReaction).toHaveBeenCalledTimes(1);

    resolve({ active: true, count: 11 });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it('calls the unlike endpoint when toggling off an active like', async () => {
    vi.mocked(api.unlikeReaction).mockResolvedValue({ active: false, count: 9 });
    const { result } = setup({ initialActive: true, initialCount: 10 });

    act(() => result.current.toggle());
    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(9);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(api.unlikeReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'lames-de-brume' });
  });

  it('routes to save/unsave when kind is "save"', async () => {
    vi.mocked(api.saveReaction).mockResolvedValue({ active: true, count: 1 });
    const { result } = setup({ kind: 'save', initialCount: 0 });

    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(api.saveReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'lames-de-brume' });
  });

  it('adopts hydrated initialActive/initialCount changes when no toggle is in flight', () => {
    const { result, rerender } = setup({ initialActive: false, initialCount: 10 });
    expect(result.current.active).toBe(false);
    rerender({
      targetType: 'work',
      targetId: 'lames-de-brume',
      kind: 'like',
      account,
      initialActive: true,
      initialCount: 42,
    });
    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(42);
  });
});
