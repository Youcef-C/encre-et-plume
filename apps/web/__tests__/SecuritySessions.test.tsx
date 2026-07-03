import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecuritySessions from '../components/security/SecuritySessions';

vi.mock('../lib/api', () => ({
  getSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

import * as api from '../lib/api';

const SESSIONS = [
  {
    id: 'jti-1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0',
    ip: '192.168.1.1',
    lastSeenAt: new Date(Date.now() - 60000).toISOString(),
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    current: true,
  },
  {
    id: 'jti-2',
    userAgent: 'Mozilla/5.0 Firefox/118',
    ip: '10.0.0.2',
    lastSeenAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    current: false,
  },
];

describe('SecuritySessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getSessions).mockResolvedValue({ sessions: SESSIONS });
    vi.mocked(api.revokeSession).mockResolvedValue(undefined);
    vi.mocked(api.revokeOtherSessions).mockResolvedValue(undefined);
  });

  it('renders loading state initially', () => {
    vi.mocked(api.getSessions).mockReturnValue(new Promise(() => {}));
    render(<SecuritySessions />);
    // Loading skeleton visible; no session rows yet
    expect(screen.queryByText(/session actuelle/i)).not.toBeInTheDocument();
  });

  it('shows "Session actuelle" badge on the current session', async () => {
    render(<SecuritySessions />);
    expect(await screen.findByText('Session actuelle')).toBeInTheDocument();
  });

  it('shows IP address as approximate location', async () => {
    render(<SecuritySessions />);
    expect(await screen.findByText('192.168.1.1')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.2')).toBeInTheDocument();
  });

  it('renders "Dernière activité" for each session', async () => {
    render(<SecuritySessions />);
    await screen.findByText('Session actuelle');
    // relative time labels should appear
    expect(screen.getAllByText(/dernière activité/i).length).toBeGreaterThan(0);
  });

  it('"Déconnecter" is disabled on the current session row', async () => {
    render(<SecuritySessions />);
    await screen.findByText('Session actuelle');
    const buttons = screen.getAllByRole('button', { name: /déconnecter/i });
    // The current session button should be disabled
    const disabledBtn = buttons.find((b) => (b as HTMLButtonElement).disabled);
    expect(disabledBtn).toBeTruthy();
  });

  it('calls revokeSession and refreshes the list on non-current revoke', async () => {
    vi.mocked(api.getSessions).mockResolvedValue({ sessions: [SESSIONS[0]] });
    vi.mocked(api.revokeSession).mockResolvedValue(undefined);

    // Return full list initially, then filtered list after revoke
    vi.mocked(api.getSessions)
      .mockResolvedValueOnce({ sessions: SESSIONS })
      .mockResolvedValueOnce({ sessions: [SESSIONS[0]] });

    const user = userEvent.setup();
    render(<SecuritySessions />);
    await screen.findByText('Session actuelle');

    const buttons = screen.getAllByRole('button', { name: /déconnecter/i });
    const activeBtn = buttons.find((b) => !(b as HTMLButtonElement).disabled)!;
    await user.click(activeBtn);

    await waitFor(() => {
      expect(vi.mocked(api.revokeSession)).toHaveBeenCalledWith('jti-2');
    });
    await waitFor(() => {
      expect(vi.mocked(api.getSessions)).toHaveBeenCalledTimes(2);
    });
  });

  it('shows confirm dialog for "Déconnecter toutes les autres sessions"', async () => {
    const user = userEvent.setup();
    render(<SecuritySessions />);
    await screen.findByText('Session actuelle');

    await user.click(screen.getByRole('button', { name: /déconnecter toutes les autres/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('calls revokeOtherSessions on confirm', async () => {
    vi.mocked(api.getSessions)
      .mockResolvedValueOnce({ sessions: SESSIONS })
      .mockResolvedValueOnce({ sessions: [SESSIONS[0]] });

    const user = userEvent.setup();
    render(<SecuritySessions />);
    await screen.findByText('Session actuelle');

    await user.click(screen.getByRole('button', { name: /déconnecter toutes les autres/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /confirmer/i }));

    await waitFor(() => {
      expect(vi.mocked(api.revokeOtherSessions)).toHaveBeenCalled();
    });
  });
});
