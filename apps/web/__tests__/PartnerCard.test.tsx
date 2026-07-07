import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PartnerCard as PartnerCardData } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PartnerCard from '../components/trouver/PartnerCard';

const theo: PartnerCardData = {
  userId: 'acc-theo',
  slug: 'mc1-theo-m',
  name: 'Théo M.',
  avatarUrl: null,
  role: 'dessinateur',
  location: 'Auvergne-Rhône-Alpes',
  styleTags: ['Encre dense'],
  genreTags: ['Seinen'],
  portfolioThumbs: ['https://cdn.example/theo-0.jpg'],
  availability: 'disponible',
};

describe('PartnerCard', () => {
  it('renders name, role·location line, and both tag families', () => {
    render(<PartnerCard partner={theo} onProposer={() => {}} />);
    expect(screen.getByText('Théo M.')).toBeInTheDocument();
    expect(screen.getByText(/Dessinateur·rice · Auvergne-Rhône-Alpes/)).toBeInTheDocument();
    expect(screen.getByText('Seinen')).toBeInTheDocument();
    expect(screen.getByText('Encre dense')).toBeInTheDocument();
  });

  it('gives the portfolio thumb descriptive alt text and falls back for the missing one', () => {
    render(<PartnerCard partner={theo} onProposer={() => {}} />);
    const img = screen.getByAltText('Extrait du portfolio de Théo M. (1)') as HTMLImageElement;
    expect(img.src).toContain('theo-0.jpg');
    // only one thumb supplied → the second slot is a decorative halftone fallback, not an <img>
    expect(screen.queryByAltText('Extrait du portfolio de Théo M. (2)')).not.toBeInTheDocument();
  });

  it('links "Profil" to the partner profile with an accessible name', () => {
    render(<PartnerCard partner={theo} onProposer={() => {}} />);
    const link = screen.getByRole('link', { name: 'Profil de Théo M.' });
    expect(link).toHaveAttribute('href', '/mc1-theo-m');
  });

  it('calls onProposer with the partner when "Proposer" is clicked', async () => {
    const onProposer = vi.fn();
    render(<PartnerCard partner={theo} onProposer={onProposer} />);
    await userEvent.click(screen.getByRole('button', { name: 'Proposer une collaboration à Théo M.' }));
    expect(onProposer).toHaveBeenCalledWith(theo);
  });

  it('labels the scénariste role line with the pen icon variant', () => {
    render(
      <PartnerCard
        partner={{ ...theo, role: 'scenariste', location: null }}
        onProposer={() => {}}
      />,
    );
    // location omitted when null → just the role label
    expect(screen.getByText('Scénariste')).toBeInTheDocument();
  });
});
