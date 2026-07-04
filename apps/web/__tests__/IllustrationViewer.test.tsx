// DR-6 FE-T2 (FE-2, FE-3, FE-9, FE-10, FE-11) — artwork viewer, action bar, fullscreen, admin bar.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IllustrationDetail, AccountSummary } from '@encre-et-plume/shared';
import IllustrationViewer from '../components/illustration/IllustrationViewer';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getReactionState: vi.fn().mockResolvedValue({}),
    likeReaction: vi.fn(),
    unlikeReaction: vi.fn(),
    saveReaction: vi.fn(),
    unsaveReaction: vi.fn(),
  };
});

import * as api from '../lib/api';

const detail: IllustrationDetail = {
  id: 'dr5-illus-1',
  title: 'Pluie de Néons',
  description: null,
  category: 'process',
  categoryLabel: 'Process',
  hashtags: [],
  image: null,
  dimensionsLabel: null,
  tools: null,
  license: '© Tous droits réservés',
  likeCount: 3400,
  publishedAt: null,
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'Dessinateur·rice', city: 'Lyon', avatar: null },
};

const admin: AccountSummary = { id: 'u1', slug: 'admin-1', displayName: 'Admin', role: 'admin', verified: true } as AccountSummary;

const reader: AccountSummary = { id: 'u2', slug: 'lecteur-1', displayName: 'Lecteur', role: 'utilisateur', verified: true } as AccountSummary;

describe('IllustrationViewer (DR-6)', () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(api.getReactionState).mockResolvedValue({});
  });

  it('has an artwork image role with an accessible label (FE-11)', () => {
    render(<IllustrationViewer detail={detail} account={null} />);
    expect(screen.getByRole('img', { name: 'Pluie de Néons' })).toBeInTheDocument();
  });

  it('anonymous like/save/share/report route to sign-in (F-1)', async () => {
    const user = userEvent.setup();
    render(<IllustrationViewer detail={detail} account={null} />);
    await user.click(screen.getByRole('button', { name: "J'aime" }));
    expect(push).toHaveBeenCalledWith('/connexion');
    push.mockClear();
    await user.click(screen.getByRole('button', { name: 'Ajouter à ma liste' }));
    expect(push).toHaveBeenCalledWith('/connexion');
    push.mockClear();
    await user.click(screen.getByRole('button', { name: /Partager/ }));
    expect(push).toHaveBeenCalledWith('/connexion');
    push.mockClear();
    await user.click(screen.getByRole('button', { name: /Signaler/ }));
    expect(push).toHaveBeenCalledWith('/connexion');
  });

  it('authed Partager/Signaler still show the "Bientôt disponible" stub notice', async () => {
    const user = userEvent.setup();
    render(<IllustrationViewer detail={detail} account={reader} />);
    await user.click(screen.getByRole('button', { name: /Partager/ }));
    expect(await screen.findByText('Bientôt disponible')).toBeInTheDocument();
  });

  it('DR-9: J\'aime toggles aria-pressed + count', async () => {
    const user = userEvent.setup();
    vi.mocked(api.likeReaction).mockResolvedValue({ active: true, count: 3401 });
    render(<IllustrationViewer detail={detail} account={reader} />);

    const likeBtn = screen.getByRole('button', { name: "J'aime" });
    await user.click(likeBtn);
    expect(likeBtn).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer le j\'aime' })).toHaveTextContent('3,4k'));
    expect(api.likeReaction).toHaveBeenCalledWith({ targetType: 'illustration', targetId: 'dr5-illus-1' });
  });

  it('DR-9: Enregistrer toggles saved state (no count shown)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveReaction).mockResolvedValue({ active: true, count: 1 });
    render(<IllustrationViewer detail={detail} account={reader} />);

    const saveBtn = screen.getByRole('button', { name: 'Ajouter à ma liste' });
    await user.click(saveBtn);
    expect(saveBtn).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer de ma liste' })).toBeInTheDocument());
    expect(api.saveReaction).toHaveBeenCalledWith({ targetType: 'illustration', targetId: 'dr5-illus-1' });
  });

  it('DR-9: a rejected like toggle reverts and shows an inline error', async () => {
    const user = userEvent.setup();
    vi.mocked(api.likeReaction).mockRejectedValue(new Error('boom'));
    render(<IllustrationViewer detail={detail} account={reader} />);

    await user.click(screen.getByRole('button', { name: "J'aime" }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: "J'aime" })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the fullscreen overlay and closes it with Escape (FE-2, FE-10)', async () => {
    const user = userEvent.setup();
    render(<IllustrationViewer detail={detail} account={null} />);
    await user.click(screen.getByRole('button', { name: 'Voir en plein écran' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the admin moderation bar only for admins (FE-9)', () => {
    const { rerender } = render(<IllustrationViewer detail={detail} account={null} />);
    expect(screen.queryByText('MODÉRATION')).not.toBeInTheDocument();
    rerender(<IllustrationViewer detail={detail} account={admin} />);
    expect(screen.getByText('MODÉRATION')).toBeInTheDocument();
  });
});
