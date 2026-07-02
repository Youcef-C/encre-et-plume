import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionContext } from '../lib/session';
import type { AccountSummary, QueueHealthResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getQueueHealth: vi.fn(),
  // keep other exports to avoid import errors elsewhere
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  signup: vi.fn(),
}));

// must import after vi.mock
import { getQueueHealth } from '../lib/api';
import QueuesPage from '../app/admin/queues/page';

const adminAccount: AccountSummary = {
  id: 'a1',
  displayName: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
  verified: true,
  emailVerified: true,
  slug: 'admin-user',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
};

const mockHealth: QueueHealthResponse = {
  queues: [
    { name: 'notifications-fanout', waiting: 2, active: 1, completed: 50, failed: 3, delayed: 0 },
    { name: 'email', waiting: 0, active: 0, completed: 10, failed: 0, delayed: 0 },
  ],
  deadLetter: 1,
  generatedAt: '2026-06-30T12:00:00.000Z',
};

function wrap(account: AccountSummary | null, sessionLoading = false) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: sessionLoading, refresh: vi.fn(), logout: vi.fn() }}
    >
      <QueuesPage />
    </SessionContext.Provider>,
  );
}

describe('QueuesPage (admin/queues)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while session is being fetched', () => {
    // ponytail: never-resolving promise keeps component in loading state
    vi.mocked(getQueueHealth).mockReturnValue(new Promise(() => {}));
    wrap(adminAccount, /* sessionLoading */ true);
    expect(screen.getByText(/Chargement/i)).toBeInTheDocument();
  });

  it('shows loading state while health request is in flight', async () => {
    vi.mocked(getQueueHealth).mockReturnValue(new Promise(() => {}));
    wrap(adminAccount);
    expect(screen.getByText(/Chargement/i)).toBeInTheDocument();
  });

  it('renders queue count table rows from a successful response', async () => {
    vi.mocked(getQueueHealth).mockResolvedValue(mockHealth);
    wrap(adminAccount);
    await waitFor(() => {
      expect(screen.getByText('notifications-fanout')).toBeInTheDocument();
    });
    expect(screen.getByText('email')).toBeInTheDocument();
  });

  it('renders column headers in French', async () => {
    vi.mocked(getQueueHealth).mockResolvedValue(mockHealth);
    wrap(adminAccount);
    await waitFor(() => {
      expect(screen.getByText(/En attente/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Actif/i)).toBeInTheDocument();
    expect(screen.getByText(/Terminé/i)).toBeInTheDocument();
    expect(screen.getByText(/Échoué/i)).toBeInTheDocument();
    expect(screen.getByText(/Différé/i)).toBeInTheDocument();
  });

  it('renders dead-letter count with label', async () => {
    vi.mocked(getQueueHealth).mockResolvedValue(mockHealth);
    wrap(adminAccount);
    await waitFor(() => {
      expect(screen.getByText(/Lettres mortes/i)).toBeInTheDocument();
    });
  });

  it('shows not-authorized for non-admin account without calling API', async () => {
    wrap({ ...adminAccount, role: 'utilisateur' });
    await waitFor(() => {
      expect(screen.getByText(/réservé/i)).toBeInTheDocument();
    });
    expect(getQueueHealth).not.toHaveBeenCalled();
  });

  it('shows not-authorized when account is null without calling API', async () => {
    wrap(null);
    await waitFor(() => {
      expect(screen.getByText(/réservé/i)).toBeInTheDocument();
    });
    expect(getQueueHealth).not.toHaveBeenCalled();
  });

  it('shows not-authorized message when API returns 403', async () => {
    vi.mocked(getQueueHealth).mockRejectedValue({ statusCode: 403, message: 'Forbidden' });
    wrap(adminAccount);
    await waitFor(() => {
      expect(screen.getByText(/réservé/i)).toBeInTheDocument();
    });
  });

  it('shows not-authorized message when API returns 401', async () => {
    vi.mocked(getQueueHealth).mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    wrap(adminAccount);
    await waitFor(() => {
      expect(screen.getByText(/réservé/i)).toBeInTheDocument();
    });
  });

  it('shows generic error message on non-auth errors', async () => {
    vi.mocked(getQueueHealth).mockRejectedValue({ statusCode: 500, message: 'Internal Error' });
    wrap(adminAccount);
    await waitFor(() => {
      expect(screen.getByText(/Impossible de charger/i)).toBeInTheDocument();
    });
  });

  it('uses a real table with scoped column headers for accessibility', async () => {
    vi.mocked(getQueueHealth).mockResolvedValue(mockHealth);
    wrap(adminAccount);
    await waitFor(() => {
      const ths = document.querySelectorAll('th[scope="col"]');
      expect(ths.length).toBeGreaterThan(0);
    });
  });
});
