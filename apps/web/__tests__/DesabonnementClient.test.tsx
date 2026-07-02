import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DesabonnementClient from '../app/desabonnement/DesabonnementClient';

// Mock next/navigation
const mockGet = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

vi.mock('../lib/api', () => ({
  unsubscribe: vi.fn(),
}));

import * as api from '../lib/api';

describe('DesabonnementClient — unsubscribe landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue('valid-token-abc');
  });

  it('calls unsubscribe with the token from query params', async () => {
    vi.mocked(api.unsubscribe).mockResolvedValue({ unsubscribed: true, group: 'Messages' });
    render(<DesabonnementClient />);
    await waitFor(() => {
      expect(api.unsubscribe).toHaveBeenCalledWith('valid-token-abc');
    });
  });

  it('success: shows "Vous ne recevrez plus ces e-mails." message', async () => {
    vi.mocked(api.unsubscribe).mockResolvedValue({ unsubscribed: true, group: 'Messages' });
    render(<DesabonnementClient />);
    await waitFor(() => {
      expect(screen.getByText(/vous ne recevrez plus ces e-mails/i)).toBeInTheDocument();
    });
  });

  it('success: shows link to /parametres with "Gérer mes préférences" label', async () => {
    vi.mocked(api.unsubscribe).mockResolvedValue({ unsubscribed: true, group: 'Messages' });
    render(<DesabonnementClient />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /gérer mes préférences/i });
      expect(link).toHaveAttribute('href', '/parametres');
    });
  });

  it('invalid/expired token: shows a neutral French error message', async () => {
    vi.mocked(api.unsubscribe).mockRejectedValue({ error: 'UNSUBSCRIBE_TOKEN_INVALID', message: 'Token invalide' });
    render(<DesabonnementClient />);
    await waitFor(() => {
      // Error state: shows a message, not the success text
      expect(screen.queryByText(/vous ne recevrez plus ces e-mails/i)).toBeNull();
      // Some error indication present
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('missing token: shows error state without calling API', async () => {
    mockGet.mockReturnValue(null);
    render(<DesabonnementClient />);
    await waitFor(() => {
      expect(api.unsubscribe).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows loading state initially when token is present', () => {
    vi.mocked(api.unsubscribe).mockReturnValue(new Promise(() => {}));
    render(<DesabonnementClient />);
    // Should show loading text before promise resolves
    expect(screen.getByText(/traitement/i)).toBeInTheDocument();
  });
});
