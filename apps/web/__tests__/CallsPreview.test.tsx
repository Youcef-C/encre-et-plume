import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CallPreview } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import CallsPreview from '../components/trouver/CallsPreview';

const calls: CallPreview[] = [
  {
    id: 'call-1',
    heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
    title: '« Lames de Brume »',
    tags: ['Seinen', 'Thriller'],
    authorName: 'Camille R.',
    closesInDays: 12,
    applicationCount: 0,
  },
  {
    id: 'call-2',
    heading: 'DESSINATEUR CHERCHE SCÉNARISTE',
    title: 'One-shot fantastique',
    tags: ['Fantastique', 'One-shot'],
    authorName: 'Théo M.',
    closesInDays: null,
    applicationCount: 5,
  },
];

describe('CallsPreview', () => {
  it('renders the heading and the "Voir tous les appels" link to /appels', () => {
    render(<CallsPreview calls={calls} />);
    expect(screen.getByRole('heading', { name: 'Appels à projets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir tous les appels →' })).toHaveAttribute('href', '/appels');
  });

  it('shows the call heading, title, and close-date meta', () => {
    render(<CallsPreview calls={calls} />);
    expect(screen.getByText('SCÉNARISTE CHERCHE DESSINATEUR·RICE')).toBeInTheDocument();
    expect(screen.getByText('« Lames de Brume »')).toBeInTheDocument();
    expect(screen.getByText('Clôture 12 j')).toBeInTheDocument();
  });

  it('falls back to the application count when no close date is set', () => {
    render(<CallsPreview calls={calls} />);
    expect(screen.getByText('5 candidatures')).toBeInTheDocument();
  });

  it('keeps the heading and link but hides the grid when there are no calls', () => {
    render(<CallsPreview calls={[]} />);
    expect(screen.getByRole('heading', { name: 'Appels à projets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir tous les appels →' })).toBeInTheDocument();
    expect(screen.queryByText('« Lames de Brume »')).not.toBeInTheDocument();
  });
});
