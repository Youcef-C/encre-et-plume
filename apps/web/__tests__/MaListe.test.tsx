import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListItemDto, LikedWorkDto, AccountSummary } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getMyList: vi.fn(), getMyLikes: vi.fn(), unsaveReaction: vi.fn(), unlikeReaction: vi.fn() };
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
  preferences: { theme: 'system' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
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
