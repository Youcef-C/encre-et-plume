import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListItemDto, LikedWorkDto, LikedIllustrationDto, AccountSummary } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getMyList: vi.fn(),
    getMyLikes: vi.fn(),
    unsaveReaction: vi.fn(),
    unlikeReaction: vi.fn(),
    getSavedIllustrations: vi.fn().mockResolvedValue([]),
    getLikedIllustrations: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import MaListeClient from '../components/maliste/MaListeClient';

const account: AccountSummary = {
  id: 'u1',
  displayName: 'Camille R.',
  email: 'camille@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-roux',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const listItems: ListItemDto[] = [
  {
    slug: 'lames-de-brume',
    title: 'Lames de Brume',
    cover: null,
    savedAt: '2026-06-01T00:00:00.000Z',
    lastChapterNumber: 5,
    page: 3,
    totalChapters: 12,
    progressPercent: 42,
  },
  {
    slug: 'onibi',
    title: 'Onibi',
    cover: null,
    savedAt: '2026-06-02T00:00:00.000Z',
    lastChapterNumber: null,
    page: null,
    totalChapters: 14,
    progressPercent: 0,
  },
];

const likeItems: LikedWorkDto[] = [
  { slug: 'neon-sutra', title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, likedAt: '2026-06-01T00:00:00.000Z' },
];

const savedIllustrations: LikedIllustrationDto[] = [
  { id: 'i1', title: 'Pluie de Néons', artistName: 'Yuki Moreau', category: 'process', categoryLabel: 'Process', image: null, likeCount: 3400 },
];

const likedIllustrations: LikedIllustrationDto[] = [
  { id: 'i2', title: 'Étude d’encre', artistName: 'Yuki Moreau', category: 'process', categoryLabel: 'Process', image: null, likeCount: 1300 },
];

function renderClient(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acc, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <MaListeClient />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MaListeClient (DR-8)', () => {
  it('anonymous visitors see a sign-in prompt and no data is fetched', () => {
    renderClient(null);
    expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute(
      'href',
      '/connexion?redirect=/ma-liste',
    );
    expect(api.getMyList).not.toHaveBeenCalled();
    expect(api.getMyLikes).not.toHaveBeenCalled();
  });

  it('shows a loading skeleton before data resolves', () => {
    vi.mocked(api.getMyList).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getMyLikes).mockReturnValue(new Promise(() => {}));
    renderClient();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows two tabs with data-driven counts once loaded', async () => {
    vi.mocked(api.getMyList).mockResolvedValue(listItems);
    vi.mocked(api.getMyLikes).mockResolvedValue(likeItems);
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Ma liste · 2' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('Ma liste card: started shows a resume progress bar + text, unstarted shows "Pas commencé"', async () => {
    vi.mocked(api.getMyList).mockResolvedValue(listItems);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    renderClient();
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

    expect(screen.getByText('Reprendre · Ch. 5 / 12')).toBeInTheDocument();
    expect(screen.getByText('Pas commencé')).toBeInTheDocument();

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '42');

    const link = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.startsWith('/lecteur/lames-de-brume'));
    expect(link).toHaveAttribute('href', '/lecteur/lames-de-brume?chapitre=5&page=3');
  });

  it('remove ✕: hides the card and shows Annuler; undo restores it without calling the API', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getMyList).mockResolvedValue(listItems);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderClient();
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: 'Retirer de ma liste' })[0]);
    expect(screen.queryByText('Lames de Brume')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('Lames de Brume')).toBeInTheDocument();
    expect(api.unsaveReaction).not.toHaveBeenCalled();
  });

  it('remove ✕: lapsing the undo window calls unsaveReaction (DR-9 FE7 re-point) and decrements the tab count', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getMyList).mockResolvedValue(listItems);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    vi.mocked(api.unsaveReaction).mockResolvedValue({ active: false, count: 0 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Ma liste · 2' })).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: 'Retirer de ma liste' })[0]);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() =>
      expect(api.unsaveReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'lames-de-brume' }),
    );
    expect(screen.getByRole('tab', { name: 'Ma liste · 1' })).toBeInTheDocument();
  });

  it('Coups de cœur card shows a ♥ badge, genre + like count, and links to the work page', async () => {
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue(likeItems);
    const user = userEvent.setup();
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Coups de cœur · 1' }));

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/oeuvre/neon-sutra');
    expect(link).toHaveTextContent(/Néon Sutra/);
    expect(link).toHaveTextContent(/Shōnen/);
    expect(link).toHaveTextContent('8,1k');
  });

  it('DR-9 FE7: unliking a Coups de cœur card removes it and calls unlikeReaction', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue(likeItems);
    vi.mocked(api.unlikeReaction).mockResolvedValue({ active: false, count: 8099 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Coups de cœur · 1' }));
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Retirer le j\'aime' }));
    expect(screen.queryByText('Néon Sutra')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() =>
      expect(api.unlikeReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'neon-sutra' }),
    );
  });

  it('shows the per-tab empty state', async () => {
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    renderClient();
    await waitFor(() => expect(screen.getByText('Votre liste est vide')).toBeInTheDocument());
  });

  // ── Issue 3: liked/saved illustrations rendered within their matching tab ──

  it('saved illustrations render under "Ma liste" and count toward its tab count', async () => {
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    vi.mocked(api.getSavedIllustrations).mockResolvedValue(savedIllustrations);
    vi.mocked(api.getLikedIllustrations).mockResolvedValue([]);
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Ma liste · 1' })).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /Pluie de Néons/ });
    expect(link).toHaveAttribute('href', '/illustration/i1');
    expect(screen.queryByText('Votre liste est vide')).not.toBeInTheDocument();
  });

  it('liked illustrations render under "Coups de cœur" and count toward its tab count', async () => {
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    vi.mocked(api.getSavedIllustrations).mockResolvedValue([]);
    vi.mocked(api.getLikedIllustrations).mockResolvedValue(likedIllustrations);
    const user = userEvent.setup();
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Coups de cœur · 1' }));
    const link = screen.getByRole('link', { name: /Étude d.encre/ });
    expect(link).toHaveAttribute('href', '/illustration/i2');
  });

  // ── Coordinator follow-up: illustration remove/unlike, mirroring the work cards ──

  it('saved illustration remove ✕: hides the card and shows Annuler; undo restores it without calling the API', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    vi.mocked(api.getSavedIllustrations).mockResolvedValue(savedIllustrations);
    vi.mocked(api.getLikedIllustrations).mockResolvedValue([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderClient();
    await waitFor(() => expect(screen.getByText('Pluie de Néons')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Retirer Pluie de Néons' }));
    expect(screen.queryByText('Pluie de Néons')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('Pluie de Néons')).toBeInTheDocument();
    expect(api.unsaveReaction).not.toHaveBeenCalled();
  });

  it('saved illustration remove ✕: lapsing the undo window calls unsaveReaction with the illustration id and decrements the tab count', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    vi.mocked(api.getSavedIllustrations).mockResolvedValue(savedIllustrations);
    vi.mocked(api.getLikedIllustrations).mockResolvedValue([]);
    vi.mocked(api.unsaveReaction).mockResolvedValue({ active: false, count: 0 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Ma liste · 1' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Retirer Pluie de Néons' }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() =>
      expect(api.unsaveReaction).toHaveBeenCalledWith({ targetType: 'illustration', targetId: 'i1' }),
    );
    expect(screen.getByRole('tab', { name: 'Ma liste · 0' })).toBeInTheDocument();
  });

  it('liked illustration remove ✕ (Coups de cœur): hides the card, undo restores it, and lapsing the window calls unlikeReaction with the illustration id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getMyList).mockResolvedValue([]);
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    vi.mocked(api.getSavedIllustrations).mockResolvedValue([]);
    vi.mocked(api.getLikedIllustrations).mockResolvedValue(likedIllustrations);
    vi.mocked(api.unlikeReaction).mockResolvedValue({ active: false, count: 0 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderClient();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Coups de cœur · 1' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Coups de cœur · 1' }));
    await waitFor(() => expect(screen.getByText('Étude d’encre')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Retirer Étude d’encre' }));
    expect(screen.queryByText('Étude d’encre')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(api.unlikeReaction).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() =>
      expect(api.unlikeReaction).toHaveBeenCalledWith({ targetType: 'illustration', targetId: 'i2' }),
    );
    expect(screen.getByRole('tab', { name: 'Coups de cœur · 0' })).toBeInTheDocument();
  });

  it('shows an error state with a working "Réessayer" retry', async () => {
    vi.mocked(api.getMyList).mockRejectedValueOnce(new Error('boom'));
    vi.mocked(api.getMyLikes).mockResolvedValue([]);
    const user = userEvent.setup();
    renderClient();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(api.getMyList).mockResolvedValueOnce(listItems);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
  });
});
