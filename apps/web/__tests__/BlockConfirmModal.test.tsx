import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/api', () => ({ createBlock: vi.fn() }));

import * as api from '../lib/api';
import BlockConfirmModal from '../components/blocks/BlockConfirmModal';

const user = { userId: 'u-theo', name: 'Théo M.' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.createBlock).mockResolvedValue({ id: 'b1', userId: 'u-theo', kind: 'block', createdAt: '2026-07-08T10:00:00.000Z' });
});

describe('BlockConfirmModal', () => {
  it('names the target and shows the verbatim effects copy', () => {
    render(<BlockConfirmModal user={user} onClose={vi.fn()} onBlocked={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /bloquer théo m\./i })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cette personne ne pourra plus vous envoyer de messages, d'invitations ni de demandes de contact. Vous ne verrez plus ses commentaires.",
      ),
    ).toBeInTheDocument();
  });

  it('"Annuler" closes without calling the API', async () => {
    const onClose = vi.fn();
    render(<BlockConfirmModal user={user} onClose={onClose} onBlocked={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalled();
    expect(api.createBlock).not.toHaveBeenCalled();
  });

  it('"Bloquer" posts { userId, kind: block } and calls onBlocked', async () => {
    const onBlocked = vi.fn();
    render(<BlockConfirmModal user={user} onClose={vi.fn()} onBlocked={onBlocked} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bloquer' }));
    await waitFor(() => expect(api.createBlock).toHaveBeenCalledWith({ userId: 'u-theo', kind: 'block' }));
    expect(onBlocked).toHaveBeenCalled();
  });

  it('surfaces the API error message on failure', async () => {
    vi.mocked(api.createBlock).mockRejectedValue({ statusCode: 400, message: 'Vous ne pouvez pas vous bloquer vous-même.', error: 'BAD_REQUEST' });
    render(<BlockConfirmModal user={user} onClose={vi.fn()} onBlocked={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bloquer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vous ne pouvez pas vous bloquer vous-même.');
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<BlockConfirmModal user={user} onClose={onClose} onBlocked={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
