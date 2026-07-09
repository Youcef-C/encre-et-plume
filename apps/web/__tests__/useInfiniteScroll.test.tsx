// DR-12 — auto-load ("infinite scroll") sentinel hook shared by the list clients.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useInfiniteScroll } from '../lib/useInfiniteScroll';

// Controllable IntersectionObserver: capture live instances so a test can fire an intersection.
let instances: MockIO[] = [];
class MockIO {
  cb: IntersectionObserverCallback;
  elements = new Set<Element>();
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    instances.push(this);
  }
  observe(el: Element) {
    this.elements.add(el);
  }
  unobserve(el: Element) {
    this.elements.delete(el);
  }
  disconnect() {
    this.elements.clear();
    instances = instances.filter((o) => o !== this);
  }
  takeRecords() {
    return [];
  }
}

function fireIntersect(isIntersecting = true) {
  for (const o of [...instances]) {
    if (o.elements.size === 0) continue;
    o.cb([{ isIntersecting } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
  }
}

function Harness({ onLoadMore, hasMore }: { onLoadMore: () => void | Promise<void>; hasMore: boolean }) {
  const ref = useInfiniteScroll(onLoadMore, hasMore);
  return hasMore ? <div ref={ref} data-testid="sentinel" aria-hidden="true" /> : null;
}

describe('useInfiniteScroll (DR-12)', () => {
  beforeEach(() => {
    instances = [];
    vi.stubGlobal('IntersectionObserver', MockIO);
  });

  it('calls onLoadMore when the sentinel intersects and more pages remain', () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} hasMore />);
    fireIntersect(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the sentinel is not intersecting', () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} hasMore />);
    fireIntersect(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not observe / fire when there are no more pages (last page)', () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} hasMore={false} />);
    fireIntersect(true);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not double-fire while a load is already in flight', () => {
    // A never-resolving load keeps the in-flight guard latched.
    const onLoadMore = vi.fn(() => new Promise<void>(() => {}));
    render(<Harness onLoadMore={onLoadMore} hasMore />);
    fireIntersect(true);
    fireIntersect(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
