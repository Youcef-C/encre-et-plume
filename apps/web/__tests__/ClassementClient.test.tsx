import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RankingRow } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getRanking: vi.fn() };
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

const items: RankingRow[] = [
  { id: '1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Shōnen · 8,1k ♥', is18plus: false },
  { id: '2', slug: 'le-dernier-ronin', rank: 2, title: 'Le Dernier Ronin', cover: null, meta: 'Seinen · 5,7k ♥', is18plus: false },
];

describe('ClassementClient (DR-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('') as unknown as ReturnType<typeof useSearchParams>);
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);
  });

  it('shows the header verbatim (back link, eyebrow, title, subtitle)', async () => {
    vi.mocked(api.getRanking).mockResolvedValue(items);
    render(<ClassementClient />);
    expect(screen.getByRole('link', { name: '‹ Accueil' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Tous les temps')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Classement' })).toBeInTheDocument();
    expect(
      screen.getByText('Les œuvres les plus populaires depuis toujours, tous genres confondus.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
  });

  it('shows a loading skeleton first, then renders the ranked rows', async () => {
    vi.mocked(api.getRanking).mockResolvedValue(items);
    render(<ClassementClient />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
  });

  it('renders exactly 5 genre chips with "Tout" pressed by default', async () => {
    vi.mocked(api.getRanking).mockResolvedValue(items);
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
    const chips = ['Tout', 'Shōnen', 'Seinen', 'Fantastique', 'Josei'].map((label) =>
      screen.getByRole('button', { name: label }),
    );
    expect(chips).toHaveLength(5);
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    chips.slice(1).forEach((chip) => expect(chip).toHaveAttribute('aria-pressed', 'false'));
  });

  it('clicking a genre chip presses it and pushes ?genre= to the router', async () => {
    vi.mocked(api.getRanking).mockResolvedValue(items);
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    const user = userEvent.setup();
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Seinen' }));
    expect(push).toHaveBeenCalledWith('/classement?genre=Seinen');
  });

  it('re-fetches with the genre param when the URL search params change', async () => {
    vi.mocked(api.getRanking).mockResolvedValue(items);
    const { rerender } = render(<ClassementClient />);
    await waitFor(() => expect(api.getRanking).toHaveBeenCalledWith(undefined));

    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('genre=Seinen') as unknown as ReturnType<typeof useSearchParams>);
    rerender(<ClassementClient />);
    await waitFor(() => expect(api.getRanking).toHaveBeenCalledWith('Seinen'));
  });

  it('shows an empty-state message when the genre has no ranked entries', async () => {
    vi.mocked(api.getRanking).mockResolvedValue([]);
    render(<ClassementClient />);
    await waitFor(() =>
      expect(screen.getByText("Aucune œuvre dans ce genre pour l'instant.")).toBeInTheDocument(),
    );
  });

  it('shows an error state with a working "Réessayer" retry', async () => {
    vi.mocked(api.getRanking).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<ClassementClient />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(api.getRanking).mockResolvedValueOnce(items);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByText('Néon Sutra')).toBeInTheDocument());
  });
});
