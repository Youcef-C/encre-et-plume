import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ScheduledRelease } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import ScheduledReleases from '../components/ScheduledReleases';

const now = new Date('2026-06-18T00:00:00.000Z');
const items: ScheduledRelease[] = [
  { id: 'c1', workId: 'w1', workSlug: 'lames-de-brume', workTitle: 'Lames de Brume', chapterNumber: 2, genre: 'Seinen', releaseAt: '2026-06-19T18:00:00.000Z' },
  { id: 'c2', workId: 'w2', workSlug: 'onibi', workTitle: 'Onibi', chapterNumber: 7, genre: 'Fantastique', releaseAt: '2026-06-22T12:00:00.000Z' },
];

describe('ScheduledReleases', () => {
  it('renders the header and "Calendrier →" link', () => {
    render(<ScheduledReleases items={items} now={now} />);
    expect(screen.getByText('Sorties programmées')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendrier/i })).toHaveAttribute('href', '/calendrier');
  });

  it('renders date label, chapter, genre and countdown', () => {
    render(<ScheduledReleases items={items} now={now} />);
    expect(screen.getByText('VEN. 19 JUIN · 18:00')).toBeInTheDocument();
    expect(screen.getByText('Lames de Brume')).toBeInTheDocument();
    expect(screen.getByText('Ch. 2 · Seinen')).toBeInTheDocument();
    expect(screen.getByText(/dans 2 j/)).toBeInTheDocument();
  });

  it('each card links to the work page', () => {
    render(<ScheduledReleases items={items} now={now} />);
    expect(screen.getByText('Onibi').closest('a')).toHaveAttribute('href', '/oeuvre/onibi');
  });

  it('shows an empty-state message when there is nothing scheduled', () => {
    render(<ScheduledReleases items={[]} now={now} />);
    expect(screen.getByText(/aucune sortie programmée/i)).toBeInTheDocument();
  });
});
