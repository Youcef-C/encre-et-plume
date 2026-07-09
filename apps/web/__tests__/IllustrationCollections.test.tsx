// DR-12 (2026-07-09) — illustration-detail Collections box is now DISPLAY-ONLY: gallery-style cover
// cards, each a focusable <Link> to the collection Œuvre. No owner "Modifier", no membership editor,
// no hashtag input (the illustration's hashtags are owned solely by EditIllustrationForm).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AccountSummary, IllustrationDetail } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import IllustrationCollections from '../components/illustration/IllustrationCollections';

const owner: AccountSummary = {
  id: 'acc-yuki', displayName: 'Yuki', email: 'y@x.fr', role: 'utilisateur', verified: false, slug: 'yuki-moreau',
  avatar: null, createdAt: '2026-01-01T00:00:00.000Z', preferences: { theme: 'system', dmPolicy: 'requests' }, emailVerified: true,
  needsCguReconsent: false, onboarded: true, isAdult: true,
};

function makeDetail(): IllustrationDetail {
  return {
    id: 'ill-1', title: 'Aube', description: null, category: 'personnages', categoryLabel: 'Personnages',
    genres: [], hashtags: [], image: null, dimensionsLabel: null, tools: null, license: null, likeCount: 0,
    publishedAt: '2026-01-01T00:00:00.000Z',
    artist: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau', role: 'Dessinateur·rice', city: null, avatar: null },
    is18plus: false,
    collections: [{ id: 'c1', slug: 'carnet', title: 'Carnet', cover: null }],
  };
}

describe('IllustrationCollections (display-only)', () => {
  it('renders each collection as a card linking to the Œuvre', () => {
    render(<IllustrationCollections detail={makeDetail()} account={null} />);
    expect(screen.getByRole('link', { name: 'Carnet' })).toHaveAttribute('href', '/oeuvre/carnet');
  });

  it('paints the cover thumbnail from the real image', () => {
    const detail = makeDetail();
    detail.collections = [{ id: 'c1', slug: 'carnet', title: 'Carnet', cover: 'https://cdn.example/x.jpg' }];
    render(<IllustrationCollections detail={detail} account={null} />);
    const link = screen.getByRole('link', { name: 'Carnet' });
    const thumb = link.querySelector('[aria-hidden="true"]');
    expect(thumb?.getAttribute('style')).toContain('cdn.example/x.jpg');
  });

  it('never shows a "Modifier" button or a hashtag input, even for the owner', () => {
    render(<IllustrationCollections detail={makeDetail()} account={owner} />);
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hashtags')).not.toBeInTheDocument();
  });

  it('shows "Aucune collection" to the owner when there are none', () => {
    const detail = makeDetail();
    detail.collections = [];
    render(<IllustrationCollections detail={detail} account={owner} />);
    expect(screen.getByText('Aucune collection')).toBeInTheDocument();
  });

  it('renders nothing to a visitor when there are no collections', () => {
    const detail = makeDetail();
    detail.collections = [];
    const { container } = render(<IllustrationCollections detail={detail} account={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('makes "Gérer les collections" a red (accent) button for the owner', () => {
    render(<IllustrationCollections detail={makeDetail()} account={owner} />);
    const btn = screen.getByRole('button', { name: 'Gérer les collections' });
    expect(btn.style.background).toContain('var(--accent)');
    expect(btn.style.color).toBe('rgb(255, 255, 255)'); // #fff normalized by jsdom
  });

  it('links "Voir tout" to the Galerie filtered to this user\'s collections when there are collections', () => {
    render(<IllustrationCollections detail={makeDetail()} account={null} />);
    expect(screen.getByRole('link', { name: 'Voir tout' })).toHaveAttribute('href', '/galerie?category=collections&artist=yuki-moreau');
  });

  it('does not show "Voir tout" when there are no collections', () => {
    const detail = makeDetail();
    detail.collections = [];
    render(<IllustrationCollections detail={detail} account={owner} />);
    expect(screen.queryByRole('link', { name: 'Voir tout' })).not.toBeInTheDocument();
  });

  // ── Scroll-strip carousel (all cards rendered; ~2 visible; swipe/drag + arrows) ──

  // jsdom has no layout, so scrollWidth/clientWidth/scrollLeft are all 0. Force real metrics on
  // the strip so the overflow-driven arrow logic can be exercised, then fire a scroll event.
  function setStripMetrics(el: HTMLElement, m: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: m.scrollWidth });
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: m.clientWidth });
    Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: m.scrollLeft });
  }

  function threeCollections(): IllustrationDetail {
    const detail = makeDetail();
    detail.collections = [
      { id: 'c1', slug: 'a', title: 'Alpha', cover: null },
      { id: 'c2', slug: 'b', title: 'Beta', cover: null },
      { id: 'c3', slug: 'c', title: 'Gamma', cover: null },
    ];
    return detail;
  }

  it('renders EVERY collection in a horizontal scroll strip (all reachable, not paginated away)', () => {
    render(<IllustrationCollections detail={threeCollections()} account={null} />);
    // The whole point of the strip model: the third card is present in the DOM (scroll to it),
    // not hidden behind a page as the old 2-up pagination did.
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gamma' })).toBeInTheDocument();

    const strip = screen.getByTestId('collections-strip');
    expect(strip.style.overflowX).toBe('auto');
    expect(strip.style.scrollSnapType).toContain('x');
    // Keyboard/tab reachable.
    expect(strip).toHaveAttribute('tabindex', '0');
  });

  it('shows the next arrow (not prev) when the strip overflows at the start, and pages on click', () => {
    render(<IllustrationCollections detail={threeCollections()} account={null} />);
    const strip = screen.getByTestId('collections-strip');
    strip.scrollBy = vi.fn();
    setStripMetrics(strip, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(strip);

    expect(screen.queryByRole('button', { name: 'Collections précédentes' })).not.toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Collections suivantes' });
    fireEvent.click(next);
    expect(strip.scrollBy).toHaveBeenCalled();
    const arg = (strip.scrollBy as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { left: number };
    expect(arg.left).toBeGreaterThan(0); // scrolls forward by ~2 cards
  });

  it('hides the next arrow at the true end and shows prev (which scrolls back)', () => {
    render(<IllustrationCollections detail={threeCollections()} account={null} />);
    const strip = screen.getByTestId('collections-strip');
    strip.scrollBy = vi.fn();
    setStripMetrics(strip, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 });
    fireEvent.scroll(strip);

    expect(screen.queryByRole('button', { name: 'Collections suivantes' })).not.toBeInTheDocument();
    const prev = screen.getByRole('button', { name: 'Collections précédentes' });
    fireEvent.click(prev);
    const arg = (strip.scrollBy as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { left: number };
    expect(arg.left).toBeLessThan(0); // scrolls back by ~2 cards
  });

  it('shows no arrows when the strip does not overflow (≤ 2 collections fit)', () => {
    render(<IllustrationCollections detail={makeDetail()} account={null} />); // 1 collection
    const strip = screen.getByTestId('collections-strip');
    setStripMetrics(strip, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(strip);
    expect(screen.queryByRole('button', { name: 'Collections suivantes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collections précédentes' })).not.toBeInTheDocument();
  });
});
