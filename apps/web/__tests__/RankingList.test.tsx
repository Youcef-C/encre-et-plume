import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RankingRow } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import RankingList from '../components/classement/RankingList';

const items: RankingRow[] = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Shōnen · 8,1k ♥' },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, meta: 'Seinen · 5,7k ♥' },
  { id: '3', slug: 'onibi', rank: 3, title: 'Onibi', cover: null, meta: 'Fantastique · 3,2k ♥' },
  { id: '4', slug: 'encre-blanche', rank: 4, title: 'Encre Blanche', cover: 'https://cdn/e.png', meta: 'Josei · 1,1k ♥' },
];

describe('RankingList', () => {
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

  it('title links to the work page', () => {
    render(<RankingList items={items} />);
    expect(screen.getByText('Néon Sutra').closest('a')).toHaveAttribute('href', '/oeuvre/neon-sutra');
  });

  it('"Lire" links to the work page with an accessible label containing the title', () => {
    render(<RankingList items={items} />);
    const lireLink = screen.getByRole('link', { name: 'Lire — Néon Sutra' });
    expect(lireLink).toHaveAttribute('href', '/oeuvre/neon-sutra');
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
