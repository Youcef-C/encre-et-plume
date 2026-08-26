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

  // DR-14: a 500 is transient (retried behind the skeleton); only a terminal 4xx shows the block.
  it('shows error message with a « Réessayer » on a terminal fetch failure (F16)', async () => {
    vi.mocked(getProfilePortfolio).mockRejectedValue({ statusCode: 403, message: 'Interdit', error: 'FORBIDDEN' });
    render(<PortfolioGrid slug="yuki-moreau" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  // DR-14 F1 — a 5xx keeps the skeleton (and it animates now: .ep-skeleton-delayed, F16) and retries.
  it('keeps the skeleton and retries on a transient failure', async () => {
    vi.mocked(getProfilePortfolio)
      .mockRejectedValueOnce({ statusCode: 500, message: 'Erreur', error: 'SERVER_ERROR' })
      .mockResolvedValue([]);
    render(<PortfolioGrid slug="yuki-moreau" />);
    expect(await screen.findByLabelText('Chargement du portfolio…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByText(/aucune œuvre pour l'instant/i)).toBeInTheDocument();
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
