import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MesDonnees from '../components/MesDonnees';
import type { DataExportDto } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getDataExport: vi.fn(),
  requestDataExport: vi.fn(),
}));

import * as api from '../lib/api';

const idle: DataExportDto = {
  status: 'idle',
  requestedAt: null,
  readyAt: null,
  expiresAt: null,
  downloadUrl: null,
  expiresIn: null,
};

const pending: DataExportDto = {
  status: 'pending',
  requestedAt: new Date().toISOString(),
  readyAt: null,
  expiresAt: null,
  downloadUrl: null,
  expiresIn: null,
};

const ready: DataExportDto = {
  status: 'ready',
  requestedAt: new Date().toISOString(),
  readyAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  downloadUrl: 'https://s3.example.com/export.zip?sig=xxx',
  expiresIn: 300,
};

const expired: DataExportDto = {
  status: 'expired',
  requestedAt: new Date().toISOString(),
  readyAt: null,
  expiresAt: new Date(Date.now() - 1000).toISOString(),
  downloadUrl: null,
  expiresIn: null,
};

const failed: DataExportDto = {
  status: 'failed',
  requestedAt: new Date().toISOString(),
  readyAt: null,
  expiresAt: null,
  downloadUrl: null,
  expiresIn: null,
};

describe('MesDonnees — export block', () => {
  beforeEach(() => vi.clearAllMocks());

  it('idle: shows "Télécharger mes données" button', async () => {
    vi.mocked(api.getDataExport).mockResolvedValue(idle);
    render(<MesDonnees />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /télécharger mes données/i })).toBeInTheDocument();
    });
  });

  it('click button calls requestDataExport and shows generating message', async () => {
    vi.mocked(api.getDataExport).mockResolvedValue(idle);
    vi.mocked(api.requestDataExport).mockResolvedValue(pending);

    const user = userEvent.setup();
    render(<MesDonnees />);

    await waitFor(() => screen.getByRole('button', { name: /télécharger mes données/i }));
    await user.click(screen.getByRole('button', { name: /télécharger mes données/i }));

    await waitFor(() => {
      expect(api.requestDataExport).toHaveBeenCalledOnce();
      expect(screen.getByText(/export en cours de préparation/i)).toBeInTheDocument();
    });
  });

  it('pending state on mount: shows generating message', async () => {
    vi.mocked(api.getDataExport).mockResolvedValue(pending);
    render(<MesDonnees />);
    await waitFor(() => {
      expect(screen.getByText(/export en cours de préparation/i)).toBeInTheDocument();
      expect(screen.getByText(/vous serez notifié/i)).toBeInTheDocument();
    });
  });

  it('ready state: shows download link with aria-label containing format and expiry', async () => {
    vi.mocked(api.getDataExport).mockResolvedValue(ready);
    render(<MesDonnees />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /télécharger l'archive/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', ready.downloadUrl);
      // aria-label includes .zip format info
      expect(link).toHaveAttribute('aria-label', expect.stringMatching(/zip/i));
    });
  });

  it('ready state: link opens in new tab', async () => {
    vi.mocked(api.getDataExport).mockResolvedValue(ready);
    render(<MesDonnees />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /télécharger l'archive/i });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });
  });

  it('expired state: shows expiry message and request button', async () => {
    vi.mocked(api.getDataExport).mockResolvedValue(expired);
    render(<MesDonnees />);
    await waitFor(() => {
      expect(screen.getByText(/le lien a expiré/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /télécharger mes données/i })).toBeInTheDocument();
    });
  });

  it('failed (error) state: shows error message and retry button', async () => {
    vi.mocked(api.getDataExport).mockResolvedValue(failed);
    render(<MesDonnees />);
    await waitFor(() => {
      expect(screen.getByText(/une erreur est survenue/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /télécharger mes données/i })).toBeInTheDocument();
    });
  });
});
