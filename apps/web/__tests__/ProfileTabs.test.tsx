import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/api', () => ({
  getProfile: vi.fn(),
  getProfilePortfolio: vi.fn().mockResolvedValue([]),
  updateMyProfile: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

import ProfileTabs from '../components/ProfileTabs';

describe('ProfileTabs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has role="tablist" with aria-label="Sections du profil"', () => {
    render(<ProfileTabs slug="yuki" bio={null} />);
    expect(
      screen.getByRole('tablist', { name: /sections du profil/i })
    ).toBeInTheDocument();
  });

  it('renders 4 tabs', () => {
    render(<ProfileTabs slug="yuki" bio={null} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
  });

  it('Portfolio tab is selected by default', () => {
    render(<ProfileTabs slug="yuki" bio={null} />);
    expect(screen.getByRole('tab', { name: 'Portfolio' })).toHaveAttribute('aria-selected', 'true');
  });

  it('other tabs are not selected by default', () => {
    render(<ProfileTabs slug="yuki" bio={null} />);
    const oeuvresTab = screen.getByRole('tab', { name: /œuvres publiées/i });
    const avisTab = screen.getByRole('tab', { name: /avis/i });
    expect(oeuvresTab).toHaveAttribute('aria-selected', 'false');
    expect(avisTab).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a tab selects it', async () => {
    const user = userEvent.setup();
    render(<ProfileTabs slug="yuki" bio={null} />);
    const avisTab = screen.getByRole('tab', { name: /avis/i });
    await user.click(avisTab);
    expect(avisTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Portfolio' })).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowRight moves to next tab', async () => {
    const user = userEvent.setup();
    render(<ProfileTabs slug="yuki" bio={null} />);
    const portfolioTab = screen.getByRole('tab', { name: 'Portfolio' });
    portfolioTab.focus();
    await user.keyboard('{ArrowRight}');
    const oeuvresTab = screen.getByRole('tab', { name: /œuvres publiées/i });
    expect(oeuvresTab).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft wraps around to last tab from first', async () => {
    const user = userEvent.setup();
    render(<ProfileTabs slug="yuki" bio={null} />);
    const portfolioTab = screen.getByRole('tab', { name: 'Portfolio' });
    portfolioTab.focus();
    await user.keyboard('{ArrowLeft}');
    const avisTab = screen.getByRole('tab', { name: /avis/i });
    expect(avisTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders "À propos" tab content with bio when provided', async () => {
    const user = userEvent.setup();
    render(<ProfileTabs slug="yuki" bio="Ma biographie de test." />);
    await user.click(screen.getByRole('tab', { name: /à propos/i }));
    expect(screen.getByText('Ma biographie de test.')).toBeInTheDocument();
  });

  it('renders "Œuvres publiées" tab as placeholder "À venir"', async () => {
    const user = userEvent.setup();
    render(<ProfileTabs slug="yuki" bio={null} />);
    await user.click(screen.getByRole('tab', { name: /œuvres publiées/i }));
    expect(screen.getByText('À venir')).toBeInTheDocument();
  });
});
