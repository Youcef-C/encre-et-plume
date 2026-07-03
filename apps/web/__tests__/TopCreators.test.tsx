import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TopCreatorsResponse } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import TopCreators from '../components/TopCreators';

const data: TopCreatorsResponse = {
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', avatar: null, role: 'dessinateur' },
  scenarist: { id: 's1', name: 'Camille Roux', slug: 'dr1-camille-roux', avatar: null, role: 'scenariste' },
};

describe('TopCreators', () => {
  it('renders both card headers verbatim', () => {
    render(<TopCreators data={data} />);
    expect(screen.getByText('Top artiste du moment')).toBeInTheDocument();
    expect(screen.getByText('Top scénariste du moment')).toBeInTheDocument();
  });

  it('renders both creator names', () => {
    render(<TopCreators data={data} />);
    expect(screen.getByText('Yuki Moreau')).toBeInTheDocument();
    expect(screen.getByText('Camille Roux')).toBeInTheDocument();
  });

  it('links each card to the creator profile', () => {
    render(<TopCreators data={data} />);
    expect(screen.getByText('Yuki Moreau').closest('a')).toHaveAttribute('href', '/dr1-yuki-moreau');
    expect(screen.getByText('Camille Roux').closest('a')).toHaveAttribute('href', '/dr1-camille-roux');
  });

  it('shows an empty-state message when a role has no creator', () => {
    render(<TopCreators data={{ artist: null, scenarist: null }} />);
    expect(screen.getAllByText(/pas encore de créateur/i)).toHaveLength(2);
  });
});
