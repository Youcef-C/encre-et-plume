import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, SalonSummary, SalonMessageDto } from '@encre-et-plume/shared';
import { WS_EVENTS } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// ── shared socket mock: a handler bus the test can fire salon events through. ──
const handlers: Record<string, (p?: unknown) => void> = {};
const mockSocket = {
  on: (event: string, h: (p?: unknown) => void) => {
    handlers[event] = h;
  },
  off: (event: string) => {
    delete handlers[event];
  },
  emit: vi.fn(),
};
function fire(event: string, payload?: unknown) {
  return act(() => {
    handlers[event]?.(payload);
  });
}

const openDm = vi.fn();
const messagingValue: { socket: unknown; connectionState: string; openDm: typeof openDm } = {
  socket: mockSocket,
  connectionState: 'connected',
  openDm,
};
vi.mock('../lib/messaging', () => ({ useMessaging: () => messagingValue }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('../lib/api', () => ({
  getSalon: vi.fn(),
  getSalonMessages: vi.fn(),
  getSalonOnline: vi.fn(),
  getSalonPresence: vi.fn(),
  joinSalon: vi.fn(),
  leaveSalon: vi.fn(),
  sendSalonMessage: vi.fn(),
  markSalonRead: vi.fn(),
  getMyBlocks: vi.fn(),
  createBlock: vi.fn(),
  // MC-15
  likeMessage: vi.fn(),
  unlikeMessage: vi.fn(),
  getMessageLikes: vi.fn(),
}));

import * as api from '../lib/api';
import SalonDock from '../components/salon/SalonDock';

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

function summary(over: Partial<SalonSummary> = {}): SalonSummary {
  return {
    conversationId: 'salon-1',
    name: 'Le Comptoir',
    onlineCount: 144,
    unreadCount: 0,
    isMember: false,
    ...over,
  };
}

function msg(over: Partial<SalonMessageDto> = {}): SalonMessageDto {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    senderId: 'u-yuki',
    senderName: 'Yuki Moreau',
    body: 'Bonjour le comptoir',
    createdAt: '2026-07-09T10:00:00.000Z',
    // MC-15: the salon DTO carries the same action fields as MessageDto.
    replyTo: null,
    editedAt: null,
    likeCount: 0,
    likedByMe: false,
    ...over,
  };
}

function renderDock(acct: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acct } as never}>
      <SalonDock />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  messagingValue.connectionState = 'connected';
  vi.mocked(api.getSalon).mockResolvedValue(summary());
  vi.mocked(api.getMyBlocks).mockResolvedValue({ items: [] });
  vi.mocked(api.getSalonMessages).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(api.getSalonOnline).mockResolvedValue({ items: [] });
  vi.mocked(api.getSalonPresence).mockResolvedValue({ count: 0, items: [] });
  vi.mocked(api.joinSalon).mockResolvedValue({ isMember: true });
  vi.mocked(api.leaveSalon).mockResolvedValue({ isMember: false });
  vi.mocked(api.markSalonRead).mockResolvedValue({ unreadCount: 0 });
});

describe('SalonDock', () => {
  it('renders nothing when logged out', () => {
    const { container } = renderDock(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed by default and shows the title and online count', async () => {
    renderDock();
    expect(await screen.findByText('Le Comptoir')).toBeInTheDocument();
    expect(screen.getByText(/144 en ligne/)).toBeInTheDocument();
    // Body hidden while collapsed: no composer / join panel visible.
    expect(screen.queryByText('＋ Rejoindre le salon')).not.toBeInTheDocument();
  });

  it('turns the presence dot green (connected) in the collapsed bar once the salon is joined', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    // No text label — the joined+connected state is the dot colour only.
    const line = await screen.findByText(/144 en ligne/);
    expect(line.closest('[data-connected]')).toHaveAttribute('data-connected', 'yes');
    expect(screen.queryByText(/Connecté/)).not.toBeInTheDocument();
  });

  it('keeps the presence dot muted (not connected) for a logged-in non-member', async () => {
    renderDock(); // default summary → isMember: false
    const line = await screen.findByText(/144 en ligne/);
    expect(line.closest('[data-connected]')).toHaveAttribute('data-connected', 'no');
  });

  it('header is a button whose accessible name includes the unread count and toggles aria-expanded', async () => {
    renderDock();
    const header = await screen.findByRole('button', { name: /^Le Comptoir/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header).toHaveAccessibleName(/aucun message non lu/i);
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('never signals room enter/leave — membership is driven by Rejoindre/Quitter, not the dock', async () => {
    renderDock();
    const header = await screen.findByRole('button', { name: /^Le Comptoir/ });
    await userEvent.click(header); // expand
    await userEvent.click(header); // collapse
    // No client→server presence emit: the dock does not track room presence anymore.
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('shows the MC-13 roster user-icon trigger only when the dock is unfolded', async () => {
    renderDock();
    await screen.findByText('Le Comptoir');
    // Hidden while collapsed.
    expect(screen.queryByRole('button', { name: /Voir les membres présents/ })).not.toBeInTheDocument();
    // Unfold the dock → the trigger appears (outside the thread). Its name must NOT contain
    // "Le Comptoir" (would collide with the dock header button in mc11).
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    const trigger = await screen.findByRole('button', { name: /Voir les membres présents/ });
    expect(trigger).not.toHaveAccessibleName(/Le Comptoir/);
  });

  it('shows the join panel for a non-member and reveals the composer after joining', async () => {
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    expect(
      await screen.findByText(/Rejoignez/),
    ).toHaveTextContent('Rejoignez Le Comptoir pour discuter avec la communauté.');
    expect(screen.queryByPlaceholderText('Votre message…')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '＋ Rejoindre le salon' }));
    await waitFor(() => expect(api.joinSalon).toHaveBeenCalled());
    expect(await screen.findByPlaceholderText('Votre message…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quitter/ })).toBeInTheDocument();
  });

  it('a member can leave, returning to the join panel', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Quitter/ }));
    await waitFor(() => expect(api.leaveSalon).toHaveBeenCalled());
    expect(await screen.findByText(/Rejoignez/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Votre message…')).not.toBeInTheDocument();
  });

  it('shows the empty-feed line when there is no history', async () => {
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    expect(await screen.findByText('Soyez le premier à écrire.')).toBeInTheDocument();
  });

  it('renders history messages with sender names above bubbles', async () => {
    vi.mocked(api.getSalonMessages).mockResolvedValue({
      items: [msg({ id: 'm1', senderName: 'Yuki Moreau', body: 'Salut' })],
      nextCursor: null,
    });
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    expect(await screen.findByText('Salut')).toBeInTheDocument();
    expect(screen.getByText('Yuki Moreau')).toBeInTheDocument();
  });

  it('counts an incoming message as unread while collapsed and clears it on expand (member)', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    const header = await screen.findByRole('button', { name: /^Le Comptoir/ });
    await fire(WS_EVENTS.salonMessage, { message: msg({ id: 'in1' }) });
    expect(await screen.findByText('1 nouveau·x')).toBeInTheDocument();
    expect(header).toHaveAttribute('data-unread', 'yes');

    await userEvent.click(header);
    await waitFor(() => expect(api.markSalonRead).toHaveBeenCalled());
    expect(screen.queryByText('1 nouveau·x')).not.toBeInTheDocument();
  });

  it('updates the online count from ANOTHER user membership join/leave (WS, not self)', async () => {
    renderDock();
    await screen.findByText(/144 en ligne/);
    await fire(WS_EVENTS.salonMemberJoined, {
      user: { id: 'u-new', name: 'Nouveau', avatarUrl: null, slug: 'nouveau' },
    });
    expect(await screen.findByText(/145 en ligne/)).toBeInTheDocument();
    await fire(WS_EVENTS.salonMemberLeft, { userId: 'u-new' });
    expect(await screen.findByText(/144 en ligne/)).toBeInTheDocument();
  });

  it('ignores the WS echo of my OWN join and leave (self is refetch-driven, not WS)', async () => {
    renderDock();
    await screen.findByText(/144 en ligne/);
    await fire(WS_EVENTS.salonMemberJoined, { user: { id: 'me-1', name: 'Camille R.', avatarUrl: null, slug: 'camille-r' } });
    await fire(WS_EVENTS.salonMemberLeft, { userId: 'me-1' });
    // Neither self echo touches the header count.
    expect(screen.getByText(/144 en ligne/)).toBeInTheDocument();
  });

  it('own Rejoindre refetches the summary and bumps the header count', async () => {
    vi.mocked(api.getSalon)
      .mockResolvedValueOnce(summary({ onlineCount: 144, isMember: false }))
      .mockResolvedValue(summary({ onlineCount: 145, isMember: true }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    await userEvent.click(screen.getByRole('button', { name: '＋ Rejoindre le salon' }));
    await waitFor(() => expect(api.joinSalon).toHaveBeenCalled());
    expect(await screen.findByText(/145 en ligne/)).toBeInTheDocument();
  });

  it('B1: blocking a present member keeps the header count === the roster count, and a later leave of the blocked user does not double-decrement', async () => {
    vi.mocked(api.getSalon)
      .mockResolvedValueOnce(summary({ onlineCount: 3, isMember: true }))
      .mockResolvedValue(summary({ onlineCount: 2, isMember: true }));
    vi.mocked(api.getSalonPresence)
      .mockResolvedValueOnce({
        count: 3,
        items: [
          { id: 'me-1', name: 'Camille R.', avatarUrl: null, slug: 'camille-r', self: true },
          { id: 'u-lea', name: 'Léa B.', avatarUrl: null, slug: 'lea-b', self: false },
          { id: 'u-mika', name: 'Mika', avatarUrl: null, slug: 'mika', self: false },
        ],
      })
      .mockResolvedValue({
        count: 2,
        items: [
          { id: 'me-1', name: 'Camille R.', avatarUrl: null, slug: 'camille-r', self: true },
          { id: 'u-mika', name: 'Mika', avatarUrl: null, slug: 'mika', self: false },
        ],
      });
    renderDock();
    await screen.findByText(/3 en ligne/);

    // Unfold the dock (the roster trigger only renders when unfolded), then open the roster and block.
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Voir les membres présents/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Actions sur Léa B.' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Bloquer Léa B.' }));
    const dialog = await screen.findByRole('dialog', { name: /Bloquer Léa B\./ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquer' }));

    // Invariant: dock header AND roster header both settle at 2 (N−1) — two elements, both "2 en ligne".
    await waitFor(() => expect(screen.getByText(/2 en ligne dans Le Comptoir/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText(/2 en ligne/)).toHaveLength(2));
    expect(screen.queryByText(/3 en ligne/)).not.toBeInTheDocument();

    // A later member:left for the already-blocked user must NOT decrement either count again.
    await fire(WS_EVENTS.salonMemberLeft, { userId: 'u-lea' });
    expect(screen.getAllByText(/2 en ligne/)).toHaveLength(2);
  });

  it('own Quitter refetches the summary and drops the header count', async () => {
    vi.mocked(api.getSalon)
      .mockResolvedValueOnce(summary({ onlineCount: 144, isMember: true }))
      .mockResolvedValue(summary({ onlineCount: 143, isMember: false }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Quitter/ }));
    await waitFor(() => expect(api.leaveSalon).toHaveBeenCalled());
    expect(await screen.findByText(/143 en ligne/)).toBeInTheDocument();
  });

  it('filters out messages from blocked and muted users (MC-10)', async () => {
    vi.mocked(api.getMyBlocks).mockResolvedValue({
      items: [
        { userId: 'u-block', slug: 'b', name: 'Bloqué', avatarUrl: null, kind: 'block', createdAt: '2026-01-01T00:00:00.000Z' },
        { userId: 'u-mute', slug: 'm', name: 'Muté', avatarUrl: null, kind: 'mute', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    vi.mocked(api.getSalonMessages).mockResolvedValue({
      items: [
        msg({ id: 'ok', senderId: 'u-ok', senderName: 'Ok', body: 'visible' }),
        msg({ id: 'b', senderId: 'u-block', body: 'caché-bloque' }),
        msg({ id: 'm', senderId: 'u-mute', body: 'caché-mute' }),
      ],
      nextCursor: null,
    });
    renderDock();
    const header = await screen.findByRole('button', { name: /^Le Comptoir/ });
    await userEvent.click(header);
    expect(await screen.findByText('visible')).toBeInTheDocument();
    expect(screen.queryByText('caché-bloque')).not.toBeInTheDocument();
    expect(screen.queryByText('caché-mute')).not.toBeInTheDocument();

    // A blocked sender's realtime message must not bump unread either.
    await userEvent.click(header); // collapse
    await fire(WS_EVENTS.salonMessage, { message: msg({ id: 'in-b', senderId: 'u-block', body: 'x' }) });
    expect(screen.queryByText(/nouveau·x/)).not.toBeInTheDocument();
  });

  it('opens the @-mention list of online users and inserts the chosen name', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    vi.mocked(api.getSalonOnline).mockResolvedValue({
      items: [
        { userId: 'u-yuki', name: 'Yuki Moreau' },
        { userId: 'u-lea', name: 'Léa B.' },
      ],
    });
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    const input = await screen.findByPlaceholderText('Votre message…');
    await userEvent.type(input, '@');
    await waitFor(() => expect(api.getSalonOnline).toHaveBeenCalled());
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Yuki Moreau')).toBeInTheDocument();
    // First row is pre-highlighted; ArrowDown advances to the second, Enter inserts it.
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect((input as HTMLInputElement).value).toContain('@Léa B.');
  });

  it('reconciles the realtime echo of my own message with the optimistic bubble (no duplicate)', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    let resolveSend!: (v: SalonMessageDto) => void;
    vi.mocked(api.sendSalonMessage).mockReturnValue(new Promise((r) => { resolveSend = r; }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    const input = await screen.findByPlaceholderText('Votre message…');
    await userEvent.type(input, 'unique-echo-body{Enter}');
    await waitFor(() => expect(api.sendSalonMessage).toHaveBeenCalledWith('unique-echo-body', undefined));
    // The socket echo of my own message arrives BEFORE the POST response resolves — must not
    // append a second bubble while the temp one is still pending.
    const real = msg({ id: 'srv-1', senderId: 'me-1', senderName: 'Camille R.', body: 'unique-echo-body' });
    await fire(WS_EVENTS.salonMessage, { message: real });
    expect(screen.getAllByText('unique-echo-body')).toHaveLength(1);
    await act(async () => {
      resolveSend(real);
    });
    expect(screen.getAllByText('unique-echo-body')).toHaveLength(1);
  });

  it('shows a retry action when sending fails', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    vi.mocked(api.sendSalonMessage).mockRejectedValueOnce({ message: 'Échec' });
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    const input = await screen.findByPlaceholderText('Votre message…');
    await userEvent.type(input, 'coucou{Enter}');
    await waitFor(() => expect(api.sendSalonMessage).toHaveBeenCalledWith('coucou', undefined));
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    vi.mocked(api.sendSalonMessage).mockResolvedValueOnce(msg({ id: 'real', senderId: 'me-1', senderName: 'Camille R.', body: 'coucou' }));
    await userEvent.click(retry);
    await waitFor(() => expect(api.sendSalonMessage).toHaveBeenCalledTimes(2));
  });

  // ── MC-11 mention impact + scroll-to-newest ──

  it('(a) flashes an incoming @-mention of me in the feed', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    await screen.findByText('Soyez le premier à écrire.');
    await fire(WS_EVENTS.salonMessage, {
      message: msg({ id: 'men1', senderId: 'u-yuki', senderName: 'Yuki', body: 'hey @Camille R. ça va ?' }),
    });
    const bubble = await screen.findByText('hey @Camille R. ça va ?');
    expect(bubble).toHaveClass('ep-mention-flash');
  });

  it('(a2) does not flash my own message or a non-mention', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    await screen.findByText('Soyez le premier à écrire.');
    // my own message that literally @-mentions me → not a mention of me
    await fire(WS_EVENTS.salonMessage, {
      message: msg({ id: 'mine', senderId: 'me-1', senderName: 'Camille R.', body: '@Camille R. note' }),
    });
    // someone else, no @-mention
    await fire(WS_EVENTS.salonMessage, {
      message: msg({ id: 'plain', senderId: 'u-yuki', body: 'juste un bonjour' }),
    });
    expect(await screen.findByText('juste un bonjour')).not.toHaveClass('ep-mention-flash');
    expect(screen.getByText('@Camille R. note')).not.toHaveClass('ep-mention-flash');
  });

  it('(b) shows a jump-to-mention pill when scrolled up and scrolls on click', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    const feed = await screen.findByRole('log');
    Object.defineProperty(feed, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(feed, 'clientHeight', { value: 280, configurable: true });
    feed.scrollTop = 0;
    fireEvent.scroll(feed);
    await fire(WS_EVENTS.salonMessage, {
      message: msg({ id: 'men2', senderId: 'u-yuki', body: 'oi @Camille R.' }),
    });
    const pill = await screen.findByRole('button', { name: /Nouvelle mention/ });
    await userEvent.click(pill);
    expect(feed.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: /Nouvelle mention/ })).not.toBeInTheDocument();
  });

  it('(c) shows a distinct mention indicator on the collapsed header and clears on open', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    const header = await screen.findByRole('button', { name: /^Le Comptoir/ });
    await fire(WS_EVENTS.salonMessage, {
      message: msg({ id: 'men3', senderId: 'u-yuki', body: 'coucou @Camille R.' }),
    });
    expect(await screen.findByText('@ Mention')).toBeInTheDocument();
    expect(header).toHaveAccessibleName(/mentionné/i);
    await userEvent.click(header);
    await waitFor(() => expect(screen.queryByText('@ Mention')).not.toBeInTheDocument());
  });

  it('(d) shows "Aller au plus récent" when scrolled up and scrolls to newest on click', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    vi.mocked(api.getSalonMessages).mockResolvedValue({
      items: [msg({ id: 'h1', body: 'un' }), msg({ id: 'h2', body: 'deux' })],
      nextCursor: null,
    });
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    const feed = await screen.findByRole('log');
    // Pinned to bottom by default → no scroll-to-newest affordance.
    expect(screen.queryByRole('button', { name: /Aller au plus récent/ })).not.toBeInTheDocument();
    Object.defineProperty(feed, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(feed, 'clientHeight', { value: 280, configurable: true });
    feed.scrollTop = 0;
    fireEvent.scroll(feed);
    const btn = await screen.findByRole('button', { name: /Aller au plus récent/ });
    await userEvent.click(btn);
    expect(feed.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: /Aller au plus récent/ })).not.toBeInTheDocument();
  });

  it('shows a reconnecting banner when the socket drops', async () => {
    messagingValue.connectionState = 'reconnecting';
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    // Even a joined member's dot goes muted while the realtime link is down.
    const line = await screen.findByText(/144 en ligne/);
    expect(line.closest('[data-connected]')).toHaveAttribute('data-connected', 'no');
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    expect(await screen.findByText('Reconnexion…')).toBeInTheDocument();
  });
});

// ─── MC-15 · the salon carries Répondre + J'aime, and NEITHER Modifier NOR Supprimer ────────────
// « Le Comptoir » is a public room: erasing — or silently rewriting — a line the room has already
// read and answered rewrites a shared record. The server refuses both (403); the dock's menu simply
// never offers them. The omission is the UI agreeing with the gate, not the gate itself.

describe('SalonDock — MC-15 actions', () => {
  async function openDockWith(messages: SalonMessageDto[]) {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    vi.mocked(api.getSalonMessages).mockResolvedValue({ items: messages, nextCursor: null });
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
  }

  it('the menu offers Répondre and NOTHING else — no Modifier, no Supprimer', async () => {
    await openDockWith([msg({ id: 'm-1', senderId: 'me-1', senderName: 'Camille R.', body: 'Coucou' })]);
    await userEvent.click(await screen.findByRole('button', { name: /^Actions du message/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Répondre' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Modifier' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Supprimer' })).toBeNull();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
  });

  it('Répondre shows the quote in the composer and the send carries replyToId', async () => {
    await openDockWith([msg({ id: 'm-1', body: 'Qui dessine ce soir ?' })]);
    vi.mocked(api.sendSalonMessage).mockResolvedValue(
      msg({ id: 'srv', senderId: 'me-1', senderName: 'Camille R.', body: 'Moi !' }),
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Actions du message/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Répondre' }));
    expect(screen.getByText(/Réponse à/)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('Votre message…'), 'Moi !{Enter}');
    await waitFor(() => expect(api.sendSalonMessage).toHaveBeenCalledWith('Moi !', 'm-1'));
  });

  it('the heart toggles a like optimistically and reverts when the server refuses', async () => {
    await openDockWith([msg({ id: 'm-1', likeCount: 2 })]);
    vi.mocked(api.likeMessage).mockRejectedValue({ message: 'Message introuvable.' });

    const heart = await screen.findByRole('button', { name: /J’aime le message de Yuki Moreau/ });
    await userEvent.click(heart);
    await waitFor(() => expect(api.likeMessage).toHaveBeenCalledWith('m-1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /J’aime le message de Yuki Moreau/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });

  it('a like broadcast to the room updates the count live', async () => {
    await openDockWith([msg({ id: 'm-1' })]);
    await screen.findByText('Bonjour le comptoir');
    await fire(WS_EVENTS.messageLiked, {
      conversationId: 'salon-conv',
      messageId: 'm-1',
      userId: 'u-yuki',
      liked: true,
      likeCount: 5,
    });
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('D-3: a quote whose target is gone reads « Message supprimé »', async () => {
    await openDockWith([
      msg({ id: 'm-2', replyTo: { id: '', senderId: '', senderName: '', excerpt: '', deleted: true } }),
    ]);
    expect(await screen.findByText('Message supprimé')).toBeInTheDocument();
  });

  // R2-B4: « voir qui a aimé » on the salon too — the same component as the other three surfaces.
  it('R2-B: the count opens the likers list on demand, and never toggles the like', async () => {
    await openDockWith([msg({ id: 'm-1', likeCount: 2 })]);
    vi.mocked(api.getMessageLikes).mockResolvedValue({
      items: [
        { accountId: 'u-sacha', displayName: 'Sacha Benali', avatar: null, createdAt: '2026-08-01T10:00:00.000Z' },
        { accountId: 'me-1', displayName: 'Camille R.', avatar: null, createdAt: '2026-08-01T09:00:00.000Z' },
      ],
      nextCursor: null,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: /^Voir qui aime le message de Yuki Moreau/ }),
    );
    expect(await screen.findByRole('dialog', { name: 'Aimé par' })).toBeInTheDocument();
    expect(api.getMessageLikes).toHaveBeenCalledWith('m-1');
    expect(screen.getByText('Sacha Benali')).toBeInTheDocument();
    expect(api.likeMessage).not.toHaveBeenCalled();
  });

  // ── R2-A · D-7: own messages align RIGHT in the salon ────────────────────────
  // A DELIBERATE departure from an `Explicit` replica screen: the prototype (line 2975) draws every
  // salon bubble identically, left-aligned with the card fill and a sender name above. The user found
  // it confusing next to the widget and the Discussion panel, and approved the deviation (2026-08-02).
  // Do NOT "restore the prototype" here — see MC-11's story notes.
  describe('R2-A — own messages align right (D-7)', () => {
    const mine = () => msg({ id: 'm-mine', senderId: 'me-1', senderName: 'Camille R.', body: 'Coucou' });
    const theirs = () => msg({ id: 'm-theirs', senderId: 'u-yuki', senderName: 'Yuki Moreau', body: 'Salut' });
    const row = (id: string) => document.querySelector(`[data-message-id="${id}"]`) as HTMLElement;

    it('R2-A1: my bubble is right-aligned with the ink fill and carries NO sender label', async () => {
      await openDockWith([mine(), theirs()]);
      const bubble = await screen.findByText('Coucou');
      expect(row('m-mine')).toHaveAttribute('data-mine', 'true');
      expect(row('m-mine').style.alignSelf).toBe('flex-end');
      expect(bubble.style.background).toBe('var(--ink)');
      expect(bubble.style.color).toBe('var(--paper)');
      // My own name above my own bubble is noise once the side already says it.
      expect(within(row('m-mine')).queryByText('Camille R.')).toBeNull();
    });

    it("R2-A1: someone else's bubble stays LEFT with the card fill and its sender label", async () => {
      await openDockWith([mine(), theirs()]);
      const bubble = await screen.findByText('Salut');
      expect(row('m-theirs')).toHaveAttribute('data-mine', 'false');
      expect(row('m-theirs').style.alignSelf).toBe('flex-start');
      expect(bubble.style.background).toBe('var(--card)');
      expect(within(row('m-theirs')).getByText('Yuki Moreau')).toBeInTheDocument();
    });

    it('R2-A2: the controls mirror — inside my row they sit before the bubble, after it on theirs', async () => {
      await openDockWith([mine(), theirs()]);
      await screen.findByText('Coucou');
      // Same rule as the widget and the Discussion panel: the controls always face the thread's centre.
      expect(screen.getByText('Coucou').parentElement!.style.flexDirection).toBe('row');
      expect(screen.getByText('Salut').parentElement!.style.flexDirection).toBe('row-reverse');
    });

    it('R2-A2: my own menu opens to the LEFT, an incoming one to the RIGHT', async () => {
      await openDockWith([mine(), theirs()]);
      await screen.findByText('Coucou');
      const trigger = within(row('m-mine')).getByRole('button', { name: /^Actions du message/ });
      trigger.getBoundingClientRect = () =>
        ({ top: 300, bottom: 344, left: 240, right: 274, width: 34, height: 44 }) as DOMRect;
      await userEvent.click(trigger);
      // Glued to the trigger's LEFT edge (240 - 150 - 6), never over the bubble it acts on.
      expect(screen.getByRole('menu').style.left).toBe('84px');
    });
  });
});

// ─── P-3 · upward infinite scroll — the dock must be able to reach older history ────────────────
// The API has always been cursor-paginated (30/page, `nextCursor`); the dock fetched page 1 and then
// nothing, ever, so anything older than the last 30 lines was unreachable. Loading older pages must
// NOT move what the reader is looking at — the jump is the bug people actually feel — and opening the
// dock must still land on the newest message, at the bottom.

describe('SalonDock — older messages (P-3)', () => {
  // jsdom has no layout: drive scrollHeight from the test so a "prepend" can grow the feed.
  let feedHeight = 0;
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => feedHeight });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 280 });
  });
  afterAll(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollHeight'];
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientHeight'];
  });

  async function openWithHistory(nextCursor: string | null) {
    feedHeight = 1000;
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    vi.mocked(api.getSalonMessages).mockResolvedValue({
      items: [msg({ id: 'recent', body: 'récent' })],
      nextCursor,
    });
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /^Le Comptoir/ }));
    await screen.findByText('récent');
    const feed = screen.getByRole('log');
    // The dock opens ON the newest message: settle that before a test scrolls anywhere else.
    await waitFor(() => expect(feed.scrollTop).toBe(1000));
    return feed;
  }

  it('still opens on the newest message, scrolled to the bottom, and asks for page 1 with no cursor', async () => {
    await openWithHistory('c1');
    expect(vi.mocked(api.getSalonMessages)).toHaveBeenCalledWith();
  });

  it('offers "Charger les messages précédents" only while the server hands back a cursor', async () => {
    await openWithHistory(null);
    expect(screen.queryByRole('button', { name: /Charger les messages précédents/ })).not.toBeInTheDocument();
  });

  it('prepends the older page above the newer one and stops offering more at the end of history', async () => {
    await openWithHistory('c1');
    vi.mocked(api.getSalonMessages).mockResolvedValue({
      items: [msg({ id: 'old', body: 'ancien' })],
      nextCursor: null,
    });
    await userEvent.click(screen.getByRole('button', { name: /Charger les messages précédents/ }));
    await screen.findByText('ancien');
    expect(vi.mocked(api.getSalonMessages)).toHaveBeenLastCalledWith('c1');
    const bodies = [...screen.getByRole('log').querySelectorAll('[data-message-id]')].map((el) =>
      el.getAttribute('data-message-id'),
    );
    expect(bodies).toEqual(['old', 'recent']); // older above, newest last
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Charger les messages précédents/ })).not.toBeInTheDocument(),
    );
  });

  it('keeps the reading position stable across a prepend (no jump under the reader)', async () => {
    const feed = await openWithHistory('c1');
    feed.scrollTop = 120; // the reader scrolled up into history
    fireEvent.scroll(feed);
    // The older page adds 600px of content above: the fetch resolving is when the feed grows.
    vi.mocked(api.getSalonMessages).mockImplementation(async () => {
      feedHeight = 1600;
      return { items: [msg({ id: 'old', body: 'ancien' })], nextCursor: null };
    });
    await userEvent.click(screen.getByRole('button', { name: /Charger les messages précédents/ }));
    await screen.findByText('ancien');
    // Same content under the same pixel: scrollTop moved by exactly the height that was prepended.
    expect(feed.scrollTop).toBe(720);
  });

  it('auto-loads the previous page when the top of the feed comes into view', async () => {
    let io: { cb: IntersectionObserverCallback } | null = null;
    class MockIO {
      cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
        io = this;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIO);
    try {
      await openWithHistory('c1');
      vi.mocked(api.getSalonMessages).mockResolvedValue({
        items: [msg({ id: 'old', body: 'ancien' })],
        nextCursor: null,
      });
      await act(async () => {
        io!.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as unknown as IntersectionObserver);
      });
      expect(await screen.findByText('ancien')).toBeInTheDocument();
      expect(vi.mocked(api.getSalonMessages)).toHaveBeenLastCalledWith('c1');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
