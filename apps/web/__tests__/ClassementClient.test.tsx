import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RankingEntry } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getRankingByCategory: vi.fn() };
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
import ClassementClient from '../components/classement/ClassementClient';

const mangas: RankingEntry[] = [
  { id: '1', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Manga · 8,1k ♥', href: '/oeuvre/neon-sutra', is18plus: false },
  { id: '2', rank: 2, title: 'Le Dernier Ronin', cover: null, meta: 'Manga · 5,7k ♥', href: '/oeuvre/le-dernier-ronin', is18plus: true },
];
const createurs: RankingEntry[] = [
  { id: '3', rank: 1, title: 'Yuki Moreau', cover: null, meta: 'Dessinateur·rice', href: '/dr1-yuki-moreau', is18plus: false },
];
const illustrations: RankingEntry[] = [
  { id: '5', rank: 1, title: 'Pluie de Néons', cover: null, meta: 'Yuki Moreau · Couvertures · 12401 ♥', href: '/illustration/abc', is18plus: false },
];

describe('ClassementClient (DR-7 category tabs)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>);
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);
  });

  it('shows the header verbatim (back link, eyebrow, title, subtitle)', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    render(<ClassementClient />);
    expect(screen.getByRole('link', { name: '‹ Accueil' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Tous les temps')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Classement' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
  });

  it('shows a loading skeleton first, then renders the ranked rows', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    render(<ClassementClient />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
  });

  it('renders exactly 4 category tabs with "Mangas" pressed by default', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
    const tabs = ['Mangas', 'Romans', 'Illustrations', 'Dessinateurs & Scénaristes'].map((label) =>
      screen.getByRole('button', { name: label }),
    );
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute('aria-pressed', 'true');
    tabs.slice(1).forEach((tab) => expect(tab).toHaveAttribute('aria-pressed', 'false'));
  });

  it('fetches the default "mangas" category on first load', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    render(<ClassementClient />);
    await waitFor(() => expect(api.getRankingByCategory).toHaveBeenCalledWith('mangas'));
  });

  it('clicking a category tab presses it and pushes ?category= to the router', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    const user = userEvent.setup();
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Dessinateurs & Scénaristes' }));
    expect(push).toHaveBeenCalledWith('/classement?category=createurs');
  });

  it('clicking the default "Mangas" tab pushes the bare /classement route', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('category=createurs') as unknown as ReturnType<typeof useSearchParams>);
    const user = userEvent.setup();
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Mangas' }));
    expect(push).toHaveBeenCalledWith('/classement');
  });

  it('re-fetches with the category param when the URL search params change', async () => {
    vi.mocked(api.getRankingByCategory).mockImplementation((category) =>
      Promise.resolve(category === 'createurs' ? createurs : mangas),
    );
    const { rerender } = render(<ClassementClient />);
    await waitFor(() => expect(api.getRankingByCategory).toHaveBeenCalledWith('mangas'));

    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('category=createurs') as unknown as ReturnType<typeof useSearchParams>);
    rerender(<ClassementClient />);
    await waitFor(() => expect(api.getRankingByCategory).toHaveBeenCalledWith('createurs'));
    await waitFor(() => expect(screen.getByText('Yuki Moreau')).toBeInTheDocument());
  });

  it('falls back to "mangas" for an unrecognized ?category= value', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('category=bogus') as unknown as ReturnType<typeof useSearchParams>);
    render(<ClassementClient />);
    await waitFor(() => expect(api.getRankingByCategory).toHaveBeenCalledWith('mangas'));
    expect(screen.getByRole('button', { name: 'Mangas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses "Lire" as the row action for the mangas category', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(mangas);
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Lire — Néon Sutra' })).toBeInTheDocument());
  });

  it('uses "Voir" as the row action for the illustrations category', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(illustrations);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('category=illustrations') as unknown as ReturnType<typeof useSearchParams>);
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Voir — Pluie de Néons' })).toBeInTheDocument());
  });

  it('uses "Voir le profil" as the row action for the createurs category', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue(createurs);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('category=createurs') as unknown as ReturnType<typeof useSearchParams>);
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Voir le profil — Yuki Moreau' })).toBeInTheDocument());
  });

  it('shows an empty-state message when a category has no ranked entries', async () => {
    vi.mocked(api.getRankingByCategory).mockResolvedValue([]);
    render(<ClassementClient />);
    await waitFor(() =>
      expect(screen.getByText('Aucune entrée dans ce classement pour l\'instant.')).toBeInTheDocument(),
    );
  });

  // DR-14: the red block is the TERMINAL path only.
  it('shows an error state with a working "Réessayer" retry on a terminal failure', async () => {
    vi.mocked(api.getRankingByCategory).mockRejectedValueOnce({ statusCode: 404, message: 'Introuvable', error: 'NOT_FOUND' });
    const user = userEvent.setup();
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(api.getRankingByCategory).mockResolvedValueOnce(mangas);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
  });

  // DR-14 F1 — a 5xx keeps the skeleton and retries; no red block.
  it('keeps the skeleton and retries on a transient failure', async () => {
    vi.mocked(api.getRankingByCategory)
      .mockRejectedValueOnce({ statusCode: 503, message: 'Indisponible', error: 'UNAVAILABLE' })
      .mockResolvedValue(mangas);
    render(<ClassementClient />);

    await waitFor(() => expect(api.getRankingByCategory).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
