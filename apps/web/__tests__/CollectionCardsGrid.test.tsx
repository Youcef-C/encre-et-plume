// DR-12 iter2 (FE-8 · V7) — the Galerie "Collections" cards grid: cover + title + artist +
// "N illustrations · collection", each card a focusable link to /oeuvre/:slug; empty / loading /
// error states.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CollectionCard } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import CollectionCardsGrid from '../components/galerie/CollectionCardsGrid';

const cards: CollectionCard[] = [
  { id: 'w1', slug: 'carnet-d-encre', title: "Carnet d'Encre", cover: null, count: 3, artistName: 'Yuki Moreau' },
  { id: 'w2', slug: 'nuits-blanches', title: 'Nuits Blanches', cover: 'https://cdn/x.jpg', count: 1, artistName: 'Léo Sato' },
];

describe('CollectionCardsGrid (DR-12 iter2 FE-8)', () => {
  it('renders each collection as a focusable link to its œuvre page with title, artist and count', () => {
    render(<CollectionCardsGrid state="ready" items={cards} onRetry={() => {}} />);

    const link = screen.getByRole('link', { name: /Carnet d'Encre/ });
    expect(link).toHaveAttribute('href', '/oeuvre/carnet-d-encre');
    expect(screen.getByText('Yuki Moreau')).toBeInTheDocument();
    expect(screen.getByText('3 illustrations · collection')).toBeInTheDocument();
    // singular
    expect(screen.getByText('1 illustration · collection')).toBeInTheDocument();
  });

  it('shows the empty state "Aucune collection"', () => {
    render(<CollectionCardsGrid state="empty" items={[]} onRetry={() => {}} />);
    expect(screen.getByText('Aucune collection')).toBeInTheDocument();
  });

  it('shows a loading skeleton', () => {
    render(<CollectionCardsGrid state="loading" items={[]} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error with a retry button', () => {
    const onRetry = vi.fn();
    render(<CollectionCardsGrid state="error" items={[]} onRetry={onRetry} />);
    screen.getByRole('button', { name: 'Réessayer' }).click();
    expect(onRetry).toHaveBeenCalled();
  });
});
