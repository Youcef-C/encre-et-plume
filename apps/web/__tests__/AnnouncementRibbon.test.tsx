import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Announcement } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import AnnouncementRibbon from '../components/AnnouncementRibbon';

const items: Announcement[] = [
  { id: '1', type: 'concours', label: '« Prix du jeune mangaka 2026 » — clôture dans 30 j', href: '/concours' },
  { id: '2', type: 'a_chaud', label: '« Néon Sutra » dépasse les 8k j’aime', href: '/actualites' },
  { id: '3', type: 'evenement', label: 'sortie « Lames de Brume » Ch.2 vendredi', href: '/actualites' },
];

describe('AnnouncementRibbon', () => {
  it('renders the three French tag labels', () => {
    render(<AnnouncementRibbon items={items} />);
    expect(screen.getByText('Concours')).toBeInTheDocument();
    expect(screen.getByText('À chaud')).toBeInTheDocument();
    expect(screen.getByText('Événement')).toBeInTheDocument();
  });

  it('links each item to its href', () => {
    render(<AnnouncementRibbon items={items} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/concours');
    expect(links[1]).toHaveAttribute('href', '/actualites');
  });

  it('renders nothing when there are no announcements', () => {
    const { container } = render(<AnnouncementRibbon items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
