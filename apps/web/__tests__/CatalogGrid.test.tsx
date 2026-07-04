import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogWorkCard } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import CatalogGrid from '../components/catalog/CatalogGrid';

const items: CatalogWorkCard[] = [
  { id: '1', slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen', chapterCount: 12, likeCount: 3400, complete: true, format: 'Manga', cover: null, is18plus: false },
  { id: '2', slug: 'neon-sutra', title: 'Néon Sutra', genre: 'Shōnen', chapterCount: 20, likeCount: 8100, complete: false, format: 'Manga', cover: null, is18plus: false },
];

describe('CatalogGrid (DR-2 FE-6)', () => {
  it('renders a card per item in a 3-col grid', () => {
    render(<CatalogGrid state="ready" items={items} onReset={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText('Lames de Brume')).toBeInTheDocument();
    expect(screen.getByText('Néon Sutra')).toBeInTheDocument();
  });

  it('renders a loading skeleton grid (F16)', () => {
    render(<CatalogGrid state="loading" items={[]} onReset={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an empty state with a "Réinitialiser" affordance (F16)', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<CatalogGrid state="empty" items={[]} onReset={onReset} onRetry={vi.fn()} />);
    expect(screen.getByText(/aucun résultat/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('renders an error state with a "Réessayer" retry (F16)', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<CatalogGrid state="error" items={[]} onReset={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
