import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkDetail, WorkChaptersResponse, ChapterPagesResponse, AccountSummary } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getWork: vi.fn(),
    getWorkChapters: vi.fn(),
    getChapterPages: vi.fn(),
    getMyFavorites: vi.fn(),
    putReadingProgress: vi.fn(),
  };
});

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

let sessionAccount: AccountSummary | null = null;
vi.mock('../lib/session', () => ({ useSession: () => ({ account: sessionAccount, loading: false }) }));

import * as api from '../lib/api';
import Reader from '../components/lecteur/Reader';

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

const chaptersResponse: WorkChaptersResponse = {
  items: [
    { id: 'ch-1', number: 1, title: 'Sous la pluie', plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 1800, locked: false, lockReason: null },
    { id: 'ch-4', number: 4, title: null, plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 100, locked: true, lockReason: 'premium' },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

const mangaPages: ChapterPagesResponse = {
  workSlug: 'lames-de-brume',
  chapterNumber: 1,
  readMode: 'pages',
  totalPages: 6,
  pages: Array.from({ length: 6 }, (_, i) => ({ index: i + 1, image: null, caption: i === 2 ? '« Alors prouve-le. »' : null, double: false })),
  prose: [],
};

const romanPages: ChapterPagesResponse = {
  workSlug: 'dr2-le-murmure-des-cendres',
  chapterNumber: 1,
  readMode: 'prose',
  totalPages: 2,
  pages: [],
  prose: ['Paragraphe un.', 'Paragraphe deux.', 'Paragraphe trois.', 'Paragraphe quatre.', 'Paragraphe cinq.', 'Paragraphe six.'],
};

const account: AccountSummary = { id: 'a1', slug: 'camille', displayName: 'Camille', role: 'utilisateur', verified: true } as AccountSummary;

function mockReady() {
  vi.mocked(api.getWork).mockResolvedValue(work);
  vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
  vi.mocked(api.getChapterPages).mockResolvedValue(mangaPages);
  vi.mocked(api.getMyFavorites).mockResolvedValue([]);
  vi.mocked(api.putReadingProgress).mockResolvedValue(undefined);
}

describe('Reader (DR-4 FE-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAccount = null;
    searchParams = new URLSearchParams('');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a loading status, then the dark stage with topbar/asides/stage once ready', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    expect(screen.getByRole('status', { name: /Chargement/i })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/Lames de Brume · Ch\. 1/)).toBeInTheDocument());
    expect(screen.getByText('‹ Catalogue')).toBeInTheDocument();
    expect(screen.getByText('Chapitres')).toBeInTheDocument();
    expect(screen.getByText('Réactions')).toBeInTheDocument();
    expect(screen.getByText('1 · Sous la pluie')).toBeInTheDocument();
    expect(screen.getByText('4 · — verrouillé ★')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 6'));
  });

  it('QA F1 fix (round 2): "✕ Quitter" is a normal flex child of the topbar\'s tool row, not position:fixed/absolute — it must be structurally impossible for it to overlap a sibling or the site header', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByText('✕ Quitter').closest('a')).toBeInTheDocument());
    const exitLink = screen.getByText('✕ Quitter').closest('a') as HTMLAnchorElement;
    const fullscreenBtn = screen.getByRole('button', { name: /plein écran/i });

    // No fixed/absolute coordinate at all - normal document flow (flex-wrap row).
    expect(exitLink.style.position).not.toBe('fixed');
    expect(exitLink.style.position).not.toBe('absolute');
    expect(exitLink).toHaveAttribute('href', '/oeuvre/lames-de-brume');

    // Structural, not positional: it is a sibling of "Plein écran" in the same flex-wrap
    // container, so overlap is impossible by layout construction, not by coordinate luck.
    expect(exitLink.parentElement).toBe(fullscreenBtn.parentElement);
  });

  it('never renders a Webtoon segment (F10 — no webtoon mode)', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByText('Pages')).toBeInTheDocument());
    expect(screen.queryByText('Webtoon')).not.toBeInTheDocument();
  });

  it('disables the spread toggle for a roman (prose) chapter', async () => {
    vi.mocked(api.getWork).mockResolvedValue({ ...work, format: 'Roman' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
    vi.mocked(api.getChapterPages).mockResolvedValue(romanPages);
    vi.mocked(api.getMyFavorites).mockResolvedValue([]);
    render(<Reader slug="dr2-le-murmure-des-cendres" />);
    await waitFor(() => expect(screen.getByRole('button', { name: '2 pages' })).toBeDisabled());
    expect(screen.getByRole('button', { name: '1 page' })).toBeDisabled();
    expect(screen.getByText('Paragraphe un.')).toBeInTheDocument();
  });

  it('shows an error card with a working retry when the pages fetch fails', async () => {
    vi.mocked(api.getWork).mockResolvedValue(work);
    vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
    vi.mocked(api.getChapterPages).mockRejectedValueOnce({ statusCode: 500, message: 'Erreur serveur' });
    vi.mocked(api.getMyFavorites).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(api.getChapterPages).mockResolvedValueOnce(mangaPages);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
  });

  it('opens the paywall automatically for a deep link to a locked chapter (403)', async () => {
    searchParams = new URLSearchParams('chapitre=4');
    vi.mocked(api.getWork).mockResolvedValue(work);
    vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
    vi.mocked(api.getChapterPages).mockRejectedValue({ statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' });
    vi.mocked(api.getMyFavorites).mockResolvedValue([]);
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Chapitre verrouillé/ })).toBeInTheDocument());
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('persists reading progress (debounced) for a signed-in reader once pages are ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sessionAccount = account;
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(api.putReadingProgress).toHaveBeenCalledWith({ workSlug: 'lames-de-brume', chapterNumber: 1, page: 1 });
  });

  it('does not persist reading progress for a signed-out reader', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sessionAccount = null;
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(api.putReadingProgress).not.toHaveBeenCalled();
  });

  describe('DR-11 F-d — honors the ?page= deep link', () => {
    const chapter4Pages: ChapterPagesResponse = {
      workSlug: 'lames-de-brume',
      chapterNumber: 4,
      readMode: 'pages',
      totalPages: 28,
      pages: Array.from({ length: 28 }, (_, i) => ({ index: i + 1, image: null, caption: null, double: false })),
      prose: [],
    };
    const chaptersWithTwoUnlocked: WorkChaptersResponse = {
      ...chaptersResponse,
      items: [
        chaptersResponse.items[0],
        { id: 'ch-2', number: 2, title: 'Le silence', plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 90, locked: false, lockReason: null },
      ],
    };

    it('starts at the deep-linked page on the initial chapter', async () => {
      searchParams = new URLSearchParams('chapitre=4&page=12');
      vi.mocked(api.getWork).mockResolvedValue(work);
      vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
      vi.mocked(api.getChapterPages).mockResolvedValue(chapter4Pages);
      vi.mocked(api.getMyFavorites).mockResolvedValue([]);
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 12 sur 28'));
    });

    it('clamps a deep-linked page beyond totalPages to totalPages', async () => {
      searchParams = new URLSearchParams('chapitre=1&page=999');
      mockReady();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 6 sur 6'));
    });

    it('resets to page 1 when switching to another chapter', async () => {
      searchParams = new URLSearchParams('chapitre=1&page=3');
      vi.mocked(api.getWork).mockResolvedValue(work);
      vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersWithTwoUnlocked);
      vi.mocked(api.getChapterPages).mockResolvedValue(mangaPages);
      vi.mocked(api.getMyFavorites).mockResolvedValue([]);
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 3 sur 6'));

      await user.click(screen.getByText('2 · Le silence'));
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 6'));
    });
  });
});
