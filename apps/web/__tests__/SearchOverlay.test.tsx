import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchResponse } from '@encre-et-plume/shared';

const EMPTY: SearchResponse = { works: [], creators: [], illustrations: [] };
const WITH_CREATOR: SearchResponse = {
  works: [],
  creators: [{ id: '1', type: 'creators', title: 'Yuki Moreau', thumbnail: null, route: '/yuki-moreau' }],
  illustrations: [],
};

// Hoist mock before imports (Vitest hoists vi.mock automatically)
vi.mock('../lib/useSearch', () => ({
  useSearch: vi.fn(() => ({ status: 'idle', results: { works: [], creators: [], illustrations: [] }, error: null })),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { useSearch } from '../lib/useSearch';
import SearchOverlay from '../components/SearchOverlay';

beforeEach(() => vi.clearAllMocks());

describe('SearchOverlay', () => {
  it('renders nothing when open is false', () => {
    render(<SearchOverlay open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog when open is true', () => {
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /rechercher/i })).toBeInTheDocument();
  });

  it('input has accessible name "Rechercher"', () => {
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /rechercher/i })).toBeInTheDocument();
  });

  it('shows idle state text when status is idle', () => {
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/recherchez une œuvre/i)).toBeInTheDocument();
  });

  it('shows loading text when status is loading', () => {
    vi.mocked(useSearch).mockReturnValue({ status: 'loading', results: EMPTY, error: null });
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('shows "Aucun résultat" when status is ready and no results', () => {
    vi.mocked(useSearch).mockReturnValue({ status: 'ready', results: EMPTY, error: null });
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/aucun résultat/i)).toBeInTheDocument();
  });

  it('shows "Une erreur est survenue" when status is error (non-401)', () => {
    vi.mocked(useSearch).mockReturnValue({
      status: 'error',
      results: EMPTY,
      error: new Error('fail'),
    });
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/une erreur est survenue/i)).toBeInTheDocument();
  });

  it('shows sign-in prompt link when status is error 401', () => {
    vi.mocked(useSearch).mockReturnValue({
      status: 'error',
      results: EMPTY,
      error: { statusCode: 401, message: 'Unauthorized' },
    });
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /connectez-vous/i })).toBeInTheDocument();
  });

  it('renders grouped headings only for non-empty groups', () => {
    vi.mocked(useSearch).mockReturnValue({ status: 'ready', results: WITH_CREATOR, error: null });
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Créateur·rices')).toBeInTheDocument();
    expect(screen.queryByText('Œuvres')).not.toBeInTheDocument();
    expect(screen.queryByText('Illustrations')).not.toBeInTheDocument();
  });

  it('result links to item.route', () => {
    vi.mocked(useSearch).mockReturnValue({ status: 'ready', results: WITH_CREATOR, error: null });
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    const link = screen.getByRole('option', { name: /yuki moreau/i });
    expect(link).toHaveAttribute('href', '/yuki-moreau');
  });

  it('clicking a result calls onClose', async () => {
    vi.mocked(useSearch).mockReturnValue({ status: 'ready', results: WITH_CREATOR, error: null });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SearchOverlay open={true} onClose={onClose} />);
    await user.click(screen.getByRole('option', { name: /yuki moreau/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SearchOverlay open={true} onClose={onClose} />);
    const input = screen.getByRole('combobox', { name: /rechercher/i });
    input.focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SearchOverlay open={true} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /fermer la recherche/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ArrowDown from input moves focus to first result', async () => {
    vi.mocked(useSearch).mockReturnValue({ status: 'ready', results: WITH_CREATOR, error: null });
    const user = userEvent.setup();
    render(<SearchOverlay open={true} onClose={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: /rechercher/i });
    input.focus();
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveFocus();
  });
});
