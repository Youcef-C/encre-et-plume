import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { PortfolioItemResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getProfile: vi.fn(),
  getProfilePortfolio: vi.fn(),
  updateMyProfile: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

import { getProfilePortfolio } from '../lib/api';
import PortfolioGrid from '../components/PortfolioGrid';

const mockItems: PortfolioItemResponse[] = [
  { id: '1', image: 'https://example.com/img1.jpg', caption: 'Planche 1', order: 0 },
  { id: '2', image: 'https://example.com/img2.jpg', caption: null, order: 1 },
  { id: '3', image: 'https://example.com/img3.jpg', caption: 'Planche 3', order: 2 },
];

describe('PortfolioGrid', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows loading state on mount', async () => {
    // Freeze in loading state
    vi.mocked(getProfilePortfolio).mockReturnValue(new Promise(() => {}));
    render(<PortfolioGrid slug="yuki-moreau" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state "Aucune œuvre pour l\'instant" when no items', async () => {
    vi.mocked(getProfilePortfolio).mockResolvedValue([]);
    render(<PortfolioGrid slug="yuki-moreau" />);
    expect(await screen.findByText(/aucune œuvre pour l'instant/i)).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(getProfilePortfolio).mockRejectedValue({ statusCode: 500, message: 'Erreur', error: 'SERVER_ERROR' });
    render(<PortfolioGrid slug="yuki-moreau" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('renders portfolio items in a grid', async () => {
    vi.mocked(getProfilePortfolio).mockResolvedValue(mockItems);
    render(<PortfolioGrid slug="yuki-moreau" />);
    // Grid should have 3 images
    const images = await screen.findAllByRole('img');
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveAttribute('src', 'https://example.com/img1.jpg');
  });

  it('shows caption for items that have one', async () => {
    vi.mocked(getProfilePortfolio).mockResolvedValue(mockItems);
    render(<PortfolioGrid slug="yuki-moreau" />);
    expect(await screen.findByText('Planche 1')).toBeInTheDocument();
    expect(await screen.findByText('Planche 3')).toBeInTheDocument();
  });
});
