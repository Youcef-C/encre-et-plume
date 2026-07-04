import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RankingRow } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import RankingSidebar from '../components/RankingSidebar';

const items: RankingRow[] = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Shōnen · 8,1k ♥', is18plus: false },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, meta: 'Seinen · 5,7k ♥', is18plus: false },
];

describe('RankingSidebar', () => {
  it('blurs the cover and shows an "18+" badge for an 18+ ranked work', () => {
    render(<RankingSidebar items={[{ ...items[0]!, is18plus: true }]} />);
    expect(screen.getByLabelText('Œuvre 18+')).toBeInTheDocument();
  });

  it('does not blur or badge a non-18+ ranked work', () => {
    render(<RankingSidebar items={items} />);
    expect(screen.queryByLabelText('Œuvre 18+')).not.toBeInTheDocument();
  });

  it('QA round-1 regression: the cover box keeps its exact 48px height when is18plus (no stretch)', () => {
    render(<RankingSidebar items={[{ ...items[0]!, is18plus: true }]} />);
    expect(screen.getByTestId('ranking-sidebar-cover')).toHaveStyle({ height: '48px' });
  });

  it('renders the header verbatim', () => {
    render(<RankingSidebar items={items} />);
    expect(screen.getByText('Populaire')).toBeInTheDocument();
    expect(screen.getByText('Classement de tous les temps')).toBeInTheDocument();
  });

  it('renders a row per item with rank, title, and meta', () => {
    render(<RankingSidebar items={items} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Néon Sutra')).toBeInTheDocument();
    expect(screen.getByText('Shōnen · 8,1k ♥')).toBeInTheDocument();
  });

  it('each row links to the work page', () => {
    render(<RankingSidebar items={items} />);
    expect(screen.getByText('Néon Sutra').closest('a')).toHaveAttribute('href', '/oeuvre/neon-sutra');
  });

  it('renders the footer link to /classement', () => {
    render(<RankingSidebar items={items} />);
    expect(screen.getByRole('link', { name: /voir le classement complet/i })).toHaveAttribute('href', '/classement');
  });

  it('renders an empty-state message when there is nothing ranked', () => {
    render(<RankingSidebar items={[]} />);
    expect(screen.getByText(/aucun classement pour l.instant/i)).toBeInTheDocument();
  });
});
