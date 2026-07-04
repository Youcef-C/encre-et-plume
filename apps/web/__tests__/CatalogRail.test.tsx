import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrendingWork, ActiveContest, EditorPickItem } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import CatalogRail from '../components/catalog/CatalogRail';

const contest: ActiveContest = {
  id: 'c1',
  category: 'CONCOURS',
  title: 'Prix du jeune mangaka 2026',
  subtitle: 'Doté par un éditeur · clôture 30 j',
  ctaLabel: 'Participer',
  href: '/concours',
};

const trending: TrendingWork[] = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, growthPct: 24, is18plus: false },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, genre: 'Seinen', likeCount: 5700, growthPct: 18, is18plus: false },
  { id: '3', slug: 'encre-blanche', rank: 3, title: 'Encre Blanche', cover: null, genre: 'Josei', likeCount: 2200, growthPct: 12, is18plus: false },
];

const editorPicks: EditorPickItem[] = [
  { id: 'p1', workSlug: 'encre-blanche', blurb: '« Encre Blanche » repéré par une maison partenaire' },
];

describe('CatalogRail (DR-2 FE-7)', () => {
  it('renders the "Actualités" concours card with a "Participer" link (F15)', () => {
    render(<CatalogRail contest={contest} trending={trending} editorPicks={editorPicks} />);
    expect(screen.getByText('Actualités')).toBeInTheDocument();
    expect(screen.getByText('Prix du jeune mangaka 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Participer' })).toHaveAttribute('href', '/concours');
  });

  it('hides the concours card when there is no active contest', () => {
    render(<CatalogRail contest={null} trending={trending} editorPicks={editorPicks} />);
    expect(screen.queryByText('Prix du jeune mangaka 2026')).not.toBeInTheDocument();
  });

  it('renders the "En vogue cette semaine" top-3 with rank, genre and growth', () => {
    render(<CatalogRail contest={contest} trending={trending} editorPicks={editorPicks} />);
    expect(screen.getByText('En vogue cette semaine')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /néon sutra/i });
    expect(link).toHaveAttribute('href', '/oeuvre/neon-sutra');
    expect(link).toHaveTextContent(/Shōnen.*24%/);
  });

  it('renders the "SÉLECTION ÉDITEUR" blurb', () => {
    render(<CatalogRail contest={contest} trending={trending} editorPicks={editorPicks} />);
    expect(screen.getByText('SÉLECTION ÉDITEUR')).toBeInTheDocument();
    expect(screen.getByText('« Encre Blanche » repéré par une maison partenaire')).toBeInTheDocument();
  });

  it('hides the editor-pick block when there are no picks', () => {
    render(<CatalogRail contest={contest} trending={trending} editorPicks={[]} />);
    expect(screen.queryByText('SÉLECTION ÉDITEUR')).not.toBeInTheDocument();
  });
});
