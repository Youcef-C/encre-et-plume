import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReachableUser, ConversationItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  searchAccounts: vi.fn(),
  createConversation: vi.fn(),
}));

// The modal starts a 1:1 through the provider's openDm (POST /conversations { participantId }) so the
// DM policy + block rules stay on the one server path; stub the hook, not the endpoint.
const openDm = vi.fn<(userId: string) => Promise<string | null>>();
vi.mock('../lib/messaging', () => ({ useMessaging: () => ({ openDm }) }));

import * as api from '../lib/api';
import NewConversationModal from '../components/messaging/NewConversationModal';

const user = (over: Partial<ReachableUser> = {}): ReachableUser => ({
  id: 'u-lea',
  name: 'Léa B.',
  avatarUrl: null,
  slug: 'lea-b',
  ...over,
});

const noe = user({ id: 'u-noe', name: 'Noé P.', slug: 'noe-p' });

const createdConv: ConversationItem = {
  id: 'g-new',
  type: 'group',
  name: 'Léa B., Noé P.',
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
  vi.mocked(api.searchAccounts).mockResolvedValue({ items: [user(), noe] });
  vi.mocked(api.createConversation).mockResolvedValue(createdConv);
  openDm.mockResolvedValue(null);
});

async function pick(name: RegExp) {
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('NewConversationModal — one flow, 1 person = DM / 2+ = group', () => {
  it('starts a DM through openDm when exactly one person is picked (no group POST)', async () => {
    const onClose = vi.fn();
    render(<NewConversationModal onClose={onClose} onCreated={vi.fn()} />);
    await pick(/Léa B\./);

    await userEvent.click(screen.getByRole('button', { name: 'Démarrer la conversation' }));
    await waitFor(() => expect(openDm).toHaveBeenCalledWith('u-lea'));
    expect(api.createConversation).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a group WITHOUT a name when two people are picked and the name is left blank', async () => {
    const onCreated = vi.fn();
    render(<NewConversationModal onClose={vi.fn()} onCreated={onCreated} />);
    await pick(/Léa B\./);
    await pick(/Noé P\./);

    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    await waitFor(() =>
      expect(api.createConversation).toHaveBeenCalledWith({ participantIds: ['u-lea', 'u-noe'] }),
    );
    expect(onCreated).toHaveBeenCalledWith(createdConv);
  });

  it('sends the optional name when one is typed', async () => {
    render(<NewConversationModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await pick(/Léa B\./);
    await pick(/Noé P\./);
    await userEvent.type(screen.getByLabelText('Nom du groupe (facultatif)'), 'Projet · Nuit');

    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    await waitFor(() =>
      expect(api.createConversation).toHaveBeenCalledWith({
        name: 'Projet · Nuit',
        participantIds: ['u-lea', 'u-noe'],
      }),
    );
  });

  it('only offers the group-name field once it is a group (2+ people)', async () => {
    render(<NewConversationModal onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByLabelText('Nom du groupe (facultatif)')).not.toBeInTheDocument();
    await pick(/Léa B\./);
    expect(screen.queryByLabelText('Nom du groupe (facultatif)')).not.toBeInTheDocument();
    await pick(/Noé P\./);
    expect(screen.getByLabelText('Nom du groupe (facultatif)')).toBeInTheDocument();
  });

  it('requires at least one person', async () => {
    render(<NewConversationModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Démarrer la conversation' }));
    expect(await screen.findByText('Ajoutez au moins une personne.')).toBeInTheDocument();
    expect(openDm).not.toHaveBeenCalled();
    expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('surfaces the server refusal of a DM instead of closing', async () => {
    openDm.mockResolvedValue("Ce membre n'accepte que les messages de ses contacts.");
    const onClose = vi.fn();
    render(<NewConversationModal onClose={onClose} onCreated={vi.fn()} />);
    await pick(/Léa B\./);
    await userEvent.click(screen.getByRole('button', { name: 'Démarrer la conversation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Ce membre n'accepte que les messages de ses contacts.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a removable chip per picked person and excludes them from further suggestions', async () => {
    render(<NewConversationModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await pick(/Léa B\./);
    expect(screen.getByRole('button', { name: 'Retirer Léa B.' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Léa B\./ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retirer Léa B.' }));
    expect(screen.queryByRole('button', { name: 'Retirer Léa B.' })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<NewConversationModal onClose={onClose} onCreated={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
