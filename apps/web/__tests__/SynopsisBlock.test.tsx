import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WorkDetail } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import SynopsisBlock from '../components/oeuvre/SynopsisBlock';

const base: WorkDetail = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: null,
  genre: 'Seinen',
  themes: ['Action', 'Aventure'],
  format: 'Manga',
  complete: true,
  audienceRating: '16+',
  meta: 'Camille R. × Yuki M. · 20 ch.',
  publishedAt: '2024-03-14T00:00:00.000Z',
  synopsis: "L'histoire d'un scribe.",
  hashtags: ['fantasy', 'duo'],
  proseExcerpt: null,
  likeCount: 3400,
  readCount: 128000,
  favoriteCount: 340,
  ratingAvg: 4.5,
  ratingStoryAvg: 4.5,
  ratingArtAvg: 4.5,
  reviewCount: 2,
  chapterCount: 12,
  team: [],
  fundingGoals: [],
  reviews: [],
};

describe('SynopsisBlock (F-22 genre tag row)', () => {
  it('renders the synopsis', () => {
    render(<SynopsisBlock work={base} />);
    expect(screen.getByText("L'histoire d'un scribe.")).toBeInTheDocument();
  });

  it('renders genre + themes as clickable genre chips linking to the Découvrir facet', () => {
    render(<SynopsisBlock work={base} />);
    // Seinen -> seinen, Action -> action, Aventure -> adventure (fr->id is not identity)
    expect(screen.getByRole('link', { name: 'Filtrer par Seinen' })).toHaveAttribute('href', '/decouvrir?genre=seinen');
    expect(screen.getByRole('link', { name: 'Filtrer par Action' })).toHaveAttribute('href', '/decouvrir?genre=action');
    expect(screen.getByRole('link', { name: 'Filtrer par Aventure' })).toHaveAttribute('href', '/decouvrir?genre=adventure');
  });

  it('does NOT render the work freetext hashtags as chips anymore', () => {
    render(<SynopsisBlock work={base} />);
    expect(screen.queryByText('#fantasy')).not.toBeInTheDocument();
    expect(screen.queryByText('#duo')).not.toBeInTheDocument();
  });

  it('dedupes a theme equal to the genre to a single chip', () => {
    render(<SynopsisBlock work={{ ...base, themes: ['Seinen', 'Action'] }} />);
    expect(screen.getAllByRole('link', { name: 'Filtrer par Seinen' })).toHaveLength(1);
  });

  it('renders an unresolvable label as a plain (non-linked) chip', () => {
    render(<SynopsisBlock work={{ ...base, genre: 'PasUnGenre', themes: [] }} />);
    expect(screen.getByText('PasUnGenre')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Filtrer par PasUnGenre' })).not.toBeInTheDocument();
  });

  it('renders the prose excerpt for a roman with an excerpt', () => {
    render(<SynopsisBlock work={{ ...base, format: 'Roman', proseExcerpt: "La pluie n'avait pas cessé…" }} />);
    expect(screen.getByText(/Extrait · Chapitre 1/)).toBeInTheDocument();
    expect(screen.getByText(/La pluie n'avait pas cessé/)).toBeInTheDocument();
    expect(screen.getByText('Lire la suite →')).toBeInTheDocument();
  });

  it('does not render the prose excerpt for a manga', () => {
    render(<SynopsisBlock work={base} />);
    expect(screen.queryByText(/Extrait/)).not.toBeInTheDocument();
  });
});
