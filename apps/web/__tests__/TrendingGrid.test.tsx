import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrendingWork } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import TrendingGrid from '../components/TrendingGrid';

const items: TrendingWork[] = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, growthPct: 24, is18plus: false },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, genre: 'Seinen', likeCount: 5700, growthPct: 18, is18plus: false },
  { id: '3', slug: 'spectres-davril', rank: 3, title: "Spectres d'Avril", cover: null, genre: 'Fantastique', likeCount: 4000, growthPct: 12, is18plus: false },
  { id: '4', slug: 'lames-de-brume', rank: 4, title: 'Lames de Brume', cover: null, genre: 'Seinen', likeCount: 3400, growthPct: 9, is18plus: false },
];

describe('TrendingGrid', () => {
  it('blurs the cover and shows an "18+" badge for an 18+ trending work', () => {
    render(<TrendingGrid items={[{ ...items[0]!, is18plus: true }]} />);
    expect(screen.getByLabelText('Œuvre 18+')).toBeInTheDocument();
  });

  it('does not blur or badge a non-18+ trending work', () => {
    render(<TrendingGrid items={items} />);
    expect(screen.queryByLabelText('Œuvre 18+')).not.toBeInTheDocument();
  });

  // QA round-1 regression: the 18+ overlay must never change the cover box's own declared
  // height, or its title/meta siblings shift into the next grid row.
  it('QA round-1 regression: the cover box keeps its exact 290px height when is18plus (no stretch)', () => {
    render(<TrendingGrid items={[{ ...items[0]!, is18plus: true }]} />);
    expect(screen.getByTestId('trending-cover')).toHaveStyle({ height: '290px' });
  });

  it('renders the header with the "cette semaine" pill and "Tout voir →" link', () => {
    render(<TrendingGrid items={items} />);
    expect(screen.getByText('Populaires à chaud')).toBeInTheDocument();
    expect(screen.getByText('cette semaine')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tout voir/i })).toHaveAttribute('href', '/classement');
  });

  it('renders 4 cards with rank, genre, formatted ♥, and growth', () => {
    render(<TrendingGrid items={items} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    const card = screen.getByText('Néon Sutra').closest('a');
    expect(card).toHaveTextContent('Néon Sutra');
    expect(card).toHaveTextContent(/Shōnen.*8,1k.*24%/);
  });

  it('each card is a focusable link to the work page', () => {
    render(<TrendingGrid items={items} />);
    const link = screen.getByRole('link', { name: /néon sutra/i });
    expect(link).toHaveAttribute('href', '/oeuvre/neon-sutra');
  });

  it('like counts have accessible text', () => {
    render(<TrendingGrid items={items} />);
    expect(screen.getByLabelText(/8,1k j.aime/i)).toBeInTheDocument();
  });

  it('renders an empty-state message when there is nothing trending', () => {
    render(<TrendingGrid items={[]} />);
    expect(screen.getByText(/aucune tendance/i)).toBeInTheDocument();
  });
});
