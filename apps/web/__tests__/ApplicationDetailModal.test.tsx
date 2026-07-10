import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyApplicationRow } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getMyApplication: vi.fn(),
}));

import * as api from '../lib/api';
import ApplicationDetailModal from '../components/candidatures/ApplicationDetailModal';

const row = (over: Partial<MyApplicationRow> = {}): MyApplicationRow => ({
  id: 'app-1',
  callId: 'call-1',
  callTitle: '« Lames de Brume »',
  callDirection: 'writerSeeksIllustrator',
  callGenres: ['seinen'],
  callSampleUrl: null,
  ownerName: 'Camille R.',
  status: 'pending',
  appliedAs: null,
  samples: [],
  createdAt: '2026-06-18T10:00:00.000Z',
  ...over,
});

const getDetail = () => api.getMyApplication as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('ApplicationDetailModal (MC-6 view)', () => {
  it('shows a loading status then the fetched message + samples', async () => {
    let resolve!: (r: MyApplicationRow) => void;
    getDetail().mockReturnValue(new Promise<MyApplicationRow>((r) => (resolve = r)));
    render(<ApplicationDetailModal applicationId="app-1" callTitle="« Lames de Brume »" onClose={vi.fn()} />);

    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
    resolve(
      row({
        message: 'Mon message détaillé.',
        samples: [
          { url: 'https://cdn/img.jpg', kind: 'image', size: null },
          { url: 'https://cdn/doc.pdf', kind: 'document', size: 512_000 },
        ],
      }),
    );

    expect(await screen.findByText('Mon message détaillé.')).toBeInTheDocument();
    expect(getDetail()).toHaveBeenCalledWith('app-1');
    // Image sample opens in a new tab; document renders as a PDF link with a size.
    const img = screen.getByRole('link', { name: /Voir l'échantillon 1/ });
    expect(img).toHaveAttribute('href', 'https://cdn/img.jpg');
    expect(img).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /Ouvrir le document 2/ })).toHaveTextContent(/PDF · 500,0 Ko/);
  });

  it('shows a fallback when there is no message', async () => {
    getDetail().mockResolvedValue(row({ message: '' }));
    render(<ApplicationDetailModal applicationId="app-1" callTitle="« Lames de Brume »" onClose={vi.fn()} />);
    expect(await screen.findByText('Aucun message.')).toBeInTheDocument();
  });

  it('renders an error state with a working retry', async () => {
    getDetail().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(row({ message: 'OK.' }));
    const user = userEvent.setup();
    render(<ApplicationDetailModal applicationId="app-1" callTitle="« Lames de Brume »" onClose={vi.fn()} />);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('OK.')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    getDetail().mockResolvedValue(row({ message: 'OK.' }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ApplicationDetailModal applicationId="app-1" callTitle="« Lames de Brume »" onClose={onClose} />);
    await screen.findByText('OK.');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
