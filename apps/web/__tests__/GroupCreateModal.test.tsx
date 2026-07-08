import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContactItem, ConversationItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getContacts: vi.fn(),
  createConversation: vi.fn(),
}));

import * as api from '../lib/api';
import GroupCreateModal from '../components/messaging/GroupCreateModal';

const contact = (over: Partial<ContactItem> = {}): ContactItem => ({
  userId: 'u-lea',
  slug: 'lea-b',
  name: 'Léa B.',
  avatarUrl: null,
  role: 'dessinateur',
  city: 'Lyon',
  mutualProjects: 0,
  presence: { online: false, lastSeen: null },
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
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getContacts).mockResolvedValue({ items: [contact(), contact({ userId: 'u-noe', name: 'Noé P.', slug: 'noe-p' })] });
  vi.mocked(api.createConversation).mockResolvedValue(createdConv);
});

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

  it('submits { name, participantIds } and reports the created conversation', async () => {
    const onCreated = vi.fn();
    render(<GroupCreateModal onClose={vi.fn()} onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText('Nom du groupe'), 'Projet · Nuit');
    // Open the on-brand multi-select and pick a contact.
    await userEvent.click(await screen.findByRole('button', { name: /^Contacts/ }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Léa B.' }));
    // Selected member shows as a removable chip.
    expect(screen.getByRole('button', { name: /retirer léa b\./i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));

    await waitFor(() =>
      expect(api.createConversation).toHaveBeenCalledWith({ name: 'Projet · Nuit', participantIds: ['u-lea'] }),
    );
    expect(onCreated).toHaveBeenCalledWith(createdConv);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<GroupCreateModal onClose={onClose} onCreated={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
