import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogResponse, TrendingWork, ActiveContest, EditorPickItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getCatalog: vi.fn(),
    getCatalogTrending: vi.fn(),
    getActiveContest: vi.fn(),
    getCatalogEditorPick: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams('')),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import * as api from '../lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import DecouvrirClient from '../components/catalog/DecouvrirClient';

const catalogPage1: CatalogResponse = {
  items: [
    { id: '1', slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen', chapterCount: 12, likeCount: 3400, complete: true, format: 'Manga', cover: null, is18plus: false },
  ],
  total: 47,
  page: 1,
  pageSize: 12,
  totalPages: 4,
};

const trending: TrendingWork[] = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, genre: 'Shōnen', likeCount: 8100, growthPct: 24, is18plus: false },
];
const contest: ActiveContest = {
  id: 'c1',
  category: 'CONCOURS',
  title: 'Prix du jeune mangaka 2026',
  subtitle: 'Doté par un éditeur · clôture 30 j',
  ctaLabel: 'Participer',
  href: '/concours',
};
const editorPicks: EditorPickItem[] = [{ id: 'p1', workSlug: 'encre-blanche', blurb: 'Repéré par une maison partenaire' }];

function mockApi(catalog: CatalogResponse) {
  vi.mocked(api.getCatalog).mockResolvedValue(catalog);
  vi.mocked(api.getCatalogTrending).mockResolvedValue(trending);
  vi.mocked(api.getActiveContest).mockResolvedValue(contest);
  vi.mocked(api.getCatalogEditorPick).mockResolvedValue(editorPicks);
}

describe('DecouvrirClient (DR-2 FE-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>);
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);
    mockApi(catalogPage1);
  });

  it('fetches the catalog with the URL filters and announces the result count (F12, F18)', async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('genre=seinen') as unknown as ReturnType<typeof useSearchParams>);
    render(<DecouvrirClient />);
    await waitFor(() => expect(api.getCatalog).toHaveBeenCalled());
    const query = vi.mocked(api.getCatalog).mock.calls[0]![0];
    expect(query.getAll('genre')).toEqual(['seinen']);

    await waitFor(() => expect(screen.getByText('47 résultats')).toBeInTheDocument());
    expect(screen.getByText('47 résultats').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('changing a filter from the sidebar auto-applies and navigates with the new query (F17, round 2)', async () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    const user = userEvent.setup();
    render(<DecouvrirClient />);
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Manga' }));

    expect(push).toHaveBeenCalledWith(expect.stringContaining('/decouvrir?'));
    expect(push).toHaveBeenCalledWith(expect.stringContaining('format=Manga'));
  });

  it('re-fetches when the URL search params change (back/forward navigation)', async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>);
    const { rerender } = render(<DecouvrirClient />);
    await waitFor(() => expect(api.getCatalog).toHaveBeenCalledTimes(1));

    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('genre=josei') as unknown as ReturnType<typeof useSearchParams>);
    rerender(<DecouvrirClient />);
    await waitFor(() => expect(api.getCatalog).toHaveBeenCalledTimes(2));
    const query = vi.mocked(api.getCatalog).mock.calls[1]![0];
    expect(query.getAll('genre')).toEqual(['josei']);
  });

  it('mounts the right rail sections (F15)', async () => {
    render(<DecouvrirClient />);
    await waitFor(() => expect(screen.getByText('Actualités')).toBeInTheDocument());
    expect(screen.getByText('Prix du jeune mangaka 2026')).toBeInTheDocument();
    expect(screen.getByText('En vogue cette semaine')).toBeInTheDocument();
    expect(screen.getByText('SÉLECTION ÉDITEUR')).toBeInTheDocument();
  });

  it('shows an error state with a working retry when the catalog fetch fails', async () => {
    vi.mocked(api.getCatalog).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<DecouvrirClient />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(api.getCatalog).mockResolvedValueOnce(catalogPage1);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
  });

  it('renders "Afficher plus de résultats" when more pages remain and appends the next page', async () => {
    const user = userEvent.setup();
    render(<DecouvrirClient />);
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    const nextPage: CatalogResponse = {
      items: [{ id: '2', slug: 'onibi', title: 'Onibi', genre: 'Fantastique', chapterCount: 14, likeCount: 1900, complete: false, format: 'Manga', cover: null, is18plus: false }],
      total: 47,
      page: 2,
      pageSize: 12,
      totalPages: 4,
    };
    vi.mocked(api.getCatalog).mockResolvedValueOnce(nextPage);
    await user.click(screen.getByRole('button', { name: 'Afficher plus de résultats' }));
    await waitFor(() => expect(screen.getByText('Onibi')).toBeInTheDocument());
    expect(screen.getByText('Lames de Brume')).toBeInTheDocument();
  });
});
