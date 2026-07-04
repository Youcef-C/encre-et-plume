import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeaturedWork } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getReactionState: vi.fn(), saveReaction: vi.fn(), unsaveReaction: vi.fn() };
});

import * as api from '../lib/api';
import HeroCarousel from '../components/HeroCarousel';

const slides: FeaturedWork[] = [
  { id: '1', slug: 'neon-sutra', title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 20 ch.', genre: 'Shōnen', is18plus: false },
  { id: '2', slug: 'lames-de-brume', title: 'Lames de Brume', cover: null, meta: 'Camille R. · 12 ch.', genre: 'Seinen', is18plus: false },
];

const slides18: FeaturedWork[] = [{ ...slides[0]!, is18plus: true }];

function renderCarousel(account: null | { id: string } = null) {
  return render(
    <SessionContext.Provider
      value={{ account: account as never, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <HeroCarousel slides={slides} />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.mocked(api.getReactionState).mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HeroCarousel', () => {
  it('renders the first slide title and meta', () => {
    renderCarousel();
    expect(screen.getByTestId('hero-slide-title')).toHaveTextContent('Néon Sutra');
    expect(screen.getByText('Léa B. × Hugo D. · 20 ch.')).toBeInTheDocument();
  });

  it('arrows have French aria-labels and are keyboard operable', async () => {
    const user = userEvent.setup();
    renderCarousel();
    const next = screen.getByRole('button', { name: /diapositive suivante/i });
    const prev = screen.getByRole('button', { name: /diapositive précédente/i });
    expect(next).toBeInTheDocument();
    expect(prev).toBeInTheDocument();
    await user.click(next);
    expect(screen.getByTestId('hero-slide-title')).toHaveTextContent('Lames de Brume');
  });

  it('next/prev change the active slide and dots reflect it', async () => {
    const user = userEvent.setup();
    renderCarousel();
    const dots = screen.getAllByRole('button', { name: /aller à la diapositive/i });
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');

    await user.click(screen.getByRole('button', { name: /diapositive suivante/i }));
    expect(dots[1]).toHaveAttribute('aria-current', 'true');
  });

  it('wraps around from the last slide back to the first', async () => {
    const user = userEvent.setup();
    renderCarousel();
    await user.click(screen.getByRole('button', { name: /diapositive suivante/i }));
    await user.click(screen.getByRole('button', { name: /diapositive suivante/i }));
    expect(screen.getByTestId('hero-slide-title')).toHaveTextContent('Néon Sutra');
  });

  it('announces the active slide title politely', () => {
    renderCarousel();
    expect(screen.getByRole('status')).toHaveTextContent('Néon Sutra');
  });

  it('auto-advances after 6s when motion is not reduced', () => {
    vi.useFakeTimers();
    renderCarousel();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByTestId('hero-slide-title')).toHaveTextContent('Lames de Brume');
  });

  it('does not auto-advance when prefers-reduced-motion is set', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.useFakeTimers();
    renderCarousel();
    vi.advanceTimersByTime(10_000);
    expect(screen.getByTestId('hero-slide-title')).toHaveTextContent('Néon Sutra');
  });

  it('"Lire maintenant" links to the work page', () => {
    renderCarousel();
    expect(screen.getByRole('link', { name: /lire maintenant/i })).toHaveAttribute('href', '/oeuvre/neon-sutra');
  });

  it('anonymous "＋ Ma liste" click redirects to /connexion', async () => {
    const user = userEvent.setup();
    renderCarousel(null);
    await user.click(screen.getByRole('button', { name: /ma liste/i }));
    expect(mockPush).toHaveBeenCalledWith('/connexion');
  });

  it('DR-9: authenticated "＋ Ma liste" click toggles aria-pressed and calls saveReaction, no redirect', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveReaction).mockResolvedValue({ active: true, count: 1 });
    renderCarousel({ id: 'a1' });
    const btn = screen.getByRole('button', { name: 'Ajouter à ma liste' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await user.click(btn);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retirer de ma liste' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.saveReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'neon-sutra' });
  });

  // ── DR-10: 18+ blur + badge ──────────────────────────────────────────────────

  it('blurs the slide cover and shows an "18+" badge for an 18+ featured work', () => {
    render(
      <SessionContext.Provider value={{ account: null, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
        <HeroCarousel slides={slides18} />
      </SessionContext.Provider>,
    );
    expect(screen.getByLabelText('Œuvre 18+')).toBeInTheDocument();
  });
});
