import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WorkDetail } from '@encre-et-plume/shared';
import SynopsisBlock from '../components/oeuvre/SynopsisBlock';

const base: WorkDetail = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: null,
  genre: 'Seinen',
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

describe('SynopsisBlock (DR-3 FE-3)', () => {
  it('renders the synopsis and hashtag chips', () => {
    render(<SynopsisBlock work={base} />);
    expect(screen.getByText("L'histoire d'un scribe.")).toBeInTheDocument();
    expect(screen.getByText('#fantasy')).toBeInTheDocument();
    expect(screen.getByText('#duo')).toBeInTheDocument();
  });

  it('does not render the prose excerpt for a manga', () => {
    render(<SynopsisBlock work={base} />);
    expect(screen.queryByText(/Extrait/)).not.toBeInTheDocument();
  });

  it('renders the prose excerpt for a roman with an excerpt', () => {
    render(<SynopsisBlock work={{ ...base, format: 'Roman', proseExcerpt: "La pluie n'avait pas cessé…" }} />);
    expect(screen.getByText(/Extrait · Chapitre 1/)).toBeInTheDocument();
    expect(screen.getByText(/La pluie n'avait pas cessé/)).toBeInTheDocument();
    expect(screen.getByText('Lire la suite →')).toBeInTheDocument();
  });

  it('does not render the excerpt for a roman with no stored excerpt', () => {
    render(<SynopsisBlock work={{ ...base, format: 'Roman', proseExcerpt: null }} />);
    expect(screen.queryByText(/Extrait/)).not.toBeInTheDocument();
  });
});
