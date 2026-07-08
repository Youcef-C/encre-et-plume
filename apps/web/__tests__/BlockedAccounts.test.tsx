import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BlockItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({ getMyBlocks: vi.fn(), deleteBlock: vi.fn() }));

import * as api from '../lib/api';
import BlockedAccounts from '../components/settings/BlockedAccounts';

const blocked: BlockItem = {
  userId: 'u-theo',
  slug: 'theo-m',
  name: 'Théo M.',
  avatarUrl: null,
  kind: 'block',
  createdAt: '2026-03-14T10:00:00.000Z',
};
const muted: BlockItem = {
  userId: 'u-yuki',
  slug: 'yuki-moreau',
  name: 'Yuki Moreau',
  avatarUrl: null,
  kind: 'mute',
  createdAt: '2026-04-02T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.deleteBlock).mockResolvedValue(undefined);
});

describe('BlockedAccounts', () => {
  it('shows a loading state then the empty message', async () => {
    vi.mocked(api.getMyBlocks).mockResolvedValue({ items: [] });
    render(<BlockedAccounts />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('Aucun compte bloqué.')).toBeInTheDocument();
  });

  it('renders a block row with name, French date and a named "Débloquer" action', async () => {
    vi.mocked(api.getMyBlocks).mockResolvedValue({ items: [blocked] });
    render(<BlockedAccounts />);
    expect(await screen.findByRole('link', { name: 'Théo M.' })).toBeInTheDocument();
    expect(screen.getByText(/14\/03\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Débloquer Théo M.' })).toBeInTheDocument();
  });

  it('labels a mute row with "Ne plus masquer"', async () => {
    vi.mocked(api.getMyBlocks).mockResolvedValue({ items: [muted] });
    render(<BlockedAccounts />);
    expect(await screen.findByRole('button', { name: 'Ne plus masquer Yuki Moreau' })).toBeInTheDocument();
  });

  it('removes the row after a successful unblock', async () => {
    vi.mocked(api.getMyBlocks).mockResolvedValue({ items: [blocked] });
    render(<BlockedAccounts />);
    await userEvent.click(await screen.findByRole('button', { name: 'Débloquer Théo M.' }));
    await waitFor(() => expect(api.deleteBlock).toHaveBeenCalledWith('u-theo', 'block'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Théo M.' })).not.toBeInTheDocument());
  });

  it('keeps the row and shows an alert when unblock fails', async () => {
    vi.mocked(api.getMyBlocks).mockResolvedValue({ items: [blocked] });
    vi.mocked(api.deleteBlock).mockRejectedValue({ statusCode: 500, message: 'boom', error: 'ERR' });
    render(<BlockedAccounts />);
    await userEvent.click(await screen.findByRole('button', { name: 'Débloquer Théo M.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de débloquer ce compte. Réessayez.');
    expect(screen.getByRole('link', { name: 'Théo M.' })).toBeInTheDocument();
  });

  it('offers a retry on a load failure', async () => {
    vi.mocked(api.getMyBlocks).mockRejectedValueOnce({ statusCode: 500, message: 'x', error: 'ERR' });
    vi.mocked(api.getMyBlocks).mockResolvedValueOnce({ items: [blocked] });
    render(<BlockedAccounts />);
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('link', { name: 'Théo M.' })).toBeInTheDocument();
  });
});
