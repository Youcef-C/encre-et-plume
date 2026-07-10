import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SalonRosterItem } from '@encre-et-plume/shared';
import { WS_EVENTS } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// ── shared socket mock: a handler bus the test can fire membership events through. ──
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
const messagingValue = { socket: mockSocket as unknown, openDm };
vi.mock('../lib/messaging', () => ({ useMessaging: () => messagingValue }));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock('../lib/api', () => ({
  getSalonPresence: vi.fn(),
  createBlock: vi.fn(),
}));

import * as api from '../lib/api';
import SalonRoster from '../components/salon/SalonRoster';

const account = { id: 'me-1', displayName: 'Camille R.' };

const self = (over: Partial<SalonRosterItem> = {}): SalonRosterItem => ({
  id: 'me-1',
  name: 'Camille R.',
  avatarUrl: null,
  slug: 'camille-r',
  self: true,
  ...over,
});
const other = (over: Partial<SalonRosterItem> = {}): SalonRosterItem => ({
  id: 'u-lea',
  name: 'Léa B.',
  avatarUrl: null,
  slug: 'lea-b',
  self: false,
  ...over,
});

function renderRoster(props: Partial<React.ComponentProps<typeof SalonRoster>> = {}) {
  return render(
    <SessionContext.Provider value={{ account } as never}>
      <SalonRoster blockedIds={new Set()} onBlocked={vi.fn()} {...props} />
    </SessionContext.Provider>,
  );
}

const triggerName = /Voir les membres présents/;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  sessionStorage.clear();
  vi.mocked(api.getSalonPresence).mockResolvedValue({ count: 2, items: [self(), other()] });
  vi.mocked(api.createBlock).mockResolvedValue({} as never);
});

describe('SalonRoster — user-icon trigger + count badge', () => {
  it('renders a collapsed user-icon button (aria-expanded=false, no "Le Comptoir" in the name) with the count badge', async () => {
    vi.mocked(api.getSalonPresence).mockResolvedValue({
      count: 3,
      items: [self(), other(), other({ id: 'u-x', name: 'X', slug: 'x' })],
    });
    renderRoster();
    const trigger = await screen.findByRole('button', { name: triggerName });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Must NOT collide with the dock header button (mc11 `getByRole('button', {name:/Le Comptoir/})`).
    expect(trigger).not.toHaveAccessibleName(/Le Comptoir/);
    // Badge === presence.count (self included).
    expect(await within(trigger).findByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Voir le profil/ })).not.toBeInTheDocument();
  });

  it('transforms the button into the list on toggle and persists the open state', async () => {
    renderRoster();
    const trigger = await screen.findByRole('button', { name: triggerName });
    await userEvent.click(trigger);
    expect(screen.queryByRole('button', { name: triggerName })).not.toBeInTheDocument();
    const closeBtn = await screen.findByRole('button', { name: 'Fermer la liste des membres' });
    expect(closeBtn).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Voir le profil de Léa B.' })).toBeInTheDocument();
    expect(sessionStorage.getItem('ep-salon-roster-open')).toBe('1');

    await userEvent.click(closeBtn);
    expect(await screen.findByRole('button', { name: triggerName })).toBeInTheDocument();
    expect(sessionStorage.getItem('ep-salon-roster-open')).toBe('0');
  });

  it('starts open when sessionStorage remembers it', async () => {
    sessionStorage.setItem('ep-salon-roster-open', '1');
    renderRoster();
    expect(await screen.findByRole('link', { name: 'Voir le profil de Léa B.' })).toBeInTheDocument();
  });
});

describe('SalonRoster — list, self row, filtering & live updates', () => {
  beforeEach(() => sessionStorage.setItem('ep-salon-roster-open', '1'));

  it('lists other members with a profile link labelled by name', async () => {
    renderRoster();
    const link = await screen.findByRole('link', { name: 'Voir le profil de Léa B.' });
    expect(link).toHaveAttribute('href', '/lea-b');
  });

  it('renders the caller as their own row with a "vous" marker and NO actions menu', async () => {
    renderRoster();
    await screen.findByText('Léa B.');
    // Own row is shown and flagged, but you can't DM/block yourself.
    expect(screen.getByText('· vous')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions sur Camille R.' })).not.toBeInTheDocument();
    // Other members keep their actions menu.
    expect(screen.getByRole('button', { name: 'Actions sur Léa B.' })).toBeInTheDocument();
  });

  it('drops a blocked user defensively even if the server still returned them', async () => {
    vi.mocked(api.getSalonPresence).mockResolvedValue({
      count: 3,
      items: [self(), other(), other({ id: 'u-bloc', name: 'Bloqué', slug: 'bloc' })],
    });
    renderRoster({ blockedIds: new Set(['u-bloc']) });
    expect(await screen.findByText('Léa B.')).toBeInTheDocument();
    expect(screen.queryByText('Bloqué')).not.toBeInTheDocument();
  });

  it('adds/removes rows live from salon:member:joined / :left and keeps the header count in sync', async () => {
    renderRoster();
    await screen.findByText('Léa B.');
    expect(screen.getByText(/2 en ligne dans Le Comptoir/)).toBeInTheDocument();
    await fire(WS_EVENTS.salonMemberJoined, { user: { id: 'u-noe', name: 'Noé P.', avatarUrl: null, slug: 'noe-p' } });
    expect(await screen.findByText('Noé P.')).toBeInTheDocument();
    expect(screen.getByText(/3 en ligne dans Le Comptoir/)).toBeInTheDocument();
    await fire(WS_EVENTS.salonMemberLeft, { userId: 'u-lea' });
    await waitFor(() => expect(screen.queryByText('Léa B.')).not.toBeInTheDocument());
    expect(screen.getByText(/2 en ligne dans Le Comptoir/)).toBeInTheDocument();
    expect(api.getSalonPresence).toHaveBeenCalledTimes(1);
  });

  it('ignores the echo of my own join and a blocked-user join (count untouched)', async () => {
    renderRoster({ blockedIds: new Set(['u-bloc']) });
    await screen.findByText('Léa B.');
    await fire(WS_EVENTS.salonMemberJoined, { user: { id: 'me-1', name: 'Camille R.', avatarUrl: null, slug: 'camille-r' } });
    await fire(WS_EVENTS.salonMemberJoined, { user: { id: 'u-bloc', name: 'Bloqué', avatarUrl: null, slug: 'bloc' } });
    expect(screen.queryByText('Bloqué')).not.toBeInTheDocument();
    expect(screen.getByText(/2 en ligne dans Le Comptoir/)).toBeInTheDocument();
  });

  it('ignores the echo of my OWN leave (own membership is refetch-driven, not the WS echo)', async () => {
    renderRoster(); // presence includes my self row + Léa
    await screen.findByText('· vous');
    await fire(WS_EVENTS.salonMemberLeft, { userId: 'me-1' });
    // My own row is NOT dropped by the echo — treated identically to the self join echo.
    expect(screen.getByText('· vous')).toBeInTheDocument();
    expect(screen.getByText(/2 en ligne dans Le Comptoir/)).toBeInTheDocument();
  });

  it('refetches presence when the membershipVersion signal changes (own Rejoindre)', async () => {
    sessionStorage.setItem('ep-salon-roster-open', '1');
    vi.mocked(api.getSalonPresence)
      .mockResolvedValueOnce({ count: 1, items: [other()] })
      .mockResolvedValue({ count: 2, items: [other(), self()] });
    const { rerender } = render(
      <SessionContext.Provider value={{ account } as never}>
        <SalonRoster blockedIds={new Set()} onBlocked={vi.fn()} membershipVersion={0} />
      </SessionContext.Provider>,
    );
    await screen.findByText('Léa B.');
    expect(screen.getByText(/1 en ligne dans Le Comptoir/)).toBeInTheDocument();
    expect(screen.queryByText('· vous')).not.toBeInTheDocument();

    // Rejoindre → the dock bumps membershipVersion → the roster refetches (self appears + count up).
    rerender(
      <SessionContext.Provider value={{ account } as never}>
        <SalonRoster blockedIds={new Set()} onBlocked={vi.fn()} membershipVersion={1} />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(api.getSalonPresence).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('· vous')).toBeInTheDocument();
    expect(screen.getByText(/2 en ligne dans Le Comptoir/)).toBeInTheDocument();
  });
});

describe('SalonRoster — per-row actions', () => {
  beforeEach(() => sessionStorage.setItem('ep-salon-roster-open', '1'));

  it('"Voir le profil" navigates to the profile', async () => {
    renderRoster();
    await screen.findByText('Léa B.');
    await userEvent.click(screen.getByRole('button', { name: 'Actions sur Léa B.' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Voir le profil' }));
    expect(mockPush).toHaveBeenCalledWith('/lea-b');
  });

  it('"Envoyer un message" opens a DM with the user', async () => {
    renderRoster();
    await screen.findByText('Léa B.');
    await userEvent.click(screen.getByRole('button', { name: 'Actions sur Léa B.' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Envoyer un message' }));
    expect(openDm).toHaveBeenCalledWith('u-lea');
  });

  it('"Bloquer" confirms then removes the row and lifts the block up', async () => {
    const onBlocked = vi.fn();
    renderRoster({ onBlocked });
    await screen.findByText('Léa B.');
    await userEvent.click(screen.getByRole('button', { name: 'Actions sur Léa B.' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Bloquer Léa B.' }));
    const dialog = await screen.findByRole('dialog', { name: /Bloquer Léa B\./ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquer' }));
    await waitFor(() => expect(screen.queryByText('Léa B.')).not.toBeInTheDocument());
    expect(onBlocked).toHaveBeenCalledWith('u-lea');
  });
});

describe('SalonRoster — states', () => {
  beforeEach(() => sessionStorage.setItem('ep-salon-roster-open', '1'));

  it('shows your own row plus the empty-of-others message when alone', async () => {
    vi.mocked(api.getSalonPresence).mockResolvedValue({ count: 1, items: [self()] });
    renderRoster();
    expect(await screen.findByText('· vous')).toBeInTheDocument();
    expect(screen.getByText("Personne d'autre pour le moment")).toBeInTheDocument();
  });

  it('shows an error with a working "Réessayer" retry', async () => {
    vi.mocked(api.getSalonPresence).mockRejectedValueOnce(new Error('boom'));
    renderRoster();
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    vi.mocked(api.getSalonPresence).mockResolvedValue({ count: 2, items: [self(), other()] });
    await userEvent.click(retry);
    expect(await screen.findByText('Léa B.')).toBeInTheDocument();
  });
});
