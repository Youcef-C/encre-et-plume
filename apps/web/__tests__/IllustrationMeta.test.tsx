// DR-6 FE-4 — meta block: title, byline, description, hashtag chips.
// F-22 — genres row (clickable -> /galerie?genre=<id>) + hashtag chips as links (-> /galerie?tags=<tag>).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { IllustrationDetail } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import IllustrationMeta from '../components/illustration/IllustrationMeta';

const detail: IllustrationDetail = {
  id: 'dr5-illus-1',
  title: 'Pluie de Néons',
  description: 'Encrage traditionnel rehaussé de trames numériques.',
  category: 'process',
  categoryLabel: 'Process',
  genres: ['Seinen', 'Fantastique'],
  hashtags: ['encre', 'noir', 'néon', 'pluie'],
  image: null,
  dimensionsLabel: '2480 × 3508',
  tools: 'Encre · CSP',
  license: '© Tous droits réservés',
  likeCount: 3400,
  publishedAt: '2026-06-12T00:00:00.000Z',
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'Dessinateur·rice', city: 'Lyon', avatar: null },
  is18plus: false,
};

describe('IllustrationMeta (DR-6 FE-4 / F-22)', () => {
  it('renders title, byline and description', () => {
    render(<IllustrationMeta detail={detail} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument();
    expect(screen.getByText('Yuki Moreau')).toBeInTheDocument();
    expect(screen.getByText('Process')).toBeInTheDocument();
    expect(screen.getByText(/3,4k/)).toBeInTheDocument();
    expect(screen.getByText(detail.description!)).toBeInTheDocument();
  });

  it('renders the genres as clickable genre chips linking to the Galerie genre facet', () => {
    render(<IllustrationMeta detail={detail} />);
    // Seinen -> seinen, Fantastique -> supernatural (fr->id is not identity)
    expect(screen.getByRole('link', { name: 'Filtrer par Seinen' })).toHaveAttribute('href', '/galerie?genre=seinen');
    expect(screen.getByRole('link', { name: 'Filtrer par Fantastique' })).toHaveAttribute(
      'href',
      '/galerie?genre=supernatural',
    );
  });

  it('renders hashtags as # chips linking to the Galerie freetext hashtag search', () => {
    render(<IllustrationMeta detail={detail} />);
    const link = screen.getByRole('link', { name: 'Rechercher le hashtag #encre' });
    expect(link).toHaveAttribute('href', '/galerie?tags=encre');
    expect(link).toHaveTextContent('#encre');
    expect(screen.getByRole('link', { name: 'Rechercher le hashtag #néon' })).toHaveAttribute('href', '/galerie?tags=n%C3%A9on');
  });

  it('omits the genres row when there are no genres', () => {
    render(<IllustrationMeta detail={{ ...detail, genres: [] }} />);
    expect(screen.queryByRole('link', { name: /^Filtrer par/ })).not.toBeInTheDocument();
  });

  it('omits the description paragraph when null', () => {
    render(<IllustrationMeta detail={{ ...detail, description: null }} />);
    expect(screen.queryByText(detail.description!)).not.toBeInTheDocument();
  });
});
