import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkDetail, AccountSummary, ReadingHistoryEntry } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getReadingHistoryForWork: vi.fn() };
});

import * as api from '../lib/api';
import WorkHero from '../components/oeuvre/WorkHero';

const work: WorkDetail = {
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
  synopsis: 'Une histoire.',
  hashtags: ['fantasy'],
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

const admin: AccountSummary = {
  id: 'a1',
  slug: 'admin-1',
  displayName: 'Admin',
  role: 'admin',
  verified: true,
} as AccountSummary;

const resumeEntry: ReadingHistoryEntry = {
  workSlug: 'lames-de-brume',
  workTitle: 'Lames de Brume',
  chapterNumber: 4,
  chapterTitle: null,
  page: 12,
  totalPages: 28,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('WorkHero (DR-3 FE-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getReadingHistoryForWork).mockRejectedValue({ statusCode: 404, message: 'Aucune progression' });
  });

  it('renders the back link, badges with text equivalents, and title', () => {
    render(<WorkHero work={work} account={null} />);
    expect(screen.getByText('‹ Catalogue').closest('a')).toHaveAttribute('href', '/decouvrir');
    expect(screen.getByText(/Complet/)).toBeInTheDocument();
    expect(screen.getByText('Seinen')).toBeInTheDocument();
    expect(screen.getByText('MANGA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeInTheDocument();
  });

  it('hides the Complet badge when not complete', () => {
    render(<WorkHero work={{ ...work, complete: false }} account={null} />);
    expect(screen.queryByText(/Complet/)).not.toBeInTheDocument();
  });

  it('formats the stat row', () => {
    render(<WorkHero work={work} account={null} />);
    expect(screen.getByText('3,4k')).toBeInTheDocument();
    expect(screen.getByText('128k')).toBeInTheDocument();
    expect(screen.getByText('340')).toBeInTheDocument();
    expect(screen.getByText('/5 · 2 avis')).toBeInTheDocument();
    expect(screen.getByText('4,5')).toBeInTheDocument();
  });

  it('the "Lire" action links to the reader route', () => {
    render(<WorkHero work={work} account={null} />);
    expect(screen.getByText('Lire').closest('a')).toHaveAttribute('href', '/lecteur/lames-de-brume');
  });

  it('hides the admin moderation bar for anonymous/utilisateur', () => {
    render(<WorkHero work={work} account={null} />);
    expect(screen.queryByText('MODÉRATION')).not.toBeInTheDocument();
  });

  it('shows the admin moderation bar only for admin role', () => {
    render(<WorkHero work={work} account={admin} />);
    expect(screen.getByText('MODÉRATION')).toBeInTheDocument();
  });

  it('anonymous clicking a personal action ("Ma liste") redirects to /connexion', async () => {
    const user = userEvent.setup();
    render(<WorkHero work={work} account={null} />);
    await user.click(screen.getByRole('button', { name: /Ma liste/ }));
    expect(push).toHaveBeenCalledWith('/connexion');
  });

  it('authed clicking a personal action shows a "Bientôt disponible" affordance', async () => {
    const user = userEvent.setup();
    render(<WorkHero work={work} account={admin} />);
    await user.click(screen.getByRole('button', { name: /Ma liste/ }));
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('signed-in with history: CTA becomes "Reprendre la lecture", deep-links to the saved chapter/page, and shows the progress bar (F1/F2/F3)', async () => {
    vi.mocked(api.getReadingHistoryForWork).mockResolvedValue(resumeEntry);
    render(<WorkHero work={work} account={admin} />);

    await waitFor(() => expect(screen.getByText('Reprendre la lecture')).toBeInTheDocument());
    expect(screen.getByText('Reprendre la lecture').closest('a')).toHaveAttribute(
      'href',
      '/lecteur/lames-de-brume?chapitre=4&page=12',
    );
    expect(screen.queryByText('Lire')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Ch. 4 · Lames de Brume — page 12/28')).toBeInTheDocument();
  });

  it('anonymous: unchanged "Lire" CTA, no progress bar, no history fetch (F4)', () => {
    render(<WorkHero work={work} account={null} />);
    expect(screen.getByText('Lire').closest('a')).toHaveAttribute('href', '/lecteur/lames-de-brume');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(api.getReadingHistoryForWork).not.toHaveBeenCalled();
  });

  it('signed-in with no history (404): unchanged "Lire" CTA, no progress bar (F4)', async () => {
    render(<WorkHero work={work} account={admin} />);
    await waitFor(() => expect(api.getReadingHistoryForWork).toHaveBeenCalled());
    expect(screen.getByText('Lire').closest('a')).toHaveAttribute('href', '/lecteur/lames-de-brume');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
