import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type {
  FeaturedWork,
  TrendingWork,
  TopCreatorsResponse,
  ScheduledRelease,
  RankingRow,
  Announcement,
} from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('../lib/api', () => ({
  getFeatured: vi.fn(),
  getTrending: vi.fn(),
  getTopCreators: vi.fn(),
  getScheduledReleases: vi.fn(),
  getRankingAllTime: vi.fn(),
  getAnnouncements: vi.fn(),
  // DR-9 — HeroCarousel's per-slide save toggle (unused by this suite's assertions).
  getReactionState: vi.fn().mockResolvedValue({}),
  likeReaction: vi.fn(),
  unlikeReaction: vi.fn(),
  saveReaction: vi.fn(),
  unsaveReaction: vi.fn(),
}));

import * as api from '../lib/api';
import AccueilClient from '../components/AccueilClient';

const featured: FeaturedWork[] = [{ id: '1', slug: 'neon-sutra', title: 'Néon Sutra', cover: null, meta: 'meta', genre: 'Shōnen', is18plus: false }];
const trending: TrendingWork[] = [{ id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, growthPct: 24, is18plus: false }];
const topCreators: TopCreatorsResponse = { artist: null, scenarist: null };
const scheduled: ScheduledRelease[] = [];
const ranking: RankingRow[] = [{ id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'meta', is18plus: false }];
const announcements: Announcement[] = [];

function renderClient() {
  return render(
    <SessionContext.Provider value={{ account: null, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <AccueilClient />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFeatured).mockResolvedValue(featured);
  vi.mocked(api.getTrending).mockResolvedValue(trending);
  vi.mocked(api.getTopCreators).mockResolvedValue(topCreators);
  vi.mocked(api.getScheduledReleases).mockResolvedValue(scheduled);
  vi.mocked(api.getRankingAllTime).mockResolvedValue(ranking);
  vi.mocked(api.getAnnouncements).mockResolvedValue(announcements);
});

describe('AccueilClient — success', () => {
  it('renders every section once all feeds resolve', async () => {
    renderClient();
    expect(await screen.findByText('À LA UNE')).toBeInTheDocument();
    expect(screen.getByText('Populaires à chaud')).toBeInTheDocument();
    expect(screen.getByText('Sorties programmées')).toBeInTheDocument();
    expect(screen.getByText('Populaire')).toBeInTheDocument();
    expect(screen.getByText(/trouver un.e partenaire/i)).toBeInTheDocument();
  });

  it('shows a skeleton while pending', async () => {
    vi.mocked(api.getFeatured).mockReturnValue(new Promise(() => {}));
    renderClient();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    // Let the other (resolving) feeds settle so no act() warning leaks into other tests.
    await waitFor(() => expect(screen.getByText('Sorties programmées')).toBeInTheDocument());
  });
});

describe('AccueilClient — one feed fails independently', () => {
  // DR-14: only a TERMINAL failure still swaps a section for its red block.
  it('shows an error for the terminally failed section but still renders the others', async () => {
    vi.mocked(api.getTrending).mockRejectedValue({ statusCode: 404, message: 'Introuvable', error: 'NOT_FOUND' });
    renderClient();

    await screen.findByText('À LA UNE');
    expect(await screen.findByText(/section indisponible/i)).toBeInTheDocument();
    // Sibling sections still render
    expect(screen.getByText('Sorties programmées')).toBeInTheDocument();
    expect(screen.getByText('Populaire')).toBeInTheDocument();
  });

  // DR-14 F1/F13: a transient failure keeps that section's skeleton and retries; no red block.
  it('keeps the skeleton of a transiently failed section and recovers on the retry', async () => {
    vi.mocked(api.getTrending)
      .mockRejectedValueOnce({ statusCode: 500, message: 'Erreur', error: 'INTERNAL' })
      .mockResolvedValue(trending);
    renderClient();

    await screen.findByText('À LA UNE');
    expect(screen.queryByText(/section indisponible/i)).not.toBeInTheDocument();
    await waitFor(() => expect(api.getTrending).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/section indisponible/i)).not.toBeInTheDocument();
  });
});
