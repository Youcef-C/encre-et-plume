import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const messagingValue: { socket: unknown; connectionState: string } = {
  socket: mockSocket,
  connectionState: 'connected',
};
vi.mock('../lib/messaging', () => ({ useMessaging: () => messagingValue }));

vi.mock('../lib/api', () => ({
  getSalon: vi.fn(),
  getSalonMessages: vi.fn(),
  getSalonOnline: vi.fn(),
  joinSalon: vi.fn(),
  leaveSalon: vi.fn(),
  sendSalonMessage: vi.fn(),
  markSalonRead: vi.fn(),
  getMyBlocks: vi.fn(),
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
  preferences: { theme: 'system' },
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

  it('shows the "· Connecté" indicator in the collapsed bar only once the salon is joined', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    // Always-visible header (dock still folded) surfaces the joined+connected state.
    expect(await screen.findByText(/en ligne · Connecté/)).toBeInTheDocument();
  });

  it('does NOT show "· Connecté" for a logged-in non-member', async () => {
    renderDock(); // default summary → isMember: false
    await screen.findByText(/144 en ligne/);
    expect(screen.queryByText(/· Connecté/)).not.toBeInTheDocument();
  });

  it('header is a button whose accessible name includes the unread count and toggles aria-expanded', async () => {
    renderDock();
    const header = await screen.findByRole('button', { name: /Le Comptoir/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header).toHaveAccessibleName(/aucun message non lu/i);
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the join panel for a non-member and reveals the composer after joining', async () => {
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
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
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Quitter/ }));
    await waitFor(() => expect(api.leaveSalon).toHaveBeenCalled());
    expect(await screen.findByText(/Rejoignez/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Votre message…')).not.toBeInTheDocument();
  });

  it('shows the empty-feed line when there is no history', async () => {
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
    expect(await screen.findByText('Soyez le premier à écrire.')).toBeInTheDocument();
  });

  it('renders history messages with sender names above bubbles', async () => {
    vi.mocked(api.getSalonMessages).mockResolvedValue({
      items: [msg({ id: 'm1', senderName: 'Yuki Moreau', body: 'Salut' })],
      nextCursor: null,
    });
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
    expect(await screen.findByText('Salut')).toBeInTheDocument();
    expect(screen.getByText('Yuki Moreau')).toBeInTheDocument();
  });

  it('counts an incoming message as unread while collapsed and clears it on expand (member)', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    const header = await screen.findByRole('button', { name: /Le Comptoir/ });
    await fire(WS_EVENTS.salonMessage, { message: msg({ id: 'in1' }) });
    expect(await screen.findByText('1 nouveau·x')).toBeInTheDocument();
    expect(header).toHaveAttribute('data-unread', 'yes');

    await userEvent.click(header);
    await waitFor(() => expect(api.markSalonRead).toHaveBeenCalled());
    expect(screen.queryByText('1 nouveau·x')).not.toBeInTheDocument();
  });

  it('updates the online count from a presence event', async () => {
    renderDock();
    await screen.findByText(/144 en ligne/);
    await fire(WS_EVENTS.salonPresence, { onlineCount: 152 });
    expect(await screen.findByText(/152 en ligne/)).toBeInTheDocument();
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
    const header = await screen.findByRole('button', { name: /Le Comptoir/ });
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
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
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
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
    const input = await screen.findByPlaceholderText('Votre message…');
    await userEvent.type(input, 'unique-echo-body{Enter}');
    await waitFor(() => expect(api.sendSalonMessage).toHaveBeenCalledWith('unique-echo-body'));
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
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
    const input = await screen.findByPlaceholderText('Votre message…');
    await userEvent.type(input, 'coucou{Enter}');
    await waitFor(() => expect(api.sendSalonMessage).toHaveBeenCalledWith('coucou'));
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    vi.mocked(api.sendSalonMessage).mockResolvedValueOnce(msg({ id: 'real', senderId: 'me-1', senderName: 'Camille R.', body: 'coucou' }));
    await userEvent.click(retry);
    await waitFor(() => expect(api.sendSalonMessage).toHaveBeenCalledTimes(2));
  });

  // ── MC-11 mention impact + scroll-to-newest ──

  it('(a) flashes an incoming @-mention of me in the feed', async () => {
    vi.mocked(api.getSalon).mockResolvedValue(summary({ isMember: true }));
    renderDock();
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
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
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
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
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
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
    const header = await screen.findByRole('button', { name: /Le Comptoir/ });
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
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
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
    // Even a joined member loses "· Connecté" while the realtime link is down.
    await screen.findByText(/144 en ligne/);
    expect(screen.queryByText(/· Connecté/)).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Le Comptoir/ }));
    expect(await screen.findByText('Reconnexion…')).toBeInTheDocument();
  });
});
