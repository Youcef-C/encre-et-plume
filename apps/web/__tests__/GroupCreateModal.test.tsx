import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReachableUser, ConversationItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  searchAccounts: vi.fn(),
  createConversation: vi.fn(),
}));

import * as api from '../lib/api';
import GroupCreateModal from '../components/messaging/GroupCreateModal';

const user = (over: Partial<ReachableUser> = {}): ReachableUser => ({
  id: 'u-lea',
  name: 'Léa B.',
  avatarUrl: null,
  slug: 'lea-b',
  ...over,
});

const createdConv: ConversationItem = {
  id: 'g-new',
  type: 'group',
  name: 'Projet · Nuit',
  projectId: null,
  participants: [],
  unreadCount: 0,
  lastMessage: null,
  lastMessageAt: '2026-07-08T10:00:00.000Z',
  status: 'open',
  requestedBy: null,
  createdBy: 'me-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.searchAccounts).mockResolvedValue({ items: [user()] });
  vi.mocked(api.createConversation).mockResolvedValue(createdConv);
});

async function pickLea() {
  await userEvent.type(screen.getByRole('combobox', { name: 'Ajouter un·e participant·e' }), 'lea');
  await userEvent.click(await screen.findByRole('option', { name: /Léa B\./ }));
}

describe('GroupCreateModal', () => {
  it('requires a group name', async () => {
    render(<GroupCreateModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(await screen.findByText('Le nom est requis.')).toBeInTheDocument();
    expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('requires at least one participant', async () => {
    render(<GroupCreateModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nom du groupe'), 'Projet · Nuit');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(await screen.findByText('Ajoutez au moins un·e participant·e.')).toBeInTheDocument();
    expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('search-picks a reachable user, shows a removable chip, and submits participantIds', async () => {
    const onCreated = vi.fn();
    render(<GroupCreateModal onClose={vi.fn()} onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText('Nom du groupe'), 'Projet · Nuit');
    await pickLea();
    // Selected member shows as a removable chip.
    expect(screen.getByRole('button', { name: 'Retirer Léa B.' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    await waitFor(() =>
      expect(api.createConversation).toHaveBeenCalledWith({ name: 'Projet · Nuit', participantIds: ['u-lea'] }),
    );
    expect(onCreated).toHaveBeenCalledWith(createdConv);
  });

  it('removes a chip', async () => {
    render(<GroupCreateModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await pickLea();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Léa B.' }));
    expect(screen.queryByRole('button', { name: 'Retirer Léa B.' })).not.toBeInTheDocument();
  });

  it('excludes an already-picked user from further suggestions', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({
      items: [user(), user({ id: 'u-noe', name: 'Noé P.', slug: 'noe-p' })],
    });
    render(<GroupCreateModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await pickLea();
    await userEvent.type(screen.getByRole('combobox', { name: 'Ajouter un·e participant·e' }), 'e');
    expect(await screen.findByRole('option', { name: /Noé P\./ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Léa B\./ })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<GroupCreateModal onClose={onClose} onCreated={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
