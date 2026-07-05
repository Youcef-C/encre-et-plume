import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkDetail, WorkReviewDto } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import ReviewsSection from '../components/oeuvre/ReviewsSection';

const reviews: WorkReviewDto[] = [
  { id: 'r1', authorName: 'Léa B.', storyRating: 5, artRating: 4, text: 'Superbe.', hidden: false },
  { id: 'r2', authorName: 'Hugo D.', storyRating: 4, artRating: 5, text: '', hidden: true },
];

const work: WorkDetail = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: null,
  genre: 'Seinen',
  themes: [],
  format: 'Manga',
  complete: true,
  audienceRating: '16+',
  meta: 'Camille R. × Yuki M. · 20 ch.',
  publishedAt: '2024-03-14T00:00:00.000Z',
  synopsis: 'Une histoire.',
  hashtags: [],
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
  reviews,
};

describe('ReviewsSection (DR-3 FE-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the aggregate and Histoire/Dessin sub-scores', () => {
    render(<ReviewsSection work={work} account={null} />);
    expect(screen.getByText('4,5')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Histoire 4,5/5')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Dessin 4,5/5')).toBeInTheDocument();
    expect(screen.getByText('2 avis')).toBeInTheDocument();
  });

  it('renders the review list, blanking hidden review text', () => {
    render(<ReviewsSection work={work} account={null} />);
    expect(screen.getByText('Léa B.')).toBeInTheDocument();
    expect(screen.getByText('Superbe.')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Avis de Hugo D. masqué par la modération.'),
    ).toBeInTheDocument();
  });

  it('anonymous clicking "Publier mon avis" redirects to /connexion', async () => {
    const user = userEvent.setup();
    render(<ReviewsSection work={work} account={null} />);
    await user.click(screen.getByRole('button', { name: 'Publier mon avis' }));
    expect(push).toHaveBeenCalledWith('/connexion');
  });

  it('hides the list when there are no reviews (aggregate still shows 0)', () => {
    render(<ReviewsSection work={{ ...work, reviews: [], ratingAvg: 0, ratingStoryAvg: 0, ratingArtAvg: 0, reviewCount: 0 }} account={null} />);
    expect(screen.getByText('0 avis')).toBeInTheDocument();
    expect(screen.queryByText('Léa B.')).not.toBeInTheDocument();
  });
});
