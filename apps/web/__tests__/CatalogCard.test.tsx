import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CatalogWorkCard } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import CatalogCard from '../components/catalog/CatalogCard';

const base: CatalogWorkCard = {
  id: '1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  genre: 'Seinen',
  chapterCount: 12,
  likeCount: 3400,
  complete: true,
  format: 'Manga',
  cover: null,
  is18plus: false,
};

describe('CatalogCard (DR-2 FE-6)', () => {
  it('links to /oeuvre/[slug] (F14)', () => {
    render(<CatalogCard work={base} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/oeuvre/lames-de-brume');
  });

  it('renders title, genre, chapter count and formatted ♥ count', () => {
    render(<CatalogCard work={base} />);
    expect(screen.getByText('Lames de Brume')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent(/Seinen.*12 ch\..*3,4k/);
  });

  it('shows the "Complet" badge when complete', () => {
    render(<CatalogCard work={base} />);
    expect(screen.getByText(/Complet/)).toBeInTheDocument();
  });

  it('hides the "Complet" badge when not complete', () => {
    render(<CatalogCard work={{ ...base, complete: false }} />);
    expect(screen.queryByText(/Complet/)).not.toBeInTheDocument();
  });

  it('shows the "Roman" badge for roman format', () => {
    render(<CatalogCard work={{ ...base, format: 'Roman' }} />);
    expect(screen.getByText('Roman')).toBeInTheDocument();
  });

  it('hides the "Roman" badge for other formats', () => {
    render(<CatalogCard work={base} />);
    expect(screen.queryByText('Roman')).not.toBeInTheDocument();
  });

  // ── DR-10: 18+ blur + badge ──────────────────────────────────────────────────

  it('blurs the cover and shows an "18+" badge for an 18+ work (anon viewer, never cleared)', () => {
    render(<CatalogCard work={{ ...base, is18plus: true }} />);
    expect(screen.getByLabelText('Œuvre 18+')).toBeInTheDocument();
  });

  it('does not blur or badge a non-18+ work', () => {
    render(<CatalogCard work={base} />);
    expect(screen.queryByLabelText('Œuvre 18+')).not.toBeInTheDocument();
  });

  // QA round-1 regression: the 18+ overlay must never change the cover box's own declared
  // height/width, or its title/meta siblings shift into the next grid row.
  it('QA round-1 regression: the cover box keeps its exact 212px height when is18plus (no stretch)', () => {
    render(<CatalogCard work={{ ...base, is18plus: true }} />);
    expect(screen.getByTestId('catalog-cover')).toHaveStyle({ height: '212px' });
  });

  it('the cover box is the Link\'s direct first child (Cover18Overlay adds no wrapping element)', () => {
    render(<CatalogCard work={{ ...base, is18plus: true }} />);
    const link = screen.getByRole('link');
    expect(link.firstElementChild).toBe(screen.getByTestId('catalog-cover'));
  });
});
