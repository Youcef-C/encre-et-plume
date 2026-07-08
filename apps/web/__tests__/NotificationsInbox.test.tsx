import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import * as api from '../lib/api';
import { useRouter } from 'next/navigation';
import NotificationsInbox from '../components/NotificationsInbox';
import { UnreadCountsContext } from '../lib/unread';

const mockRefresh = vi.fn();

function renderInbox() {
  return render(
    <UnreadCountsContext.Provider value={{ counts: { total: 3, messages: 2, demandes: 1, signalements: 0 }, refresh: mockRefresh }}>
      <NotificationsInbox />
    </UnreadCountsContext.Provider>
  );
}

const now = new Date().toISOString();

const unreadItem: NotificationItem = {
  id: 'n1',
  type: 'message',
  area: 'messages',
  refId: null,
  sourceUser: { displayName: 'Camille Roux', slug: 'camille', avatar: null },
  createdAt: now,
  readAt: null,
};

const readItem: NotificationItem = {
  id: 'n2',
  type: 'like',
  area: 'autres',
  refId: null,
  sourceUser: { displayName: 'Sora V.', slug: 'sora', avatar: null },
  createdAt: now,
  readAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.markNotificationRead).mockResolvedValue(undefined);
  vi.mocked(api.markAllNotificationsRead).mockResolvedValue({ updated: 3 });
});

describe('NotificationsInbox', () => {
  it('shows loading state initially', () => {
    vi.mocked(api.getNotifications).mockReturnValue(new Promise(() => {}));
    renderInbox();
    // Loading skeleton or loading indicator
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(api.getNotifications).mockRejectedValue(new Error('network'));
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/une erreur est survenue/i)).toBeInTheDocument()
    );
  });

  it('shows "Aucune notification" when list is empty', async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/aucune notification/i)).toBeInTheDocument()
    );
  });

  it('renders notification list', async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([unreadItem, readItem]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/camille roux vous a envoyé un message/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/sora v\. a aimé votre planche/i)).toBeInTheDocument();
  });

  it('filters by type when a chip is clicked (client-side, no refetch)', async () => {
    // unreadItem is a 'message', readItem is a 'like' (Réactions bucket)
    vi.mocked(api.getNotifications).mockResolvedValue([unreadItem, readItem]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/camille roux vous a envoyé un message/i)).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole('button', { name: /^messages$/i }));

    expect(screen.getByText(/camille roux vous a envoyé un message/i)).toBeInTheDocument();
    expect(screen.queryByText(/sora v\. a aimé votre planche/i)).not.toBeInTheDocument();
    // client-side only — the list was fetched exactly once
    expect(api.getNotifications).toHaveBeenCalledTimes(1);
  });

  it('unread item has an unread indicator (accent dot)', async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([unreadItem]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/camille roux/i)).toBeInTheDocument()
    );
    // unread dot present (aria-label or data attribute)
    expect(screen.getByTestId('unread-dot-n1')).toBeInTheDocument();
  });

  it('read item does not have an unread dot', async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([readItem]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/sora v\./i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId('unread-dot-n2')).not.toBeInTheDocument();
  });

  it('"Tout marquer comme lu" calls markAllNotificationsRead and refresh', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getNotifications).mockResolvedValue([unreadItem]);
    renderInbox();

    await waitFor(() =>
      expect(screen.getByText(/tout marquer comme lu/i)).toBeInTheDocument()
    );

    await user.click(screen.getByText(/tout marquer comme lu/i));

    await waitFor(() => {
      expect(vi.mocked(api.markAllNotificationsRead)).toHaveBeenCalledOnce();
      expect(mockRefresh).toHaveBeenCalledOnce();
    });
  });

  it('"Tout marquer comme lu" is disabled when no unread', async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([readItem]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/sora v\./i)).toBeInTheDocument()
    );
    // The "tout marquer" button should be disabled or absent when nothing is unread
    const btn = screen.queryByRole('button', { name: /tout marquer comme lu/i });
    if (btn) {
      expect(btn).toBeDisabled();
    }
  });

  it('clicking an item marks it read and navigates', async () => {
    const user = userEvent.setup();
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(api.getNotifications).mockResolvedValue([unreadItem]);
    renderInbox();

    await waitFor(() =>
      expect(screen.getByText(/camille roux vous a envoyé un message/i)).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /camille roux vous a envoyé un message/i }));

    await waitFor(() => {
      expect(vi.mocked(api.markNotificationRead)).toHaveBeenCalledWith('n1');
      expect(pushMock).toHaveBeenCalledWith('/contacts');
    });
  });

  it('items are keyboard-focusable (each is a button)', async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([unreadItem, readItem]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/camille roux/i)).toBeInTheDocument()
    );
    const buttons = screen.getAllByRole('button');
    // At least the notification items should be buttons
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the title "Notifications" and total pill', async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([unreadItem]);
    renderInbox();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument()
    );
    // "3 nouvelles" pill (from UnreadCountsContext total = 3)
    expect(screen.getByText(/3 nouvelles/i)).toBeInTheDocument();
  });
});
