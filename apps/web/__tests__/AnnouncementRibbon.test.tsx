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
  it('renders the three French tag labels (duplicated for the marquee loop)', () => {
    render(<AnnouncementRibbon items={items} />);
    // The scrolling track holds two copies of the list; the second is aria-hidden.
    expect(screen.getAllByText('Concours')).toHaveLength(2);
    expect(screen.getAllByText('À chaud')).toHaveLength(2);
    expect(screen.getAllByText('Événement')).toHaveLength(2);
  });

  it('scrolls via the marquee track, second copy hidden from a11y tree', () => {
    const { container } = render(<AnnouncementRibbon items={items} />);
    const track = container.querySelector('.ep-ribbon-track');
    expect(track).not.toBeNull();
    expect(track!.querySelectorAll('[aria-hidden="true"] a')).toHaveLength(items.length);
    // Only the visible copy's links are reachable by role.
    expect(screen.getAllByRole('link')).toHaveLength(items.length);
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
