import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import type { UnreadCounts } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getUnreadCounts: vi.fn(),
  };
});

// Import after mock is declared so vi.mocked works
import * as api from '../lib/api';
import { UnreadProvider, useUnreadCount, useUnreadCounts } from '../lib/unread';

const mockAccount: AccountSummary = {
  id: 'c1',
  displayName: 'Yuki',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  emailVerified: true,
  slug: 'yuki',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system', dmPolicy: 'requests' },
  needsCguReconsent: false,
  onboarded: false,
  isAdult: true,
};

const mockCounts: UnreadCounts = { total: 5, messages: 3, demandes: 2, signalements: 0 };

function Consumer() {
  const total = useUnreadCount();
  const { counts, refresh } = useUnreadCounts();
  return (
    <div>
      <span data-testid="total">{total}</span>
      <span data-testid="messages">{counts.messages}</span>
      <span data-testid="demandes">{counts.demandes}</span>
      <span data-testid="signalements">{counts.signalements}</span>
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}

function renderWithSession(account: AccountSummary | null) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <UnreadProvider>
        <Consumer />
      </UnreadProvider>
    </SessionContext.Provider>
  );
}

beforeEach(() => {
  vi.mocked(api.getUnreadCounts).mockResolvedValue(mockCounts);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UnreadProvider', () => {
  it('fetches counts on mount when account is present', async () => {
    renderWithSession(mockAccount);
    await waitFor(() => {
      expect(screen.getByTestId('total').textContent).toBe('5');
    });
    expect(vi.mocked(api.getUnreadCounts)).toHaveBeenCalledOnce();
  });

  it('exposes counts.messages, demandes, signalements via useUnreadCounts()', async () => {
    renderWithSession(mockAccount);
    await waitFor(() => expect(screen.getByTestId('messages').textContent).toBe('3'));
    expect(screen.getByTestId('demandes').textContent).toBe('2');
    expect(screen.getByTestId('signalements').textContent).toBe('0');
  });

  it('useUnreadCount() returns counts.total', async () => {
    renderWithSession(mockAccount);
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('5'));
  });

  it('does not fetch when no account', () => {
    renderWithSession(null);
    expect(vi.mocked(api.getUnreadCounts)).not.toHaveBeenCalled();
  });

  it('starts with zeros before fetch resolves', () => {
    // Never resolves
    vi.mocked(api.getUnreadCounts).mockReturnValue(new Promise(() => {}));
    renderWithSession(mockAccount);
    expect(screen.getByTestId('total').textContent).toBe('0');
    expect(screen.getByTestId('messages').textContent).toBe('0');
  });

  it('refresh() re-fetches counts', async () => {
    const { getByRole } = renderWithSession(mockAccount);
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('5'));

    vi.mocked(api.getUnreadCounts).mockResolvedValueOnce({
      total: 1,
      messages: 1,
      demandes: 0,
      signalements: 0,
    });

    await act(async () => {
      getByRole('button', { name: /refresh/i }).click();
    });

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('1'));
    expect(vi.mocked(api.getUnreadCounts)).toHaveBeenCalledTimes(2);
  });

  it('refetches on window focus', async () => {
    renderWithSession(mockAccount);
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('5'));

    vi.mocked(api.getUnreadCounts).mockResolvedValueOnce({
      total: 0,
      messages: 0,
      demandes: 0,
      signalements: 0,
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(vi.mocked(api.getUnreadCounts)).toHaveBeenCalledTimes(2));
  });

  it('silently ignores fetch errors (no crash)', async () => {
    vi.mocked(api.getUnreadCounts).mockRejectedValueOnce(new Error('network'));
    expect(() => renderWithSession(mockAccount)).not.toThrow();
    await waitFor(() => {
      // still shows zeros
      expect(screen.getByTestId('total').textContent).toBe('0');
    });
  });
});
