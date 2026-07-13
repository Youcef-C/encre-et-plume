import { renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { useScrollLock } from '../lib/useScrollLock';

afterEach(() => {
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

test('ref-counts: stays locked until the last consumer unmounts, then restores', () => {
  document.body.style.overflow = '';
  const a = renderHook(() => useScrollLock());
  expect(document.body.style.overflow).toBe('hidden');

  // A nested/stacked overlay mounts a second consumer.
  const b = renderHook(() => useScrollLock());
  expect(document.body.style.overflow).toBe('hidden');

  // Closing the inner overlay must NOT unlock while the outer one is still open.
  b.unmount();
  expect(document.body.style.overflow).toBe('hidden');

  // Last consumer gone → original scroll restored.
  a.unmount();
  expect(document.body.style.overflow).toBe('');
});

test('enabled=false does not lock', () => {
  document.body.style.overflow = '';
  const { unmount } = renderHook(() => useScrollLock(false));
  expect(document.body.style.overflow).toBe('');
  unmount();
  expect(document.body.style.overflow).toBe('');
});

test('restores the pre-existing inline overflow value, not a hardcoded default', () => {
  document.body.style.overflow = 'scroll';
  const { unmount } = renderHook(() => useScrollLock());
  expect(document.body.style.overflow).toBe('hidden');
  unmount();
  expect(document.body.style.overflow).toBe('scroll');
});
