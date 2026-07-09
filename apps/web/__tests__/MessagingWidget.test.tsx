import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ConversationItem, MessagesPage } from '@encre-et-plume/shared';
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
  getMediaSignedUrl: vi.fn(),
  getPresence: vi.fn(),
  getContacts: vi.fn(),
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
  createBlock: vi.fn().mockResolvedValue({ id: 'b1', userId: 'u-lea', kind: 'block', createdAt: '2026-07-08T00:00:00.000Z' }),
  getMyBlocks: vi.fn().mockResolvedValue({ items: [] }),
  deleteBlock: vi.fn().mockResolvedValue(undefined),
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
  preferences: { theme: 'system' },
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
  (api.getConversations as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [groupConv, dmConv],
    nextCursor: null,
    totalUnread: 1,
  });
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

  it('opens the panel with header controls', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    const dialog = screen.getByRole('dialog', { name: 'Messages' });
    expect(within(dialog).getByRole('button', { name: '＋ Groupe' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Réduire' })).toBeInTheDocument();
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

describe('MessagingWidget — minimize / close', () => {
  it('minimize keeps the open thread; reopening restores it', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Messages, 1 non lus' }));
    await userEvent.click(await screen.findByText('Léa B.'));
    await screen.findByText('Démarrez la conversation');

    await userEvent.click(screen.getByRole('button', { name: 'Réduire' }));
    expect(screen.queryByRole('dialog', { name: 'Messages' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Messages, 1 non lus' }));
    expect(await screen.findByText('Démarrez la conversation')).toBeInTheDocument();
  });

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
