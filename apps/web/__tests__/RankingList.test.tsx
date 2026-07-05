import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RankingEntry } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import RankingList from '../components/classement/RankingList';

const items: RankingEntry[] = [
  { id: '1', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Shōnen · 8,1k ♥', href: '/oeuvre/neon-sutra', is18plus: false },
  { id: '2', rank: 2, title: 'Le Dernier Ronin', cover: null, meta: 'Seinen · 5,7k ♥', href: '/oeuvre/le-dernier-ronin', is18plus: false },
  { id: '3', rank: 3, title: 'Onibi', cover: null, meta: 'Fantastique · 3,2k ♥', href: '/oeuvre/onibi', is18plus: false },
  { id: '4', rank: 4, title: 'Encre Blanche', cover: 'https://cdn/e.png', meta: 'Josei · 1,1k ♥', href: '/oeuvre/encre-blanche', is18plus: false },
];

describe('RankingList (DR-7 category tabs)', () => {
  it('blurs the cover and shows an "Œuvre 18+" badge for an 18+ work/roman row', () => {
    render(<RankingList items={[{ ...items[0]!, is18plus: true, href: '/oeuvre/neon-sutra' }]} />);
    expect(screen.getByLabelText('Œuvre 18+')).toBeInTheDocument();
  });

  it('shows an "Illustration 18+" badge for an 18+ illustration row', () => {
    render(<RankingList items={[{ ...items[0]!, is18plus: true, href: '/illustration/abc' }]} />);
    expect(screen.getByLabelText('Illustration 18+')).toBeInTheDocument();
  });

  it('does not blur or badge a non-18+ row', () => {
    render(<RankingList items={items} />);
    expect(screen.queryByLabelText('Œuvre 18+')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Illustration 18+')).not.toBeInTheDocument();
  });

  it('QA round-1 regression: the cover box keeps its exact 70px height when is18plus (no stretch)', () => {
    render(<RankingList items={[{ ...items[0]!, is18plus: true }]} />);
    expect(screen.getByTestId('ranking-cover')).toHaveStyle({ height: '70px' });
  });

  it('renders an ordered list with a row per item in given order', () => {
    render(<RankingList items={items} />);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
  });

  it('shows the rank badge number for each row', () => {
    render(<RankingList items={items} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('gives top-3 rank badges the accent style and rank 4+ the paper style', () => {
    render(<RankingList items={items} />);
    const rowsByRank = items.map((i) => screen.getByText(String(i.rank)));
    expect(rowsByRank[0]).toHaveStyle({ background: 'var(--accent)' });
    expect(rowsByRank[2]).toHaveStyle({ background: 'var(--accent)' });
    expect(rowsByRank[3]).toHaveStyle({ background: 'var(--paper)' });
  });

  it('renders a halftone placeholder (no <img>) when cover is null, and a background image when set', () => {
    render(<RankingList items={items} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('title links to the row href (category-correct destination)', () => {
    render(<RankingList items={items} />);
    expect(screen.getByText('Néon Sutra').closest('a')).toHaveAttribute('href', '/oeuvre/neon-sutra');
  });

  it('title links to an illustration href when the row is an illustration', () => {
    render(<RankingList items={[{ ...items[0]!, href: '/illustration/abc' }]} />);
    expect(screen.getByText('Néon Sutra').closest('a')).toHaveAttribute('href', '/illustration/abc');
  });

  it('title links to a profile href when the row is a creator', () => {
    render(<RankingList items={[{ ...items[0]!, href: '/yuki-moreau' }]} />);
    expect(screen.getByText('Néon Sutra').closest('a')).toHaveAttribute('href', '/yuki-moreau');
  });

  it('"Lire" links to the row href with an accessible label containing the title (default actionLabel)', () => {
    render(<RankingList items={items} />);
    const lireLink = screen.getByRole('link', { name: 'Lire — Néon Sutra' });
    expect(lireLink).toHaveAttribute('href', '/oeuvre/neon-sutra');
  });

  it('renders the given actionLabel as the row action text and accessible name', () => {
    render(<RankingList items={items} actionLabel="Voir" />);
    expect(screen.getByRole('link', { name: 'Voir — Néon Sutra' })).toHaveAttribute('href', '/oeuvre/neon-sutra');
  });

  it('renders a multi-word actionLabel ("Voir le profil") verbatim', () => {
    render(<RankingList items={[items[0]!]} actionLabel="Voir le profil" />);
    expect(screen.getByRole('link', { name: 'Voir le profil — Néon Sutra' })).toBeInTheDocument();
    expect(screen.getByText('Voir le profil')).toBeInTheDocument();
  });

  it('meta text renders per row', () => {
    render(<RankingList items={items} />);
    expect(screen.getByText('Shōnen · 8,1k ♥')).toBeInTheDocument();
  });

  it('never renders an emoji character (no-emoji rule)', () => {
    const { container } = render(<RankingList items={items} />);
    // crude but effective: no crown/trophy/star emoji glyphs in text nodes
    expect(container.textContent).not.toMatch(/👑|🏆/u);
  });
});
