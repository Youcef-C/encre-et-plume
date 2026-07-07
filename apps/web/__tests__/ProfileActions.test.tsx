import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ProfileResponse } from '@encre-et-plume/shared';
import ProfileActions from '../components/ProfileActions';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

// The invite modal fetches projects on open — stub the API so it renders cleanly.
vi.mock('../lib/api', () => ({
  getMyProjects: vi.fn().mockResolvedValue({ items: [] }),
  createInvitation: vi.fn(),
}));

const profile = {
  userId: 'theo-1',
  slug: 'theo-m',
  displayName: 'Théo M.',
  avatar: null,
  roleLine: 'Dessinateur·rice · Lyon',
  creatorRoles: ['dessinateur'],
} as unknown as ProfileResponse;

const account: AccountSummary = {
  id: 'viewer-1',
  displayName: 'Camille R.',
  email: 'camille@example.com',
  role: 'utilisateur',
  verified: false,
  emailVerified: true,
  slug: 'camille-roux',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

describe('ProfileActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the four visitor action buttons', () => {
    render(<ProfileActions profile={profile} account={account} />);
    expect(screen.getByRole('button', { name: /^suivre$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /soutenir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /proposer une collab/i })).toBeInTheDocument();
  });

  it('opens the invite modal for a signed-in visitor', async () => {
    const user = userEvent.setup();
    render(<ProfileActions profile={profile} account={account} />);
    await user.click(screen.getByRole('button', { name: /proposer une collab/i }));
    expect(await screen.findByRole('dialog', { name: /inviter théo m\./i })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects an anonymous visitor to /connexion instead of opening the modal', async () => {
    const user = userEvent.setup();
    render(<ProfileActions profile={profile} account={null} />);
    await user.click(screen.getByRole('button', { name: /proposer une collab/i }));
    expect(mockPush).toHaveBeenCalledWith('/connexion');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
