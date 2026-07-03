import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkChaptersResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getWorkChapters: vi.fn() };
});
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import * as api from '../lib/api';
import ChapterList from '../components/oeuvre/ChapterList';

function chapter(n: number, overrides: Partial<WorkChaptersResponse['items'][number]> = {}) {
  return {
    id: `ch-${n}`,
    number: n,
    title: n <= 3 ? `Titre ${n}` : null,
    plancheCount: 20,
    publishedAt: '2024-03-14T00:00:00.000Z',
    likeCount: 1800,
    ...overrides,
  };
}

const page1: WorkChaptersResponse = {
  items: Array.from({ length: 10 }, (_, i) => chapter(i + 1)),
  total: 12,
  page: 1,
  pageSize: 10,
  totalPages: 2,
};

const page2: WorkChaptersResponse = {
  items: [chapter(11), chapter(12)],
  total: 12,
  page: 2,
  pageSize: 10,
  totalPages: 2,
};

describe('ChapterList (DR-3 FE-4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the first 3 chapters collapsed with row fields', () => {
    render(<ChapterList slug="lames-de-brume" initialData={page1} />);
    expect(screen.getByText('Ch. 1 — Titre 1')).toBeInTheDocument();
    expect(screen.getByText('Ch. 3 — Titre 3')).toBeInTheDocument();
    expect(screen.queryByText(/Ch\. 4/)).not.toBeInTheDocument();
    expect(screen.getAllByText('20 planches · 14 mars 2024').length).toBe(3);
    expect(screen.getAllByText('♥ 1,8k').length).toBe(3);
    expect(screen.getAllByText('Lire →').length).toBeGreaterThan(0);
  });

  it('omits the title suffix when a chapter has no title', () => {
    render(<ChapterList slug="lames-de-brume" initialData={{ ...page1, items: [chapter(4, { title: null })] }} />);
    expect(screen.getByText('Ch. 4')).toBeInTheDocument();
  });

  it('the toggle has aria-expanded, flips, and fetches the next page while expanding', async () => {
    vi.mocked(api.getWorkChapters).mockResolvedValue(page2);
    const user = userEvent.setup();
    render(<ChapterList slug="lames-de-brume" initialData={page1} />);

    const toggle = screen.getByRole('button', { name: 'Voir les 12 chapitres ▾' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(api.getWorkChapters).toHaveBeenCalledWith('lames-de-brume', 2);

    await waitFor(() => expect(screen.getByText('Ch. 12')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Réduire ▴' })).toBeInTheDocument();
  });

  it('collapsing back hides chapters beyond the preview again', async () => {
    const user = userEvent.setup();
    render(<ChapterList slug="lames-de-brume" initialData={page1} />);
    await user.click(screen.getByRole('button', { name: 'Voir les 12 chapitres ▾' }));
    await user.click(screen.getByRole('button', { name: 'Réduire ▴' }));
    expect(screen.queryByText(/Ch\. 4/)).not.toBeInTheDocument();
  });

  it('renders "Lire →" links pointing at the reader route with chapter number', () => {
    render(<ChapterList slug="lames-de-brume" initialData={page1} />);
    const links = screen.getAllByText('Lire →');
    expect(links[0]!.closest('a')).toHaveAttribute('href', '/lecteur/lames-de-brume?chapitre=1');
  });
});
