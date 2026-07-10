import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ConversationItem } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// ── socket.io-client mock: an event bus we can fire from the test (same style as MessagingWidget). ──
const handlers: Record<string, (p?: unknown) => void> = {};
const mockSocket = {
  on: (event: string, h: (p?: unknown) => void) => {
    handlers[event] = h;
  },
  emit: vi.fn(),
  disconnect: vi.fn(),
};
function fire(event: string, payload?: unknown) {
  return act(() => {
    handlers[event]?.(payload);
  });
}
vi.mock('socket.io-client', () => ({ io: () => mockSocket }));

const refreshUnread = vi.fn();
vi.mock('../lib/unread', () => ({
  useUnreadCounts: () => ({ counts: { total: 0, messages: 0, demandes: 0, signalements: 0 }, refresh: refreshUnread }),
}));

vi.mock('../lib/api', () => ({
  getConversations: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  markConversationRead: vi.fn(),
  createConversation: vi.fn(),
  respondConversationRequest: vi.fn(),
  getMediaSignedUrl: vi.fn(),
  getPresence: vi.fn(),
  getContacts: vi.fn(),
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
  getMyBlocks: vi.fn().mockResolvedValue({ items: [] }),
  deleteBlock: vi.fn().mockResolvedValue(undefined),
  addGroupParticipant: vi.fn(),
  removeGroupParticipant: vi.fn(),
  leaveGroup: vi.fn(),
}));

import * as api from '../lib/api';
import { MessagingProvider } from '../lib/messaging';
import MessagingWidget from '../components/messaging/MessagingWidget';

const account: AccountSummary = {
  id: 'me-1',
  displayName: 'Camille R.',
  email: 'camille@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-r',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const members = [
  { userId: 'me-1', slug: 'camille-r', name: 'Camille R.', avatarUrl: null },
  { userId: 'u-yuki', slug: 'yuki', name: 'Yuki Moreau', avatarUrl: null },
  { userId: 'u-noa', slug: 'noa-t', name: 'Noa T.', avatarUrl: null },
];

// Standalone group (projectId === null) where I am the creator.
const ownedGroup: ConversationItem = {
  id: 'g1',
  type: 'group',
  name: 'Lames de Brume',
  projectId: null,
  participants: members,
  unreadCount: 0,
  lastMessage: { body: 'ok', senderName: 'Yuki', createdAt: '2026-07-08T10:00:00.000Z' },
  lastMessageAt: '2026-07-08T10:00:00.000Z',
  status: 'open',
  requestedBy: null,
  createdBy: 'me-1',
};

// Standalone group where someone else owns it (I'm a plain member).
const memberGroup: ConversationItem = { ...ownedGroup, id: 'g2', createdBy: 'u-yuki' };

// Project-linked group (projectId != null) — MC-12 management is out of scope here.
const projectGroup: ConversationItem = { ...ownedGroup, id: 'g3', projectId: 'proj-1', name: 'Projet · Kaze' };

const dmConv: ConversationItem = {
  id: 'd1',
  type: 'dm',
  name: 'Léa B.',
  projectId: null,
  participants: [
    { userId: 'me-1', slug: 'camille-r', name: 'Camille R.', avatarUrl: null },
    { userId: 'u-lea', slug: 'lea-b', name: 'Léa B.', avatarUrl: null },
  ],
  unreadCount: 0,
  lastMessage: { body: 'salut', senderName: 'Léa B.', createdAt: '2026-07-08T09:00:00.000Z' },
  lastMessageAt: '2026-07-08T09:00:00.000Z',
  status: 'open',
  requestedBy: null,
  createdBy: null,
};

function renderWidget() {
  return render(
    <SessionContext.Provider value={{ account, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <MessagingProvider>
        <MessagingWidget />
      </MessagingProvider>
    </SessionContext.Provider>,
  );
}

function mockList(items: ConversationItem[]) {
  (api.getConversations as ReturnType<typeof vi.fn>).mockImplementation((_c?: string, filter?: 'requests') =>
    filter === 'requests'
      ? Promise.resolve({ items: [], nextCursor: null, totalUnread: 0, requestsCount: 0 })
      : Promise.resolve({ items, nextCursor: null, totalUnread: 0, requestsCount: 0 }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  mockList([ownedGroup, dmConv]);
  (api.getMessages as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], nextCursor: null });
  (api.markConversationRead as ReturnType<typeof vi.fn>).mockResolvedValue({ unreadCount: 0 });
  (api.getPresence as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
  (api.getContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [
      { userId: 'u-yuki', slug: 'yuki', name: 'Yuki Moreau', avatarUrl: null, role: null, city: null, mutualProjects: 0, presence: { online: false, lastSeen: null } },
      { userId: 'u-theo', slug: 'theo-l', name: 'Théo Lin', avatarUrl: null, role: null, city: null, mutualProjects: 0, presence: { online: false, lastSeen: null } },
    ],
  });
});

async function openPanel(convName = 'Lames de Brume') {
  renderWidget();
  await userEvent.click(await screen.findByRole('button', { name: /Messages/ }));
  await userEvent.click(await screen.findByText(convName));
  await userEvent.click(await screen.findByRole('button', { name: 'Gérer le groupe' }));
}

describe('GroupMembersPanel — surfacing & members list', () => {
  it('opens from a standalone-group thread header and lists members with the count', async () => {
    await openPanel();
    expect(await screen.findByText('3 membres')).toBeInTheDocument();
    expect(screen.getByText('Yuki Moreau')).toBeInTheDocument();
    expect(screen.getByText('Noa T.')).toBeInTheDocument();
  });

  it('links every member name/avatar to their public profile', async () => {
    await openPanel();
    const yuki = await screen.findByRole('link', { name: 'Voir le profil de Yuki Moreau' });
    expect(yuki).toHaveAttribute('href', '/yuki');
    expect(screen.getByRole('link', { name: 'Voir le profil de Noa T.' })).toHaveAttribute('href', '/noa-t');
  });

  it('does NOT offer "Gérer le groupe" for a project-linked group', async () => {
    mockList([projectGroup]);
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: /Messages/ }));
    await userEvent.click(await screen.findByText('Projet · Kaze'));
    await screen.findByLabelText('Écrire un message');
    expect(screen.queryByRole('button', { name: 'Gérer le groupe' })).not.toBeInTheDocument();
  });
});

describe('GroupMembersPanel — role-gated controls', () => {
  it('creator sees Ajouter + Retirer on other rows, none on their own row', async () => {
    await openPanel();
    expect(await screen.findByRole('button', { name: 'Retirer Yuki Moreau du groupe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer Noa T. du groupe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer Camille R. du groupe' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ajouter un membre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitter le groupe' })).toBeInTheDocument();
  });

  it('a plain member sees no Ajouter/Retirer, but still Quitter le groupe + profile links', async () => {
    mockList([memberGroup, dmConv]);
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: /Messages/ }));
    await userEvent.click(await screen.findByText('Lames de Brume'));
    await userEvent.click(await screen.findByRole('button', { name: 'Gérer le groupe' }));

    expect(await screen.findByRole('button', { name: 'Quitter le groupe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer .* du groupe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Ajouter un membre' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le profil de Yuki Moreau' })).toBeInTheDocument();
  });
});

describe('GroupMembersPanel — kick', () => {
  it('confirms then calls removeGroupParticipant', async () => {
    (api.removeGroupParticipant as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...ownedGroup,
      participants: members.filter((m) => m.userId !== 'u-noa'),
    });
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Noa T. du groupe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retirer ce membre' });
    expect(within(dialog).getByText('Retirer Noa T. du groupe ?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(api.removeGroupParticipant).toHaveBeenCalledWith('g1', 'u-noa'));
  });

  it('rolls back and shows an inline error when the kick fails', async () => {
    (api.removeGroupParticipant as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Noa T. du groupe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retirer ce membre' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retirer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue. Veuillez réessayer.');
    // The member row reappears (optimistic removal rolled back).
    expect(screen.getByText('Noa T.')).toBeInTheDocument();
  });

  // Coverage gap: the "focus-trapped confirms" acceptance criterion had no test for the actual
  // keyboard behavior (only that the dialog renders). Escape must CANCEL (never confirm the
  // destructive action) and Tab must cycle within the dialog's two buttons, never escaping to the
  // page behind it.
  it('is keyboard-operable: autofocuses the confirm button, Tab wraps between the two buttons, Escape cancels without kicking', async () => {
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Noa T. du groupe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retirer ce membre' });
    const cancelBtn = within(dialog).getByRole('button', { name: 'Annuler' });
    const confirmBtn = within(dialog).getByRole('button', { name: 'Retirer' });

    expect(confirmBtn).toHaveFocus(); // autofocus on open

    await userEvent.tab(); // wraps from the last (confirm) button back to the first (cancel)
    expect(cancelBtn).toHaveFocus();
    await userEvent.tab();
    expect(confirmBtn).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Retirer ce membre' })).not.toBeInTheDocument();
    expect(api.removeGroupParticipant).not.toHaveBeenCalled();
    // The member is still listed — Escape cancelled, it did not confirm the kick.
    expect(screen.getByText('Noa T.')).toBeInTheDocument();
  });
});

describe('GroupMembersPanel — add', () => {
  it('lists only non-members and calls addGroupParticipant on submit', async () => {
    (api.addGroupParticipant as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...ownedGroup,
      participants: [...members, { userId: 'u-theo', slug: 'theo-l', name: 'Théo Lin', avatarUrl: null }],
    });
    await openPanel();
    const combo = await screen.findByRole('combobox', { name: 'Ajouter un membre' });
    await userEvent.click(combo);
    // Yuki is already a member → excluded from the options; Théo is offered.
    expect(screen.queryByRole('option', { name: 'Yuki Moreau' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'Théo Lin' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(api.addGroupParticipant).toHaveBeenCalledWith('g1', 'u-theo'));
  });
});

describe('GroupMembersPanel — leave', () => {
  it('confirms then leaves, dropping the group from the list', async () => {
    (api.leaveGroup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Quitter le groupe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Quitter le groupe' });
    expect(within(dialog).getByText('Quitter le groupe Lames de Brume ?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitter' }));

    await waitFor(() => expect(api.leaveGroup).toHaveBeenCalledWith('g1'));
    // Back on the conversation list; the group is gone.
    expect(await screen.findByLabelText('Rechercher une conversation')).toBeInTheDocument();
    expect(screen.queryByText('Lames de Brume')).not.toBeInTheDocument();
  });
});

describe('MessagingWidget — DM profile link + realtime (MC-12)', () => {
  it('links the DM header avatar + name to the other party profile', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: /Messages/ }));
    await userEvent.click(await screen.findByText('Léa B.'));
    const link = await screen.findByRole('link', { name: 'Voir le profil de Léa B.' });
    expect(link).toHaveAttribute('href', '/lea-b');
  });

  it('conversation:deleted drops the group from the list', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: /Messages/ }));
    expect(await screen.findByText('Lames de Brume')).toBeInTheDocument();
    await fire('conversation:deleted', { conversationId: 'g1' });
    await waitFor(() => expect(screen.queryByText('Lames de Brume')).not.toBeInTheDocument());
  });

  it('participant:removed for me on the open thread closes it', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: /Messages/ }));
    await userEvent.click(await screen.findByText('Lames de Brume'));
    await screen.findByRole('button', { name: 'Gérer le groupe' });
    await fire('participant:removed', { conversationId: 'g1', userId: 'me-1', createdBy: 'u-yuki' });
    // Thread closed → back on the list search field.
    expect(await screen.findByLabelText('Rechercher une conversation')).toBeInTheDocument();
  });
});
