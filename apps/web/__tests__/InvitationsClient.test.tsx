import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvitationDto, InvitationsResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    listInvitations: vi.fn(),
    respondInvitation: vi.fn(),
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import * as api from '../lib/api';
import InvitationsClient from '../components/invitations/InvitationsClient';

const now = new Date().toISOString();

function inv(over: Partial<InvitationDto>): InvitationDto {
  return {
    id: 'i1',
    from: { userId: 'u1', name: 'Camille Roux', slug: 'camille', avatarUrl: null, role: 'scenariste' },
    to: { userId: 'me', name: 'Moi', slug: 'moi', avatarUrl: null, role: 'dessinateur' },
    project: { id: 'p1', title: 'Lames de Brume', meta: 'Manga · Seinen · en cours', cover: null },
    message: 'Court message.',
    status: 'pending',
    createdAt: now,
    respondedAt: null,
    ...over,
  };
}

function resp(items: InvitationDto[]): InvitationsResponse {
  return { items, page: 1, pageSize: 20, total: items.length };
}

const pending = inv({ id: 'pend', status: 'pending', from: { userId: 'u1', name: 'Camille Roux', slug: 'camille', avatarUrl: null, role: 'scenariste' } });
const accepted = inv({ id: 'acc', status: 'accepted', from: { userId: 'u2', name: 'Théo Marchand', slug: 'theo', avatarUrl: null, role: 'dessinateur' }, respondedAt: now });
const declined = inv({ id: 'dec', status: 'declined', from: { userId: 'u3', name: 'Maya L.', slug: 'maya', avatarUrl: null, role: 'scenariste' }, respondedAt: now });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InvitationsClient', () => {
  it('renders the received invitations with the complementary-craft verb', async () => {
    vi.mocked(api.listInvitations).mockResolvedValue(resp([pending, accepted, declined]));
    render(<InvitationsClient />);

    expect(await screen.findByRole('heading', { name: 'Invitations' })).toBeInTheDocument();
    expect(screen.getByText('Toutes les propositions de collaboration reçues.')).toBeInTheDocument();
    // scenariste inviter -> invited to "dessiner"
    expect(screen.getByText('Camille Roux')).toBeInTheDocument();
    expect(screen.getAllByText(/vous invite à dessiner/).length).toBeGreaterThan(0);
    // dessinateur inviter -> invited to "écrire"
    expect(screen.getByText(/vous invite à écrire/)).toBeInTheDocument();
    expect(api.listInvitations).toHaveBeenCalledWith('received');
  });

  it('filters client-side when a status chip is clicked (no refetch)', async () => {
    vi.mocked(api.listInvitations).mockResolvedValue(resp([pending, accepted, declined]));
    render(<InvitationsClient />);
    await screen.findByText('Camille Roux');

    await userEvent.click(screen.getByRole('button', { name: /En attente/ }));

    expect(screen.getByText('Camille Roux')).toBeInTheDocument();
    expect(screen.queryByText('Théo Marchand')).not.toBeInTheDocument();
    expect(screen.queryByText('Maya L.')).not.toBeInTheDocument();
    // still only the initial load — no refetch
    expect(api.listInvitations).toHaveBeenCalledTimes(1);
  });

  it('Accepter calls respondInvitation and optimistically flips the status', async () => {
    vi.mocked(api.listInvitations).mockResolvedValue(resp([pending]));
    vi.mocked(api.respondInvitation).mockResolvedValue({ ...pending, status: 'accepted', respondedAt: now });
    render(<InvitationsClient />);
    await screen.findByText('Camille Roux');

    await userEvent.click(screen.getByRole('button', { name: 'Accepter' }));

    expect(api.respondInvitation).toHaveBeenCalledWith('pend', 'accepted');
    expect(await screen.findByText('✓ Acceptée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument();
  });

  it('Refuser calls respondInvitation with declined', async () => {
    vi.mocked(api.listInvitations).mockResolvedValue(resp([pending]));
    vi.mocked(api.respondInvitation).mockResolvedValue({ ...pending, status: 'declined', respondedAt: now });
    render(<InvitationsClient />);
    await screen.findByText('Camille Roux');

    await userEvent.click(screen.getByRole('button', { name: 'Refuser' }));

    expect(api.respondInvitation).toHaveBeenCalledWith('pend', 'declined');
    expect(await screen.findByText('✕ Refusée')).toBeInTheDocument();
  });

  it('links the sender name and avatar to their profile', async () => {
    vi.mocked(api.listInvitations).mockResolvedValue(resp([pending]));
    render(<InvitationsClient />);
    // Name link → /{slug}
    const nameLink = await screen.findByRole('link', { name: 'Camille Roux' });
    expect(nameLink).toHaveAttribute('href', '/camille');
    // Avatar link, labelled with the sender
    const avatarLink = screen.getByRole('link', { name: 'Voir le profil de Camille Roux' });
    expect(avatarLink).toHaveAttribute('href', '/camille');
  });

  it('switches to the Envoyées tab and lists sent invitations by recipient, no respond buttons', async () => {
    const sent = inv({
      id: 'sent1',
      status: 'pending',
      to: { userId: 'r1', name: 'Lina Dubois', slug: 'lina', avatarUrl: null, role: 'dessinateur' },
    });
    vi.mocked(api.listInvitations).mockImplementation((dir) =>
      Promise.resolve(resp(dir === 'sent' ? [sent] : [pending])),
    );
    render(<InvitationsClient />);
    await screen.findByText('Camille Roux'); // received view loads first
    expect(api.listInvitations).toHaveBeenCalledWith('received');

    await userEvent.click(screen.getByRole('button', { name: /Envoyées/ }));

    // recipient (item.to) shown, linked to their profile
    const recipient = await screen.findByRole('link', { name: 'Lina Dubois' });
    expect(recipient).toHaveAttribute('href', '/lina');
    expect(api.listInvitations).toHaveBeenCalledWith('sent');
    // sender can't respond to their own sent invite
    expect(screen.queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    // status still surfaced
    expect(screen.getByText('● En attente')).toBeInTheDocument();
  });

  it('accepted project invite: "Ouvrir" links to the project kanban /projet/{slug}', async () => {
    const acceptedWithProject = inv({
      id: 'accp',
      status: 'accepted',
      respondedAt: now,
      project: { id: 'p1', title: 'Lames de Brume', meta: 'Manga · Seinen · en cours', cover: null, slug: 'lames-de-brume' },
    });
    vi.mocked(api.listInvitations).mockResolvedValue(resp([acceptedWithProject]));
    render(<InvitationsClient />);
    const open = await screen.findByRole('link', { name: 'Ouvrir' });
    expect(open).toHaveAttribute('href', '/projet/lames-de-brume');
  });

  it('shows the empty state', async () => {
    vi.mocked(api.listInvitations).mockResolvedValue(resp([]));
    render(<InvitationsClient />);
    expect(await screen.findByText('Aucune invitation pour le moment.')).toBeInTheDocument();
  });

  it('shows the error state on failure', async () => {
    vi.mocked(api.listInvitations).mockRejectedValue(new Error('boom'));
    render(<InvitationsClient />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
