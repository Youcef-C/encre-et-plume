import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  beginTransientFailure,
  subscribe,
  getFailingCount,
  getServerCount,
  retryAll,
} from '../lib/toastBus';

// The bus is module-level state (that is the point — no React context), so each test drains what it
// registered. `clears` collects every clear fn handed out during a test.
const clears: Array<() => void> = [];
const begin = (retry = vi.fn()) => {
  const clear = beginTransientFailure(retry);
  clears.push(clear);
  return clear;
};

afterEach(() => {
  clears.splice(0).forEach((clear) => clear());
  expect(getFailingCount()).toBe(0);
});

describe('toastBus (DR-14 FE-2 · F8/D-3)', () => {
  it('counts two concurrent failures and reports one merged state', () => {
    const clearA = begin();
    const clearB = begin();
    expect(getFailingCount()).toBe(2);
    clearA();
    expect(getFailingCount()).toBe(1);
    clearB();
    expect(getFailingCount()).toBe(0);
  });

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    const clear = begin();
    expect(listener).toHaveBeenCalledTimes(1);
    clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    begin()();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('retryAll() calls every registered retry (D-3)', () => {
    const a = vi.fn();
    const b = vi.fn();
    begin(a);
    begin(b);
    retryAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clearing the same entry twice does not double-decrement', () => {
    const clear = begin();
    begin();
    clear();
    clear();
    expect(getFailingCount()).toBe(1);
  });

  it('getServerCount() is the SSR snapshot 0 even while a failure is registered', () => {
    begin();
    expect(getServerCount()).toBe(0);
  });
});
