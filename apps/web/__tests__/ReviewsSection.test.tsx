import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, WorkDetail, WorkReviewDto } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('../lib/api', () => ({ createBlock: vi.fn() }));

import * as api from '../lib/api';
import ReviewsSection from '../components/oeuvre/ReviewsSection';

const reviews: WorkReviewDto[] = [
  { id: 'r1', authorId: null, authorName: 'Léa B.', storyRating: 5, artRating: 4, text: 'Superbe.', hidden: false },
  { id: 'r2', authorId: null, authorName: 'Hugo D.', storyRating: 4, artRating: 5, text: '', hidden: true },
];

const account: AccountSummary = {
  id: 'me-1',
  displayName: 'Camille R.',
  email: 'c@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-r',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

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
  collectionItems: null,
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

  describe('mute a review author (MC-10 F7)', () => {
    const authored: WorkReviewDto[] = [
      { id: 'r1', authorId: 'u-lea', authorName: 'Léa B.', storyRating: 5, artRating: 4, text: 'Superbe.', hidden: false },
      { id: 'r3', authorId: 'me-1', authorName: 'Camille R.', storyRating: 4, artRating: 4, text: 'Mon avis.', hidden: false },
    ];
    const workAuthored = { ...work, reviews: authored };

    it('shows no mute action for anonymous viewers', () => {
      render(<ReviewsSection work={workAuthored} account={null} />);
      expect(screen.queryByRole('button', { name: /masquer/i })).not.toBeInTheDocument();
    });

    it('offers mute only on other people\'s authored reviews', () => {
      render(<ReviewsSection work={workAuthored} account={account} />);
      // Léa's row (other author, non-null id) has the menu; Camille's own review does not.
      expect(screen.getByRole('button', { name: /actions sur l'avis de léa b\./i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /actions sur l'avis de camille r\./i })).not.toBeInTheDocument();
    });

    it('mutes the author, hides their reviews and announces it', async () => {
      vi.mocked(api.createBlock).mockResolvedValue({ id: 'm1', userId: 'u-lea', kind: 'mute', createdAt: '2026-07-08T00:00:00.000Z' });
      const user = userEvent.setup();
      render(<ReviewsSection work={workAuthored} account={account} />);
      await user.click(screen.getByRole('button', { name: /actions sur l'avis de léa b\./i }));
      await user.click(await screen.findByRole('menuitem', { name: /masquer les commentaires de ce compte/i }));
      await waitFor(() => expect(api.createBlock).toHaveBeenCalledWith({ userId: 'u-lea', kind: 'mute' }));
      await waitFor(() => expect(screen.queryByText('Superbe.')).not.toBeInTheDocument());
      expect(screen.getByRole('status')).toHaveTextContent('Commentaires masqués.');
    });
  });
});
