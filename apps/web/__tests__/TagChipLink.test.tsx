// F-22 — on-brand chip rendered as a real Next <Link> (GenreChip is remove-only, not a link).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import TagChipLink from '../components/TagChipLink';

describe('TagChipLink (F-22)', () => {
  it('renders a link with the href, visible label and accessible name', () => {
    render(<TagChipLink href="/decouvrir?genre=seinen" label="Seinen" ariaLabel="Filtrer par Seinen" />);
    const link = screen.getByRole('link', { name: 'Filtrer par Seinen' });
    expect(link).toHaveAttribute('href', '/decouvrir?genre=seinen');
    expect(link).toHaveTextContent('Seinen');
  });
});
