import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ProfileResponse } from '@encre-et-plume/shared';
import ProfileActions from '../components/ProfileActions';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

// The invite modal fetches projects on open — stub the API so it renders cleanly.
vi.mock('../lib/api', () => ({
  getMyProjects: vi.fn().mockResolvedValue({ items: [] }),
  createInvitation: vi.fn(),
  createBlock: vi.fn().mockResolvedValue({ id: 'b1', userId: 'theo-1', kind: 'block', createdAt: '2026-07-08T00:00:00.000Z' }),
  deleteBlock: vi.fn().mockResolvedValue(undefined),
}));

import { deleteBlock } from '../lib/api';

const profile = {
  userId: 'theo-1',
  slug: 'theo-m',
  displayName: 'Théo M.',
  avatar: null,
  roleLine: 'Dessinateur·rice · Lyon',
  creatorRoles: ['dessinateur'],
  viewerHasBlocked: false,
  blockedByTarget: false,
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

  it('hides the overflow menu for anonymous visitors', () => {
    render(<ProfileActions profile={profile} account={null} />);
    expect(screen.queryByRole('button', { name: /plus d'actions/i })).not.toBeInTheDocument();
  });

  it('hides the overflow menu on your own profile', () => {
    render(<ProfileActions profile={{ ...profile, userId: account.id } as unknown as ProfileResponse} account={account} />);
    expect(screen.queryByRole('button', { name: /plus d'actions/i })).not.toBeInTheDocument();
  });

  it('opens the block confirmation modal from the overflow menu', async () => {
    const user = userEvent.setup();
    render(<ProfileActions profile={profile} account={account} />);
    await user.click(screen.getByRole('button', { name: /plus d'actions sur le profil de théo m\./i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Bloquer' }));
    expect(await screen.findByRole('dialog', { name: /bloquer théo m\./i })).toBeInTheDocument();
  });

  // ── MC-10 round 2 (F9): blocker-side profile state ─────────────────────────
  const blockedProfile = { ...profile, viewerHasBlocked: true } as unknown as ProfileResponse;

  it('offers a "Débloquer" item (not "Bloquer") when the viewer has blocked this profile', async () => {
    const user = userEvent.setup();
    render(<ProfileActions profile={blockedProfile} account={account} />);
    await user.click(screen.getByRole('button', { name: /plus d'actions sur le profil de théo m\./i }));
    expect(await screen.findByRole('menuitem', { name: /débloquer théo m\./i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Bloquer' })).not.toBeInTheDocument();
  });

  it('"Débloquer" calls deleteBlock, reports the change, and flips the menu back to "Bloquer"', async () => {
    const user = userEvent.setup();
    const onBlockedChange = vi.fn();
    render(
      <ProfileActions profile={blockedProfile} account={account} onBlockedChange={onBlockedChange} />,
    );
    await user.click(screen.getByRole('button', { name: /plus d'actions sur le profil de théo m\./i }));
    await user.click(await screen.findByRole('menuitem', { name: /débloquer théo m\./i }));
    expect(deleteBlock).toHaveBeenCalledWith('theo-1', 'block');
    expect(await screen.findByText('Compte débloqué.')).toBeInTheDocument();
    expect(onBlockedChange).toHaveBeenCalledWith(false);
    // The overflow now offers "Bloquer" again (uncontrolled internal state flipped).
    await user.click(screen.getByRole('button', { name: /plus d'actions sur le profil de théo m\./i }));
    expect(await screen.findByRole('menuitem', { name: 'Bloquer' })).toBeInTheDocument();
  });

  it('reports the blocked state after a successful block from the modal (no refetch)', async () => {
    const user = userEvent.setup();
    const onBlockedChange = vi.fn();
    render(<ProfileActions profile={profile} account={account} onBlockedChange={onBlockedChange} />);
    await user.click(screen.getByRole('button', { name: /plus d'actions sur le profil de théo m\./i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Bloquer' }));
    const dialog = await screen.findByRole('dialog', { name: /bloquer théo m\./i });
    const { getByRole } = within(dialog);
    await user.click(getByRole('button', { name: 'Bloquer' }));
    expect(onBlockedChange).toHaveBeenCalledWith(true);
    // The overflow now offers "Débloquer".
    await user.click(await screen.findByRole('button', { name: /plus d'actions sur le profil de théo m\./i }));
    expect(await screen.findByRole('menuitem', { name: /débloquer théo m\./i })).toBeInTheDocument();
  });
});
