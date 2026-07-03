import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkCreatorDto, FundingGoalDto } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { TeamSidebar, DetailsSidebar, SupportCard, FundingGoals } from '../components/oeuvre/Sidebar';

const team: WorkCreatorDto[] = [
  { id: 'c1', name: 'Camille Roux', slug: 'camille-roux', role: 'scenariste', city: 'Lyon', avatar: null },
  { id: 'c2', name: 'Yuki Moreau', slug: 'yuki-moreau', role: 'dessinateur', city: null, avatar: null },
];

const goals: FundingGoalDto[] = [
  { id: 'g1', title: 'Impression papier', currentCents: 45000, targetCents: 60000, pct: 75 },
];

describe('TeamSidebar (DR-3 FE-7)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders each member with role, city, and links to their profile', () => {
    render(<TeamSidebar team={team} account={null} />);
    expect(screen.getByText('Camille Roux')).toBeInTheDocument();
    expect(screen.getByText(/Scénariste.*Lyon/)).toBeInTheDocument();
    expect(screen.getByText('Yuki Moreau').closest('a')).toHaveAttribute('href', '/yuki-moreau');
  });

  it('omits the city when null', () => {
    render(<TeamSidebar team={team} account={null} />);
    expect(screen.queryByText(/Dessinateur.*·.*null/)).not.toBeInTheDocument();
  });

  it('anonymous clicking "Suivre" redirects to /connexion', async () => {
    const user = userEvent.setup();
    render(<TeamSidebar team={team} account={null} />);
    await user.click(screen.getAllByRole('button', { name: 'Suivre' })[0]!);
    expect(push).toHaveBeenCalledWith('/connexion');
  });
});

describe('DetailsSidebar (DR-3 FE-7)', () => {
  it('renders type, status, chapter count, public, and release year', () => {
    render(<DetailsSidebar format="Manga" complete chapterCount={12} audienceRating="16+" publishedAt="2024-03-14T00:00:00.000Z" />);
    expect(screen.getByText('Manga')).toBeInTheDocument();
    expect(screen.getByText('Terminé')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('16+')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('shows "En cours" when not complete', () => {
    render(<DetailsSidebar format="Manga" complete={false} chapterCount={3} audienceRating="12+" publishedAt={null} />);
    expect(screen.getByText('En cours')).toBeInTheDocument();
  });
});

describe('SupportCard (DR-3 FE-7)', () => {
  it('anonymous clicking Soutenir redirects to /connexion', async () => {
    const user = userEvent.setup();
    render(<SupportCard account={null} />);
    await user.click(screen.getByText(/Soutenir · à partir de 3/));
    expect(push).toHaveBeenCalledWith('/connexion');
  });
});

describe('FundingGoals (DR-3 FE-7)', () => {
  it('renders a progress bar exposing value/max and the pct label', () => {
    render(<FundingGoals goals={goals} />);
    expect(screen.getByText('Impression papier')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '75');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('450 € / 600 € par mois')).toBeInTheDocument();
  });

  it('hides the card when there are no goals', () => {
    const { container } = render(<FundingGoals goals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
