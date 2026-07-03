import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PlancheDto } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import PlancheGrid from '../components/oeuvre/PlancheGrid';

const planches: PlancheDto[] = [
  { id: 'p1', image: null, caption: 'Planche 1' },
  { id: 'p2', image: null, caption: 'Planche 2' },
];

describe('PlancheGrid (DR-3 FE-5)', () => {
  it('renders a 3-col grid of planche tiles linking to the illustration detail route', () => {
    render(<PlancheGrid planches={planches} />);
    expect(screen.getByText('Illustrations & planches')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/illustration/p1');
  });

  it('hides the whole section when planches is empty', () => {
    const { container } = render(<PlancheGrid planches={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
