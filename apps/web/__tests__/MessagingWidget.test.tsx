import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ConversationItem, MessagesPage } from '@encre-et-plume/shared';
import { WS_EVENTS } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// ── socket.io-client mock: a single-handler event bus we can fire from the test. ──
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

// The provider drives F-5 badge refresh through this hook — stub it.
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
  searchAccounts: vi.fn(),
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
  createBlock: vi.fn().mockResolvedValue({ id: 'b1', userId: 'u-lea', kind: 'block', createdAt: '2026-07-08T00:00:00.000Z' }),
  getMyBlocks: vi.fn().mockResolvedValue({ items: [] }),
  deleteBlock: vi.fn().mockResolvedValue(undefined),
  // MC-15
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  likeMessage: vi.fn(),
  unlikeMessage: vi.fn(),
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

const groupConv: ConversationItem = {
  id: 'g1',
  type: 'group',
  name: 'Projet · Lames de Brume',
  projectId: null,
  participants: [
    { userId: 'me-1', slug: 'camille-r', name: 'Camille R.', avatarUrl: null },
    { userId: 'u-yuki', slug: 'yuki', name: 'Yuki Moreau', avatarUrl: null },
  ],
  unreadCount: 1,
  lastMessage: { body: 'nemu planche 4 prêt', senderName: 'Yuki', createdAt: '2026-07-08T10:00:00.000Z' },
  lastMessageAt: '2026-07-08T10:00:00.000Z',
  status: 'open',
  requestedBy: null,
  createdBy: 'me-1',
};

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
  lastMessage: { body: 'Partante pour le Seinen ?', senderName: 'Léa B.', createdAt: '2026-07-08T09:00:00.000Z' },
  lastMessageAt: '2026-07-08T09:00:00.000Z',
  status: 'open',
  requestedBy: null,
  createdBy: null,
};

// MC-9 delta: an incoming DM request (I am the recipient — requestedBy is the other party).
const incomingRequest: ConversationItem = {
  id: 'req-1',
  type: 'dm',
  name: 'Noa T.',
  projectId: null,
  participants: [
    { userId: 'me-1', slug: 'camille-r', name: 'Camille R.', avatarUrl: null },
    { userId: 'u-noa', slug: 'noa-t', name: 'Noa T.', avatarUrl: null },
  ],
  unreadCount: 1,
  lastMessage: { body: 'On collabore ?', senderName: 'Noa T.', createdAt: '2026-07-09T09:00:00.000Z' },
  lastMessageAt: '2026-07-09T09:00:00.000Z',
  status: 'requested',
  requestedBy: 'u-noa',
  createdBy: null,
};

// MC-9 delta: an outgoing request I sent (in the main list, shows "Demande envoyée").
const outgoingRequest: ConversationItem = {
  id: 'req-2',
  type: 'dm',
  name: 'Sora K.',
  projectId: null,
  participants: [
    { userId: 'me-1', slug: 'camille-r', name: 'Camille R.', avatarUrl: null },
    { userId: 'u-sora', slug: 'sora-k', name: 'Sora K.', avatarUrl: null },
  ],
  unreadCount: 0,
  lastMessage: { body: 'Bonjour !', senderName: 'Camille R.', createdAt: '2026-07-09T08:00:00.000Z' },
  lastMessageAt: '2026-07-09T08:00:00.000Z',
  status: 'requested',
  requestedBy: 'me-1',
  createdBy: null,
};

const emptyPage: MessagesPage = { items: [], nextCursor: null };

function renderWidget(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acc, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <MessagingProvider>
        <MessagingWidget />
      </MessagingProvider>
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  // The provider fetches the main list (no filter) and the requests list (filter='requests').
  (api.getConversations as ReturnType<typeof vi.fn>).mockImplementation(
    (_cursor?: string, filter?: 'requests') =>
      filter === 'requests'
        ? Promise.resolve({ items: [], nextCursor: null, totalUnread: 0, requestsCount: 0 })
        : Promise.resolve({ items: [groupConv, dmConv], nextCursor: null, totalUnread: 1, requestsCount: 0 }),
  );
  (api.respondConversationRequest as ReturnType<typeof vi.fn>).mockImplementation(
    (id: string) => Promise.resolve({ ...incomingRequest, id, status: 'open', requestedBy: null }),
  );
  (api.getMessages as ReturnType<typeof vi.fn>).mockResolvedValue(emptyPage);
  (api.markConversationRead as ReturnType<typeof vi.fn>).mockResolvedValue({ unreadCount: 0 });
  (api.getPresence as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
});

describe('MessagingWidget — launcher', () => {
  it('renders no FAB for a logged-out visitor', () => {
    renderWidget(null);
    expect(screen.queryByRole('button', { name: /Messages/ })).not.toBeInTheDocument();
  });

  it('labels the FAB with the unread count', async () => {
    renderWidget();
    expect(await screen.findByRole('button', { name: 'Messages, 1 non lus' })).toBeInTheDocument();
  });

  it('opens the panel with header controls (one general accent-red conversation starter, no minimize, Fermer)', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    const dialog = screen.getByRole('dialog', { name: 'Messages' });
    // Follow-up 5b: the group-only "＋ Groupe" is replaced by ONE general start-a-conversation button
    // (1 person → DM, 2+ → group), so the 320px header keeps a single affordance.
    expect(within(dialog).queryByRole('button', { name: '＋ Groupe' })).not.toBeInTheDocument();
    const starter = within(dialog).getByRole('button', { name: '＋ Conversation' });
    expect(starter).toHaveStyle({ background: 'var(--accent)', color: '#fff' });
    // MC-9 amendment: the minimize "Réduire" (▁) button is removed; only "Fermer" remains.
    expect(within(dialog).queryByRole('button', { name: 'Réduire' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });
});

describe('MessagingWidget — conversation list', () => {
  it('shows the group row with an unread dot and sender-prefixed preview', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    expect(await screen.findByText('Projet · Lames de Brume')).toBeInTheDocument();
    expect(screen.getByText('Yuki : nemu planche 4 prêt')).toBeInTheDocument();
    expect(screen.getByLabelText('1 non lu')).toBeInTheDocument();
  });

  it('filters rows by the search field', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await screen.findByText('Projet · Lames de Brume');
    await userEvent.type(screen.getByLabelText('Rechercher une conversation'), 'Léa');
    expect(screen.queryByText('Projet · Lames de Brume')).not.toBeInTheDocument();
    expect(screen.getByText('Léa B.')).toBeInTheDocument();
  });

  it('swaps a DM preview for "en train d\'écrire…" on a typing event', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await screen.findByText('Partante pour le Seinen ?');
    await fire('typing', { conversationId: 'd1', userId: 'u-lea', isTyping: true });
    expect(screen.getByText("en train d'écrire…")).toBeInTheDocument();
  });
});

describe('MessagingWidget — thread + states', () => {
  it('shows the empty state when a conversation has no messages', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    expect(await screen.findByText('Démarrez la conversation')).toBeInTheDocument();
  });

  it('optimistically appends a send and shows retry on failure', async () => {
    (api.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue({ message: 'boom' });
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await screen.findByText('Démarrez la conversation');

    await userEvent.type(screen.getByLabelText('Écrire un message'), 'Bonjour !');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Bonjour !')).toBeInTheDocument();
    // The neutral server message is surfaced (MC-10 uses this path for blocked sends).
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('shows the reconnecting banner when the socket drops', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await fire('disconnect');
    expect(await screen.findByText('Reconnexion…')).toBeInTheDocument();
  });
});

describe('MessagingWidget — block from the DM header (MC-10)', () => {
  it('offers a block overflow on a DM thread but not a group thread', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));

    // DM thread → overflow present.
    await userEvent.click(await screen.findByText('Léa B.'));
    expect(await screen.findByRole('button', { name: /plus d'actions sur la conversation avec léa b\./i })).toBeInTheDocument();

    // Back to list, open the group thread → no overflow.
    await userEvent.click(screen.getByRole('button', { name: 'Retour aux conversations' }));
    await userEvent.click(await screen.findByText('Projet · Lames de Brume'));
    expect(screen.queryByRole('button', { name: /plus d'actions sur la conversation/i })).not.toBeInTheDocument();
  });

  it('confirming the block closes the thread', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await userEvent.click(await screen.findByRole('button', { name: /plus d'actions sur la conversation avec léa b\./i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Bloquer' }));
    const dialog = await screen.findByRole('dialog', { name: /bloquer léa b\./i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquer' }));

    await waitFor(() => expect(api.createBlock).toHaveBeenCalledWith({ userId: 'u-lea', kind: 'block' }));
    // Thread closed → back on the conversation list (search field visible again).
    expect(await screen.findByLabelText('Rechercher une conversation')).toBeInTheDocument();
  });

  // ── MC-10 round 2 (F10): DM header reflects an existing block ──────────────
  it('shows "Débloquer" (not "Bloquer") in the DM header when the peer is already blocked', async () => {
    (api.getMyBlocks as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ userId: 'u-lea', slug: 'lea-b', name: 'Léa B.', avatarUrl: null, kind: 'block', createdAt: '2026-07-08T00:00:00.000Z' }],
    });
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await userEvent.click(await screen.findByRole('button', { name: /plus d'actions sur la conversation avec léa b\./i }));
    expect(await screen.findByRole('menuitem', { name: /débloquer léa b\./i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Bloquer' })).not.toBeInTheDocument();
  });

  it('unblocking from the DM header calls deleteBlock and flips the item back to "Bloquer"', async () => {
    (api.getMyBlocks as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ userId: 'u-lea', slug: 'lea-b', name: 'Léa B.', avatarUrl: null, kind: 'block', createdAt: '2026-07-08T00:00:00.000Z' }],
    });
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await userEvent.click(await screen.findByRole('button', { name: /plus d'actions sur la conversation avec léa b\./i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /débloquer léa b\./i }));
    await waitFor(() => expect(api.deleteBlock).toHaveBeenCalledWith('u-lea', 'block'));
    await userEvent.click(await screen.findByRole('button', { name: /plus d'actions sur la conversation avec léa b\./i }));
    expect(await screen.findByRole('menuitem', { name: 'Bloquer' })).toBeInTheDocument();
  });
});

describe('MessagingWidget — close', () => {
  it('close resets to the conversation list and refocuses the FAB', async () => {
    renderWidget();
    const fab = await screen.findByRole('button', { name: 'Messages, 1 non lus' });
    await userEvent.click(fab);
    await userEvent.click(await screen.findByText('Léa B.'));
    await screen.findByText('Démarrez la conversation');

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(fab).toHaveFocus();

    await userEvent.click(fab);
    expect(await screen.findByLabelText('Rechercher une conversation')).toBeInTheDocument();
  });

  it('Escape closes the panel', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    expect(screen.getByRole('dialog', { name: 'Messages' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Messages' })).not.toBeInTheDocument());
  });
});

describe('MessagingWidget — composer attachments', () => {
  beforeEach(() => {
    (api.requestUpload as ReturnType<typeof vi.fn>).mockResolvedValue({
      mediaId: 'md-1',
      uploadUrl: 'https://storage.example/put',
      bucketKey: 'k',
      expiresIn: 60,
    });
    (api.finalizeMedia as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'md-1', status: 'processing' });
    (api.getMedia as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'md-1',
      kind: 'attachment',
      status: 'ready',
      visibility: 'private',
      width: null,
      height: null,
      variants: {},
      createdAt: '2026-07-08T00:00:00.000Z',
    });
    (api.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'm-1',
      conversationId: 'd1',
      senderId: 'me-1',
      body: '',
      attachments: [{ mediaId: 'md-1', name: 'planche.png', kind: 'image' }],
      createdAt: '2026-07-08T12:00:00.000Z',
      readBy: [],
    });
    (api.getMediaSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue({ url: 'https://cdn.example/att', expiresIn: 300 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function openComposer() {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await screen.findByText('Démarrez la conversation');
  }
  function fileInput() {
    return document.querySelector('input[type="file"]') as HTMLInputElement;
  }

  it('uploads a picked file (kind attachment, private) and shows a chip with the filename', async () => {
    await openComposer();
    await userEvent.upload(fileInput(), new File(['x'], 'planche.png', { type: 'image/png' }));
    expect(await screen.findByText('planche.png')).toBeInTheDocument();
    await waitFor(() =>
      expect(api.requestUpload).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'attachment', visibility: 'private', contentType: 'image/png' }),
      ),
    );
  });

  it('sends the finalized mediaId as an attachment-only message', async () => {
    await openComposer();
    await userEvent.upload(fileInput(), new File(['x'], 'planche.png', { type: 'image/png' }));
    await screen.findByText('planche.png');
    const send = screen.getByRole('button', { name: 'Envoyer' });
    await waitFor(() => expect(send).not.toBeDisabled());
    await userEvent.click(send);
    await waitFor(() =>
      expect(api.sendMessage).toHaveBeenCalledWith('d1', expect.objectContaining({ attachments: [{ mediaId: 'md-1' }] })),
    );
  });

  it('disables send while an upload is in flight', async () => {
    let resolveUpload!: (v: unknown) => void;
    (api.requestUpload as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { resolveUpload = r; }));
    await openComposer();
    await userEvent.upload(fileInput(), new File(['x'], 'planche.png', { type: 'image/png' }));
    await screen.findByText('planche.png');
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    resolveUpload({ mediaId: 'md-1', uploadUrl: 'https://storage.example/put', bucketKey: 'k', expiresIn: 60 });
  });

  it('removes a pending attachment chip', async () => {
    await openComposer();
    await userEvent.upload(fileInput(), new File(['x'], 'planche.png', { type: 'image/png' }));
    await screen.findByText('planche.png');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer planche.png' }));
    expect(screen.queryByText('planche.png')).not.toBeInTheDocument();
  });

  it('shows a French error when the upload fails', async () => {
    (api.requestUpload as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    await openComposer();
    await userEvent.upload(fileInput(), new File(['x'], 'planche.png', { type: 'image/png' }));
    expect(await screen.findByText("Échec de l'envoi de la pièce jointe")).toBeInTheDocument();
  });
});

describe('MessagingWidget — realtime', () => {
  it('appends an incoming message to the open thread and refreshes the unread badge', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await screen.findByText('Démarrez la conversation');

    await fire('message:new', {
      conversationId: 'd1',
      conversationName: 'Léa B.',
      senderName: 'Léa B.',
      message: {
        id: 'm-live',
        conversationId: 'd1',
        senderId: 'u-lea',
        body: 'Coucou en direct',
        attachments: [],
        createdAt: '2026-07-08T11:00:00.000Z',
        readBy: [],
      },
    });

    expect(await screen.findByText('Coucou en direct')).toBeInTheDocument();
    expect(refreshUnread).toHaveBeenCalled();
  });

  it('reconciles the realtime echo of my own message with the optimistic bubble (no duplicate)', async () => {
    let resolveSend!: (v: unknown) => void;
    (api.sendMessage as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { resolveSend = r; }));
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await screen.findByText('Démarrez la conversation');

    await userEvent.type(screen.getByLabelText('Écrire un message'), 'unique-echo-body');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('unique-echo-body');

    const real = {
      id: 'srv-1',
      conversationId: 'd1',
      senderId: 'me-1',
      body: 'unique-echo-body',
      attachments: [],
      createdAt: '2026-07-09T12:00:00.000Z',
      readBy: [],
    };
    // The socket echo of my own message arrives BEFORE the POST response resolves — must not
    // append a second bubble while the temp one is still pending.
    await fire('message:new', {
      conversationId: 'd1',
      conversationName: 'Léa B.',
      senderName: 'Camille R.',
      message: real,
    });
    expect(screen.getAllByText('unique-echo-body')).toHaveLength(1);
    await act(async () => {
      resolveSend(real);
    });
    expect(screen.getAllByText('unique-echo-body')).toHaveLength(1);
  });

  it('relays unread:changed (BE-RT1) into the F-5 unread refresh', async () => {
    renderWidget();
    await screen.findByRole('button', { name: 'Messages, 1 non lus' });
    refreshUnread.mockClear();
    await fire('unread:changed');
    expect(refreshUnread).toHaveBeenCalledTimes(1);
  });
});

// ── MC-9 delta: DM requests (Demandes tab + Accepter/Refuser + "Demande envoyée") ──

describe('MessagingWidget — Demandes tab (MC-9 delta)', () => {
  function mockRequests(items: ConversationItem[], count = items.length) {
    (api.getConversations as ReturnType<typeof vi.fn>).mockImplementation(
      (_cursor?: string, filter?: 'requests') =>
        filter === 'requests'
          ? Promise.resolve({ items, nextCursor: null, totalUnread: 0, requestsCount: count })
          : Promise.resolve({
              items: [groupConv, dmConv],
              nextCursor: null,
              totalUnread: 1,
              requestsCount: count,
            }),
    );
  }

  it('V1: shows Conversations / Demandes tabs, lists request rows, empty state, hides 0 count', async () => {
    mockRequests([incomingRequest]);
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));

    // Tab labelled with the count.
    const demandesTab = await screen.findByRole('tab', { name: /Demandes, 1 en attente/i });
    expect(screen.getByRole('tab', { name: 'Conversations' })).toBeInTheDocument();

    // Demandes tab lists the incoming request row.
    await userEvent.click(demandesTab);
    expect(await screen.findByText('Noa T.')).toBeInTheDocument();
    // The open conversations are not shown on the Demandes tab.
    expect(screen.queryByText('Projet · Lames de Brume')).not.toBeInTheDocument();
  });

  it('V1: empty Demandes tab shows "Aucune demande" and the tab count is hidden at 0', async () => {
    mockRequests([], 0);
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    const tab = await screen.findByRole('tab', { name: 'Demandes' });
    expect(tab).toHaveTextContent('Demandes');
    expect(tab).not.toHaveTextContent('(');
    await userEvent.click(tab);
    expect(await screen.findByText('Aucune demande')).toBeInTheDocument();
  });

  it('V2: recipient sees the "Demande de message" bar and Accepter swaps in the composer', async () => {
    mockRequests([incomingRequest]);
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByRole('tab', { name: /Demandes/i }));
    await userEvent.click(await screen.findByText('Noa T.'));

    // Action bar instead of the composer.
    expect(await screen.findByText('Demande de message')).toBeInTheDocument();
    expect(screen.queryByLabelText('Écrire un message')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Accepter' }));
    await waitFor(() => expect(api.respondConversationRequest).toHaveBeenCalledWith('req-1', 'accept'));
    // Composer replaces the bar.
    expect(await screen.findByLabelText('Écrire un message')).toBeInTheDocument();
    expect(screen.queryByText('Demande de message')).not.toBeInTheDocument();
  });

  it('V2: Refuser fires decline and returns to the list', async () => {
    mockRequests([incomingRequest]);
    (api.respondConversationRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...incomingRequest,
      status: 'requested',
    });
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByRole('tab', { name: /Demandes/i }));
    await userEvent.click(await screen.findByText('Noa T.'));
    await userEvent.click(await screen.findByRole('button', { name: 'Refuser' }));

    await waitFor(() => expect(api.respondConversationRequest).toHaveBeenCalledWith('req-1', 'decline'));
    // Back on the list (search field visible).
    expect(await screen.findByLabelText('Rechercher une conversation')).toBeInTheDocument();
  });

  it('V3: sender thread shows "Demande envoyée" with the composer enabled; gone when open', async () => {
    // The outgoing request lives in the MAIN list.
    (api.getConversations as ReturnType<typeof vi.fn>).mockImplementation(
      (_cursor?: string, filter?: 'requests') =>
        filter === 'requests'
          ? Promise.resolve({ items: [], nextCursor: null, totalUnread: 0, requestsCount: 0 })
          : Promise.resolve({
              items: [outgoingRequest],
              nextCursor: null,
              totalUnread: 0,
              requestsCount: 0,
            }),
    );
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages' }));
    await userEvent.click(await screen.findByText('Sora K.'));

    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument();
    // Composer stays enabled — opening messages allowed.
    expect(screen.getByLabelText('Écrire un message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  });
});

// Contacts-DM follow-up (2026-07-26, round 2 / item 6) — the Contacts tab is a LIST of the viewer's
// contacts, each row carrying the "Message" affordance (same wording as the /contacts page rows), not
// a search box. Starting the DM stays on the SAME POST /conversations { participantId } path as every
// other entry point, so dmPolicy (F-19) + blocks (MC-10) are enforced server-side.
describe('MessagingWidget — Contacts tab (list)', () => {
  const contact = (over: Record<string, unknown> = {}) => ({
    userId: 'u-lea',
    slug: 'lea-b',
    name: 'Léa B.',
    avatarUrl: null,
    role: 'dessinateur',
    city: null,
    mutualProjects: 0,
    presence: { online: true, lastSeen: null },
    ...over,
  });

  beforeEach(() => {
    (api.getContacts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [contact()] });
    (api.createConversation as ReturnType<typeof vi.fn>).mockResolvedValue(dmConv);
  });

  async function openContactsTab() {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Contacts' }));
  }

  it('opens on the contact LIST (no search box as the entry point) and starts the DM from a row', async () => {
    await openContactsTab();

    expect(await screen.findByRole('button', { name: 'Message à Léa B.' })).toBeInTheDocument();
    expect(api.getContacts).toHaveBeenCalled();
    // The picker combobox is no longer this tab's entry point — the list is.
    expect(screen.queryByRole('combobox', { name: 'Rechercher une personne' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Message à Léa B.' }));
    await waitFor(() => expect(api.createConversation).toHaveBeenCalledWith({ participantId: 'u-lea' }));
    expect(await screen.findByLabelText('Écrire un message')).toBeInTheDocument();
  });

  it('filters the list with the panel search field (secondary to the listing)', async () => {
    (api.getContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [contact(), contact({ userId: 'u-noe', slug: 'noe-p', name: 'Noé P.' })],
    });
    await openContactsTab();
    await screen.findByRole('button', { name: 'Message à Noé P.' });

    await userEvent.type(screen.getByLabelText('Rechercher un contact'), 'Léa');
    expect(screen.queryByRole('button', { name: 'Message à Noé P.' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message à Léa B.' })).toBeInTheDocument();
  });

  it('shows the server refusal when the recipient only accepts DMs from contacts', async () => {
    // A real refusal is an ApiError body — statusCode is what proves the copy is the server's French
    // message and not a transport TypeError ("Failed to fetch") leaking into role="alert" (review N1).
    (api.createConversation as ReturnType<typeof vi.fn>).mockRejectedValue({
      statusCode: 400,
      error: 'Bad Request',
      message: "Ce membre n'accepte que les messages de ses contacts.",
    });
    await openContactsTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Message à Léa B.' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Ce membre n'accepte que les messages de ses contacts.",
    );
    expect(screen.queryByLabelText('Écrire un message')).not.toBeInTheDocument();
  });

  // Review N1: a transport failure rejects with a TypeError whose English message must never render.
  it('falls back to French copy when the request fails at the transport level', async () => {
    (api.createConversation as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
    await openContactsTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Message à Léa B.' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Une erreur est survenue. Veuillez réessayer.');
    expect(alert).not.toHaveTextContent('Failed to fetch');
  });

  it('tells the user when they have no contacts yet', async () => {
    (api.getContacts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await openContactsTab();
    expect(await screen.findByText(/Aucun contact pour l’instant/i)).toBeInTheDocument();
  });

  it('shows an error state with a retry when the contacts fail to load', async () => {
    (api.getContacts as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ message: 'boom' });
    await openContactsTab();
    expect(await screen.findByText('Impossible de charger vos contacts.')).toBeInTheDocument();

    (api.getContacts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [contact()] });
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('button', { name: 'Message à Léa B.' })).toBeInTheDocument();
  });
});

// ─── MC-15 · message actions in the MC-9 widget (DMs + groups) ──────────────────
// The SAME components the salon dock and the project Discussion mount — what is asserted here is the
// widget's own wiring: the full matrix row (Répondre · Modifier · Supprimer · J'aime).

describe('MessagingWidget — MC-15 actions', () => {
  const mineMsg = {
    id: 'm-mine',
    conversationId: 'd1',
    senderId: 'me-1',
    body: 'Bonjur',
    attachments: [],
    createdAt: '2026-07-08T09:05:00.000Z',
    readBy: [],
    replyTo: null,
    editedAt: null,
    likeCount: 0,
    likedByMe: false,
  };
  const theirMsg = { ...mineMsg, id: 'm-theirs', senderId: 'u-lea', body: 'Partante pour le Seinen ?' };

  async function openDm(items: typeof mineMsg[]) {
    vi.mocked(api.getConversations).mockResolvedValue({
      items: [dmConv],
      nextCursor: null,
      totalUnread: 0,
      requestsCount: 0,
    });
    vi.mocked(api.getMessages).mockResolvedValue({ items, nextCursor: null });
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages' }));
    await userEvent.click(await screen.findByText('Léa B.'));
  }

  it('my own bubble offers the three items; someone else’s offers Répondre only', async () => {
    await openDm([theirMsg, mineMsg]);
    await screen.findByText('Bonjur');

    await userEvent.click(screen.getByRole('button', { name: 'Actions du message de moi' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Répondre',
      'Modifier',
      'Supprimer',
    ]);
    // NOT Escape: the widget panel is a dialog that closes on Escape, unmounting the thread. Clicking
    // the other trigger closes the first menu (outside click) and opens the second.
    await userEvent.click(screen.getByRole('button', { name: 'Actions du message de Léa B.' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Répondre']);
  });

  it('Répondre carries replyToId on the send', async () => {
    await openDm([theirMsg]);
    vi.mocked(api.sendMessage).mockResolvedValue({ ...mineMsg, id: 'sent', body: 'Oui !' });
    await screen.findByText('Partante pour le Seinen ?');

    await userEvent.click(screen.getByRole('button', { name: 'Actions du message de Léa B.' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Répondre' }));
    expect(screen.getByText(/Réponse à/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Écrire un message'), 'Oui !');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() =>
      expect(api.sendMessage).toHaveBeenCalledWith('d1', { body: 'Oui !', replyToId: 'm-theirs' }),
    );
  });

  it('Modifier saves in place and the bubble shows « modifié »', async () => {
    await openDm([mineMsg]);
    vi.mocked(api.editMessage).mockResolvedValue({
      ...mineMsg,
      body: 'Bonjour',
      editedAt: '2026-07-08T09:10:00.000Z',
    });
    await screen.findByText('Bonjur');

    await userEvent.click(screen.getByRole('button', { name: 'Actions du message de moi' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Modifier' }));
    const field = screen.getByRole('textbox', { name: 'Modifier le message' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Bonjour');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.editMessage).toHaveBeenCalledWith('m-mine', { text: 'Bonjour' }));
    expect(await screen.findByText('modifié')).toBeInTheDocument();
  });

  it('Supprimer destroys only after a confirmation', async () => {
    await openDm([mineMsg]);
    vi.mocked(api.deleteMessage).mockResolvedValue(undefined);
    await screen.findByText('Bonjur');

    await userEvent.click(screen.getByRole('button', { name: 'Actions du message de moi' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(api.deleteMessage).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(api.deleteMessage).toHaveBeenCalledWith('m-mine'));
    await waitFor(() => expect(screen.queryByText('Bonjur')).toBeNull());
  });

  it('double-clicking a bubble likes it, and the heart unlikes it', async () => {
    await openDm([theirMsg]);
    vi.mocked(api.likeMessage).mockResolvedValue(undefined);
    vi.mocked(api.unlikeMessage).mockResolvedValue(undefined);

    await userEvent.dblClick(await screen.findByText('Partante pour le Seinen ?'));
    await waitFor(() => expect(api.likeMessage).toHaveBeenCalledWith('m-theirs'));

    await userEvent.click(screen.getByRole('button', { name: /Je n’aime plus le message de Léa B./ }));
    await waitFor(() => expect(api.unlikeMessage).toHaveBeenCalledWith('m-theirs'));
  });

  it('a message deleted by its author disappears live from my open thread', async () => {
    await openDm([theirMsg]);
    await screen.findByText('Partante pour le Seinen ?');
    await fire(WS_EVENTS.messageDeleted, { conversationId: 'd1', messageId: 'm-theirs' });
    expect(screen.queryByText('Partante pour le Seinen ?')).toBeNull();
  });
});
